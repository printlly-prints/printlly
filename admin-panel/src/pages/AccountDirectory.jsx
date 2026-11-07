import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import Avatar from "../components/Avatar";
import { Badge, ErrorNote, Loading, PageHeader, TableShell, Td, TextFilter, Tr, formatDate } from "../components/ui";

const PAGE_SIZE = 25;

export default function AccountDirectory({ role }) {
  const vendors = role === "shop_owner";
  const title = vendors ? "Vendors" : "Users";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ role, limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      try {
        const response = await api.get(`/admin/accounts?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setData(response.data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.response?.data?.message || "Could not load accounts. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [role, search, page, revision]);

  const changeSearch = (value) => { setSearch(value); setPage(0); };
  const total = data?.total || 0;

  return (
    <AdminLayout>
      <PageHeader title={title} description={vendors
        ? "Shop-owner accounts, their contact details and linked shops."
        : "Customer accounts, contact details and all-time order counts."}>
        <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text-primary hover:border-primary disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {error ? "Retry" : "Refresh"}
        </button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <TextFilter label={`Search ${title.toLowerCase()}`} value={search} onChange={changeSearch} placeholder="Name, email or phone" />
        {!loading && !error && <p className="pb-2 text-sm text-text-secondary" role="status">{total.toLocaleString("en-IN")} {title.toLowerCase()}{search.trim() ? " matching your search" : " registered"}</p>}
      </div>
      <div role="alert"><ErrorNote>{error}</ErrorNote></div>
      {loading ? <Loading label={`Loading ${title.toLowerCase()}…`} /> : !error && data && (
        <>
          <TableShell headers={["Account", "Contact", vendors ? "Linked shop" : "Orders", "Sign-in", "Joined"]}
            empty={data.accounts.length === 0 ? (search.trim() ? `No ${title.toLowerCase()} match your search.` : `No ${title.toLowerCase()} registered yet.`) : null}>
            {data.accounts.map((account) => (
              <Tr key={account._id}>
                <Td><div className="flex items-center gap-3"><Avatar kind="owner" /><div><span className="block font-medium text-text-primary">{account.name}</span><span className="mt-1 block text-xs text-text-muted" title={account._id}>ID {account._id.slice(-8).toUpperCase()}</span></div></div></Td>
                <Td><span className="block text-text-primary">{account.email}</span><span className="mt-1 block text-xs text-text-secondary">{account.phone || "Phone not provided"}</span></Td>
                <Td>{vendors ? (account.shop ? <div><span className="block font-medium text-text-primary">{account.shop.shop_name}</span><span className="mt-1 block text-xs text-text-muted">{account.shop.address}</span><div className="mt-2 flex flex-wrap gap-1.5"><Badge value={account.shop.verification_status} /><Badge value={account.shop.is_active ? "active" : "inactive"} /></div></div> : <span className="text-text-secondary">No shop linked</span>) : <span className="font-medium tabular-nums text-text-primary">{account.order_count.toLocaleString("en-IN")}</span>}</Td>
                <Td className="whitespace-nowrap text-text-secondary">{account.auth_provider === "google" ? "Google" : "Email"}</Td>
                <Td className="whitespace-nowrap text-text-secondary">{formatDate(account.createdAt)}</Td>
              </Tr>
            ))}
          </TableShell>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-secondary" role="status">{total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString("en-IN")}` : "0 accounts"} · Page {page + 1}</p>
            <nav aria-label={`${title} pagination`} className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm hover:border-primary disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm hover:border-primary disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </nav>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
