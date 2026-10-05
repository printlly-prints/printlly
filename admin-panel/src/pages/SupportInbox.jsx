import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import { useSupport } from "../context/SupportContext";
import { Badge, ErrorNote, Loading, PageHeader, formatDate, formatRupees } from "../components/ui";

// "4m", "3h", "2d" - a support queue is read by how stale a thread is,
// not by what time it arrived, and a relative figure answers that
// without the reader doing arithmetic. The exact timestamp is still in
// the title attribute for anyone who needs it.
function relativeTime(value) {
  if (!value) return "";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function messageTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// The support inbox: every conversation on the left, the open thread in
// the middle, and who the customer is on the right.
//
// The three panels are one screen rather than three pages deliberately.
// An admin answering "where are my prints?" needs the customer's recent
// orders in front of them as they type; making that a separate lookup is
// how support replies end up asking the customer for information the
// platform already has.
export default function SupportInbox() {
  const {
    conversations,
    loadingList,
    listError,
    connected,
    refreshList,
    openConversation,
    closeConversation,
    subscribeToMessages,
    sendMessage,
    markRead,
  } = useSupport();

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const threadRef = useRef(null);

  // Same dedupe-and-sort the app uses: a message can arrive over the
  // socket and again in a history fetch that raced it.
  const mergeMessages = (existing, incoming) => {
    const byId = new Map(existing.map((m) => [String(m._id), m]));
    for (const message of incoming) byId.set(String(message._id), message);
    return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  };

  const loadDetail = useCallback(async (customerId) => {
    setLoadingDetail(true);
    setDetailError("");
    try {
      const { data } = await api.get(`/admin/support/conversations/${customerId}`);
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setDetailError(err.response?.data?.message || "Could not open this conversation.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Selecting a conversation joins its room, loads it, and marks it
  // read; moving away leaves the room again. Without the leave, an admin
  // who has clicked through ten threads would be receiving live messages
  // for all ten.
  useEffect(() => {
    if (!selectedId) return undefined;

    openConversation(selectedId);
    loadDetail(selectedId);
    markRead(selectedId);
    setDraft("");
    setSendError("");

    return () => closeConversation(selectedId);
  }, [selectedId, openConversation, closeConversation, loadDetail, markRead]);

  // Live messages for whichever thread is open. Anything for another
  // conversation is ignored here - the left-hand list handles those
  // through 'support:notification' instead.
  useEffect(() => {
    if (!selectedId || !detail?.conversation?._id) return undefined;

    return subscribeToMessages((message) => {
      if (String(message.conversation_id) !== String(detail.conversation._id)) return;
      setDetail((current) =>
        current ? { ...current, messages: mergeMessages(current.messages, [message]) } : current
      );
      // Read as it lands, since the admin is looking straight at it.
      if (message.sender_role === "customer") markRead(selectedId);
    });
  }, [selectedId, detail?.conversation?._id, subscribeToMessages, markRead]);

  // Newest sits at the bottom, so that is where the thread should be.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.messages?.length, selectedId]);

  const onSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || !selectedId) return;

    setSending(true);
    setSendError("");
    setDraft("");
    const result = await sendMessage(selectedId, text);
    setSending(false);

    if (!result.ok) {
      // Put it back rather than losing what was typed.
      setDraft(text);
      setSendError(result.message || "Couldn't send that message.");
      return;
    }

    // With a socket, the reply comes back through the room and the
    // subscription above places it. Over the REST fallback there is no
    // broadcast reaching this client, so it has to be placed here.
    if (result.message) {
      setDetail((current) =>
        current ? { ...current, messages: mergeMessages(current.messages, [result.message]) } : current
      );
    }
    refreshList();
  };

  // The order a message refers to, if it came from the app's "Need help
  // with this order?" button. The amount is looked up from the customer's
  // order history in this same response - order_context only snapshots
  // the id and the shop name, which is all the thread needs to stay
  // correct after a rename.
  const orderFor = (orderId) =>
    (detail?.recent_orders || []).find((o) => String(o._id) === String(orderId)) || null;

  return (
    <AdminLayout>
      <PageHeader
        title="Support"
        description="Live chat with customers. Their recent orders are shown alongside each conversation."
      >
        {/* Stated only when it's down. Messages still send over REST in
            that state - what's lost is instant delivery, not the reply. */}
        {!connected && (
          <span className="text-xs text-text-secondary bg-background-soft rounded-full px-3 py-1">
            Reconnecting - updates may lag
          </span>
        )}
      </PageHeader>

      <ErrorNote>{listError}</ErrorNote>

      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_18rem]">
        {/* ---------------------------------------------- conversations */}
        <div className="bg-surface border border-border rounded-panel overflow-hidden flex flex-col lg:h-[calc(100vh-11rem)]">
          <div className="px-4 py-2.5 border-b border-border bg-background-soft flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Conversations</span>
            <button
              type="button"
              onClick={refreshList}
              className="text-xs text-primary-bright hover:text-primary-deep font-medium"
            >
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList && conversations.length === 0 ? (
              <Loading />
            ) : conversations.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-text-secondary">
                No one has written in yet.
              </p>
            ) : (
              <ul>
                {conversations.map((c) => {
                  const id = String(c.customer?._id || "");
                  const active = id === selectedId;
                  const unread = c.unread_by_admin || 0;
                  return (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(id)}
                        className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
                          active ? "bg-primary-wash" : "hover:bg-background-soft"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm truncate ${
                              unread > 0 ? "font-semibold text-text-primary" : "font-medium text-text-primary"
                            }`}
                          >
                            {c.customer?.name || "Unknown customer"}
                          </span>
                          <span
                            className="text-xs text-text-muted shrink-0"
                            title={formatDate(c.last_message_at)}
                          >
                            {relativeTime(c.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span
                            className={`text-xs truncate ${
                              unread > 0 ? "text-text-primary" : "text-text-secondary"
                            }`}
                          >
                            {/* Who spoke last matters as much as what they
                                said - it's the difference between a thread
                                that's waiting on us and one that isn't. */}
                            {c.last_message
                              ? `${c.last_message.sender_role === "admin" ? "You: " : ""}${c.last_message.text}`
                              : "No messages yet"}
                          </span>
                          {unread > 0 && (
                            <span className="shrink-0 min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-primary text-white text-[11px] font-semibold text-center">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------- thread */}
        <div className="bg-surface border border-border rounded-panel overflow-hidden flex flex-col lg:h-[calc(100vh-11rem)] min-h-[24rem]">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center px-6 text-center">
              <p className="text-sm text-text-secondary">
                Pick a conversation on the left to read it and reply.
              </p>
            </div>
          ) : loadingDetail && !detail ? (
            <Loading label="Opening conversation..." />
          ) : detailError ? (
            <div className="p-4">
              <ErrorNote>{detailError}</ErrorNote>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border bg-background-soft">
                <p className="text-sm font-medium text-text-primary">{detail?.customer?.name}</p>
                <p className="text-xs text-text-secondary">
                  {detail?.customer?.phone || detail?.customer?.email}
                </p>
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {detail?.has_more && (
                  <p className="text-center text-xs text-text-muted pb-2">
                    Older messages exist - only the most recent 50 are shown.
                  </p>
                )}

                {(detail?.messages || []).length === 0 ? (
                  <p className="text-center text-sm text-text-secondary py-10">
                    Nothing here yet. Say hello.
                  </p>
                ) : (
                  detail.messages.map((m) => (
                    <Message key={m._id} message={m} order={orderFor(m.order_context?.order_id)} />
                  ))
                )}
              </div>

              {sendError && (
                <p className="px-4 pb-1 text-xs text-error-text">{sendError}</p>
              )}

              <form onSubmit={onSend} className="border-t border-border p-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line - the
                    // convention in every chat tool, and support replies
                    // are mostly one line.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend(e);
                    }
                  }}
                  rows={2}
                  // The server refuses more, so the limit is visible
                  // before sending rather than after.
                  maxLength={2000}
                  placeholder="Write a reply..."
                  className="flex-1 resize-none px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50 disabled:hover:bg-primary"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          )}
        </div>

        {/* -------------------------------------------- customer context */}
        <div className="xl:h-[calc(100vh-11rem)] xl:overflow-y-auto">
          {selectedId && detail ? (
            <CustomerPanel customer={detail.customer} orders={detail.recent_orders} />
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}

// One message. Side and colour both carry the sender, since side alone
// is a weak signal once a bubble is wide.
function Message({ message, order }) {
  const mine = message.sender_role === "admin";
  const context = message.order_context;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        {/* The order this message is about, shown at the point in the
            thread where it was raised rather than only in the sidebar -
            a customer can reference a second order later in the same
            conversation, and the reference belongs with the message. */}
        {context?.order_id && (
          <div
            className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 mb-1 border ${
              mine
                ? "bg-primary-wash border-primary/20 text-primary-deep"
                : "bg-background-soft border-border text-text-secondary"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h12l4 4v12H4z" />
              <path d="M8 10h8M8 14h5" />
            </svg>
            <span>
              Re: Order at {context.shop_name || "a shop"}
              {/* The amount comes from the customer's order history in
                  the same response. Omitted rather than guessed when the
                  order is older than the last 10. */}
              {order ? ` — ${formatRupees(order.total_amount)}` : ""}
            </span>
          </div>
        )}
        <div
          className={`rounded-card px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            mine ? "bg-primary text-white" : "bg-background-soft text-text-primary border border-border"
          }`}
        >
          {message.text}
        </div>
        <p
          className={`text-[11px] text-text-muted mt-0.5 ${mine ? "text-right" : "text-left"}`}
          title={formatDate(message.created_at)}
        >
          {messageTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

// Who the admin is talking to, and what they have bought. Enough to
// answer most support questions without opening the Orders table.
function CustomerPanel({ customer, orders }) {
  return (
    <div className="bg-surface border border-border rounded-panel overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-background-soft">
        <span className="text-sm font-medium text-text-secondary">Customer</span>
      </div>

      <div className="px-4 py-3 space-y-2 border-b border-border">
        <Field label="Name" value={customer?.name} />
        <Field label="Phone" value={customer?.phone} />
        <Field label="Email" value={customer?.email} />
        <Field label="Customer since" value={formatDate(customer?.account_created_at)} />
      </div>

      <div className="px-4 py-2.5 border-b border-border bg-background-soft">
        <span className="text-sm font-medium text-text-secondary">
          Recent orders{orders?.length ? ` (${orders.length})` : ""}
        </span>
      </div>

      {!orders?.length ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">
          This customer hasn&rsquo;t placed an order yet.
        </p>
      ) : (
        <ul>
          {orders.map((order) => (
            <li key={order._id} className="px-4 py-3 border-b border-border last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {order.shop_id?.shop_name || "Unknown shop"}
                </span>
                <span className="text-sm text-text-primary shrink-0">
                  {formatRupees(order.total_amount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <Badge value={order.status} />
                <span className="text-xs text-text-muted" title={formatDate(order.createdAt)}>
                  {relativeTime(order.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm text-text-primary break-words">{value || "—"}</p>
    </div>
  );
}
