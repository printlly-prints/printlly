import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import Avatar from "../components/Avatar";
import {
  Badge,
  ErrorNote,
  FilterSelect,
  Loading,
  PageHeader,
  TableShell,
  Td,
  TextFilter,
  Tr,
  formatDate,
} from "../components/ui";

// Every shop on the platform, whatever its state, with the one moderation
// action an admin needs from a list view: pulling a shop offline or
// putting it back.
//
// Verification decisions deliberately are NOT here - those belong to the
// review view on the Vendor Verification page, where the KYC document is
// actually visible. Approving from a table row would mean approving
// without looking.
export default function Shops() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [active, setActive] = useState("");
  const [pending, setPending] = useState(null); // { shop, action }
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("verification_status", status);
      if (active) params.set("is_active", active);
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString();

      const { data } = await api.get(`/admin/shops${query ? `?${query}` : ""}`);
      setShops(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load shops.");
    } finally {
      setLoading(false);
    }
  }, [status, active, search]);

  // Filters re-query the server rather than filtering in memory, so they
  // stay correct once there are more shops than one page holds. The
  // search box is debounced so typing doesn't fire a request per keypress.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const runAction = async () => {
    if (!pending) return;
    setActionError("");
    setWorking(true);
    try {
      const verb = pending.action === "deactivate" ? "deactivate" : "reactivate";
      await api.patch(`/admin/shops/${pending.shop._id}/${verb}`);
      setPending(null);
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not update that shop. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Shops" description="Every shop on the platform, active or not, verified or not." />

      <div className="flex flex-wrap gap-3 mb-4">
        <TextFilter label="Search by name" value={search} onChange={setSearch} placeholder="Shop name" />
        <FilterSelect
          label="Verification"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Any" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <FilterSelect
          label="Active"
          value={active}
          onChange={setActive}
          options={[
            { value: "", label: "Any" },
            { value: "true", label: "Active" },
            { value: "false", label: "Deactivated" },
          ]}
        />
      </div>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading shops..." />
      ) : (
        <TableShell
          headers={["Shop", "Owner", "Orders", "Verification", "Active", "Registered", ""]}
          empty={shops.length === 0 ? "No shops match these filters." : null}
        >
          {shops.map((shop) => (
            <Tr key={shop._id}>
              {/* Photo beside the name rather than in its own column: a
                  storefront is a way of recognising a shop, not a fact
                  about it, and a column of its own would push the ones
                  that are facts further right. */}
              <Td>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={shop.shop_photo_url} alt={`${shop.shop_name} storefront`} kind="shop" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{shop.shop_name}</div>
                    <div className="text-xs text-text-muted">{shop.address}</div>
                  </div>
                </div>
              </Td>
              {/* The owner's photo goes here, next to their own name,
                  rather than in a tooltip or an expandable row: it is a
                  second 28px circle in a cell that already holds two
                  lines about that person, which costs no extra height
                  and needs no interaction to see. A tooltip would hide
                  it behind a hover an admin has no reason to try. */}
              <Td>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    src={shop.owner_photo_url}
                    alt={shop.owner_id?.name ? `${shop.owner_id.name}` : "Shop owner"}
                    kind="owner"
                    size={28}
                  />
                  <div className="min-w-0">
                    <div className="text-text-primary truncate">{shop.owner_id?.name || "—"}</div>
                    <div className="text-xs text-text-muted truncate">{shop.owner_id?.email || "—"}</div>
                  </div>
                </div>
              </Td>
              {/* All-time, every status - see the aggregation in
                  controllers/adminController.js. Not a settlement figure:
                  this counts cancelled and expired orders too. */}
              <Td className="tabular-nums text-text-secondary">{shop.order_count ?? 0}</Td>
              <Td>
                <Badge value={shop.verification_status} />
              </Td>
              <Td>
                <Badge value={shop.is_active ? "active" : "inactive"} />
              </Td>
              <Td className="whitespace-nowrap text-text-secondary">{formatDate(shop.createdAt)}</Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setActionError("");
                    setPending({ shop, action: shop.is_active ? "deactivate" : "reactivate" });
                  }}
                  className={`px-3 py-1.5 rounded-control text-sm font-medium whitespace-nowrap ${
                    shop.is_active
                      ? "border border-error text-error-text hover:bg-error-bg"
                      : "bg-primary text-white hover:bg-primary-deep"
                  }`}
                >
                  {shop.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </Td>
            </Tr>
          ))}
        </TableShell>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.action === "deactivate" ? "Deactivate this shop?" : "Reactivate this shop?"}
          confirmLabel={pending.action === "deactivate" ? "Yes, deactivate" : "Yes, reactivate"}
          destructive={pending.action === "deactivate"}
          loading={working}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={runAction}
        >
          <p>
            <span className="font-medium text-text-primary">{pending.shop.shop_name}</span>
            {pending.action === "deactivate" ? (
              <>
                {" "}
                will stop appearing to customers and won&rsquo;t accept new orders. Orders already placed
                there still need to be completed - deactivating does not cancel them.
              </>
            ) : (
              <> will appear to customers again and can accept new orders.</>
            )}
          </p>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}
