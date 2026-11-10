import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import api from "../api/axios";
import useOrderEvents from "../hooks/useOrderEvents";

export default function Notifications() {
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [revision, setRevision] = useState(0);
  useOrderEvents((event) => {
    if (!event || event.event === "PAYMENT_CONFIRMED") setRevision((value) => value + 1);
  });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .get("/notifications", { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setItems(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err.response?.data?.message ||
              "Couldn't load notifications. Please retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  async function markRead(id) {
    setWorking(true);
    setError("");
    try {
      await api.patch(
        id ? `/notifications/${id}/read` : "/notifications/read-all",
      );
      setItems((current) =>
        current.map((item) =>
          !id || item._id === id ? { ...item, read: true } : item,
        ),
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not update notifications.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              New orders, shop verification and account updates. Showing your latest 50
              notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm hover:border-primary disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        </header>
        {error && (
          <p
            role="alert"
            className="rounded-control bg-error-bg p-3 text-sm text-error-text"
          >
            {error}
          </p>
        )}
        {loading ? (
          <p
            role="status"
            className="py-12 text-center text-sm text-text-secondary"
          >
            Loading notifications…
          </p>
        ) : (
          (items.length > 0 || !error) && (
            <section className="overflow-hidden rounded-panel border border-border bg-surface">
              {items.some((item) => !item.read) && (
                <div className="flex justify-end border-b border-border px-5 py-3">
                  <button
                    disabled={working}
                    onClick={() => markRead()}
                    className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary disabled:opacity-50"
                  >
                    <Check size={16} aria-hidden="true" />
                    Mark all as read
                  </button>
                </div>
              )}
              {!items.length ? (
                <div className="flex flex-wrap items-center justify-center gap-4 px-6 py-8">
                  <img
                    src="/art/vendor/notifications-v1.webp"
                    alt=""
                    width="1536"
                    height="1024"
                    className="h-24 w-36 shrink-0 object-contain"
                  />
                  <div>
                    <h2 className="font-semibold">You're all caught up</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Your shop updates will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li
                      key={item._id}
                      className={`flex gap-3 px-5 py-4 ${item.read ? "" : "bg-primary-wash/50"}`}
                    >
                      <span
                        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-border" : "bg-primary"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold">{item.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          {item.body}
                        </p>
                        {item.type === "vendor_new_order" && (
                          <Link to="/orders?status=pending" className="mt-2 inline-block text-sm font-semibold text-primary">
                            View pending orders
                          </Link>
                        )}
                        <time
                          className="mt-2 block text-xs text-text-muted"
                          dateTime={item.created_at}
                        >
                          {new Date(item.created_at).toLocaleString("en-IN")}
                        </time>
                        {!item.read && (
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => markRead(item._id)}
                            className="mt-2 min-h-10 text-sm font-medium text-primary disabled:opacity-50"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
