const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Order = require("../models/Order");
const User = require("../models/User");
const {
  SupportError,
  getOrCreateConversation,
  sendSupportMessage,
  markConversationRead,
} = require("../utils/supportMessaging");

// REST half of customer support. These routes are NOT a second
// implementation of the socket protocol - sending goes through the exact
// same sendSupportMessage() the socket handler calls, broadcast
// included, so a message posted here still lands live on an admin's
// screen. What REST is actually for is the two things a socket is bad
// at: the initial history load when a screen opens, and sending at all
// when the socket isn't connected (cold start, dropped wifi, an admin
// panel tab that was asleep).

// How many messages one page of history returns. A support thread is
// read newest-first and almost never scrolled far back, so the first
// page is meant to cover the whole visible conversation in one request.
const PAGE_SIZE = 50;

// Newest-first from the database (that's the indexed order, and it's
// what "most recent 50" means), reversed before going out so the client
// receives them oldest-first and can render straight down the screen.
async function readHistory(conversationId, before) {
  const filter = { conversation_id: conversationId };

  // ?before=<ISO timestamp> pages backwards. Keyed on created_at rather
  // than a skip offset because messages arrive while you read: with skip,
  // a message sent between two page loads shifts everything down one and
  // the reader sees a duplicate.
  if (before !== undefined) {
    const beforeDate = new Date(before);
    if (Number.isNaN(beforeDate.getTime())) {
      throw new SupportError(400, "before must be a valid date");
    }
    filter.created_at = { $lt: beforeDate };
  }

  // One extra row, purely to answer "is there more?" without a second
  // count query over the same index.
  const rows = await Message.find(filter).sort({ created_at: -1 }).limit(PAGE_SIZE + 1).lean();
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    messages: page.reverse(),
    has_more: hasMore,
    // What to send back as ?before to get the page before this one. null
    // when there is nothing older, so the client doesn't have to work
    // that out from the array itself.
    oldest_created_at: page.length ? page[0].created_at : null,
  };
}

// GET /support/conversation
// The customer's own thread, created on the spot if this is their first
// visit - so the app never has to "start" a conversation as a separate
// step before it can show the screen.
const getMyConversation = async (req, res) => {
  try {
    const conversation = await getOrCreateConversation(req.user.id);
    const history = await readHistory(conversation._id, req.query.before);

    res.status(200).json({ conversation, ...history });
  } catch (error) {
    if (error instanceof SupportError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(`Failed to fetch support conversation: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch support conversation" });
  }
};

// POST /support/conversation/messages
// The socket 'support:send' event's REST twin, for when no socket is up.
const postMyMessage = async (req, res) => {
  try {
    const { message } = await sendSupportMessage({
      customerId: req.user.id,
      senderRole: "customer",
      senderId: req.user.id,
      text: req.body.text,
      orderContext: req.body.order_context,
    });
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof SupportError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(`Failed to send support message: ${error.message}`);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// PATCH /support/conversation/read
// The customer side of 'support:mark_read'. Not in the original route
// list, but its absence would mean a customer who read their thread over
// REST (no socket) could never clear their own badge.
const markMyConversationRead = async (req, res) => {
  try {
    const conversation = await markConversationRead(req.user.id, "customer");
    if (!conversation) {
      return res.status(404).json({ message: "No support conversation yet" });
    }
    res.status(200).json(conversation);
  } catch (error) {
    console.error(`Failed to mark support conversation read: ${error.message}`);
    res.status(500).json({ message: "Failed to mark as read" });
  }
};

// --- Admin side ----------------------------------------------------------
// Mounted under /admin/support (see routes/adminRoutes.js), which is
// where the admin-only auth is applied - once, at the router level.

// GET /admin/support/conversations
// The inbox: every thread, the one that spoke most recently at the top.
const listConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .populate("customer_id", "name phone email")
      .sort({ last_message_at: -1 })
      .lean();

    // One query for the previews instead of one per conversation: an
    // aggregation over all messages taking the newest per thread, which
    // the { conversation_id, created_at } index already orders.
    const ids = conversations.map((c) => c._id);
    const latest = await Message.aggregate([
      { $match: { conversation_id: { $in: ids } } },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: "$conversation_id",
          text: { $first: "$text" },
          sender_role: { $first: "$sender_role" },
          created_at: { $first: "$created_at" },
        },
      },
    ]);
    const previewByConversation = new Map(latest.map((row) => [String(row._id), row]));

    res.status(200).json(
      conversations.map((c) => {
        const preview = previewByConversation.get(String(c._id));
        return {
          _id: c._id,
          // Flattened rather than left as a populated sub-document: this
          // is a table row, and the customer is one column of it.
          customer: c.customer_id
            ? {
                _id: c.customer_id._id,
                name: c.customer_id.name,
                phone: c.customer_id.phone || null,
                email: c.customer_id.email,
              }
            : null,
          last_message: preview
            ? {
                text: preview.text.length > 140 ? `${preview.text.slice(0, 140)}...` : preview.text,
                sender_role: preview.sender_role,
                created_at: preview.created_at,
              }
            : null,
          unread_by_admin: c.unread_by_admin,
          last_message_at: c.last_message_at,
          created_at: c.created_at,
        };
      })
    );
  } catch (error) {
    console.error(`Failed to list support conversations: ${error.message}`);
    res.status(500).json({ message: "Failed to list support conversations" });
  }
};

// GET /admin/support/conversations/:customerId
// One thread in full, plus the context an admin needs in order to
// actually answer it: who this customer is, and what they have ordered
// recently. Returned together in one response deliberately - an admin
// opening a complaint about an order should not have to go and look that
// order up on another screen to see it.
const getConversationDetail = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await User.findOne({ _id: customerId, role: "customer" })
      .select("name phone email createdAt")
      .lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Created here if it doesn't exist, so an admin can open a thread
    // with a customer who has never written in - the same get-or-create
    // the customer's own route uses.
    const conversation = await getOrCreateConversation(customerId);
    const history = await readHistory(conversation._id, req.query.before);

    // The same shape and the same populated fields GET /admin/orders
    // returns, filtered to this customer - so the admin panel can render
    // these rows with the component it already has for that list.
    const orders = await Order.find({ customer_id: customerId })
      .populate("shop_id", "shop_name")
      .populate("customer_id", "name phone")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({
      conversation,
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone || null,
        email: customer.email,
        account_created_at: customer.createdAt,
      },
      recent_orders: orders,
      ...history,
    });
  } catch (error) {
    if (error instanceof SupportError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(`Failed to fetch support conversation detail: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch conversation" });
  }
};

// POST /admin/support/conversations/:customerId/messages
const postAdminMessage = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    // Checked before sending, because getOrCreateConversation would
    // happily upsert a thread against a syntactically valid id belonging
    // to nobody and leave an orphan conversation in the inbox.
    const exists = await User.exists({ _id: customerId, role: "customer" });
    if (!exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const { message } = await sendSupportMessage({
      customerId,
      senderRole: "admin",
      senderId: req.user.id,
      text: req.body.text,
      orderContext: req.body.order_context,
    });
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof SupportError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(`Failed to send admin support message: ${error.message}`);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// PATCH /admin/support/conversations/:customerId/read
const markConversationReadByAdmin = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const conversation = await markConversationRead(customerId, "admin");
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.status(200).json(conversation);
  } catch (error) {
    console.error(`Failed to mark support conversation read: ${error.message}`);
    res.status(500).json({ message: "Failed to mark as read" });
  }
};

module.exports = {
  getMyConversation,
  postMyMessage,
  markMyConversationRead,
  listConversations,
  getConversationDetail,
  postAdminMessage,
  markConversationReadByAdmin,
};
