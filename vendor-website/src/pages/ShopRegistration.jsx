import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

// Shown to a logged-in shop owner who hasn't registered a shop yet.
// Submits POST /shops; once the shop exists the owner is sent to
// /shop-profile next to add photos and KYC (see ShopProfile.jsx) - not
// straight to the dashboard, since a shop with no photos and no KYC
// submitted yet has nothing for an admin to review. That page never
// blocks reaching the dashboard, though; it's just the natural next step.
// If a shop is already registered we show it read-only as a simple
// profile view instead.
export default function ShopRegistration() {
  const { shop, registerShop } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ shop_name: "", address: "", contact: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await registerShop(form);
      navigate("/shop-profile", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not register shop. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (shop) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-xl mx-auto px-4 py-8">
          <h1 className="font-heading text-2xl font-bold text-text-primary">Shop Profile</h1>
          <div className="mt-4 bg-surface rounded-panel border border-border p-5 space-y-2 text-sm">
            <p>
              <span className="text-text-secondary">Shop name:</span> {shop.shop_name}
            </p>
            <p>
              <span className="text-text-secondary">Address:</span> {shop.address}
            </p>
            <p>
              <span className="text-text-secondary">Contact:</span> {shop.contact}
            </p>
            <p>
              <span className="text-text-secondary">Status:</span>{" "}
              {shop.is_active ? "Active" : "Inactive"}
            </p>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigate("/orders")}
              className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep"
            >
              Go to orders
            </button>
            <button
              onClick={() => navigate("/shop-profile")}
              className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft"
            >
              Photos & KYC
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Register your shop</h1>
        <p className="text-sm text-text-secondary mt-1">
          Customers can only send you orders once your shop is listed.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 bg-surface rounded-panel border border-border p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Shop name</label>
            <input
              name="shop_name"
              value={form.shop_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Address</label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              required
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Contact number</label>
            <input
              name="contact"
              value={form.contact}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </div>

          {error && (
            <p className="text-sm text-error-text bg-error-bg rounded-control p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
          >
            {loading ? "Registering..." : "Register shop"}
          </button>
        </form>
      </main>
    </div>
  );
}
