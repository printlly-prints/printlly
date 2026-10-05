const mongoose = require("mongoose");

// A single support message. Both directions live in one collection -
// sender_role is what distinguishes a customer's message from an
// admin's, and it's what each client uses to decide which side of the
// thread to render a bubble on.
//
// order_context is a SNAPSHOT, not a live reference, for the same reason
// order documents snapshot their services (see models/Order.js): the
// shop's name is stored alongside the id so a thread started from "need
// help with this order" still reads correctly months later, after a
// rename - and still reads correctly if the order itself is eventually
// deleted by the abandoned-order cron.
const messageSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender_role: {
      type: String,
      enum: ["customer", "admin"],
      required: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, "A support message can be at most 2000 characters"],
    },
    // Optional. Set only when the message was sent from an order-specific
    // "need help with this order" entry point, so an admin reading the
    // thread can see what it is about without asking.
    order_context: {
      type: {
        order_id: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
        shop_name: { type: String, trim: true },
      },
      default: null,
      _id: false,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

// Matches how history is always read: one thread, newest first, paged.
messageSchema.index({ conversation_id: 1, created_at: -1 });

module.exports = mongoose.model("Message", messageSchema);
