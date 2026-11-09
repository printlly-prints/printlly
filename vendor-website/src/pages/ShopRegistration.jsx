import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import ShopLocationFields from "../components/ShopLocationFields";
import { initialLocation, parseCoordinates } from "../utils/shopLocation";

// Shown to a logged-in shop owner who hasn't registered a shop yet.
// Submits POST /shops; once the shop exists the owner is sent to
// /shop-profile next to add photos and KYC (see ShopProfile.jsx) - not
// straight to the dashboard, since a shop with no photos and no KYC
// submitted yet has nothing for an admin to review. That page never
// blocks reaching the dashboard, though; it's just the natural next step.
// If a shop is already registered we show it read-only as a simple
// profile view instead.
export default function ShopRegistration() {
  const { shop, user, registerShop } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    shop_name: "",
    contact: user?.phone || "",
  });
  const [location, setLocation] = useState(() => initialLocation(null));
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const coordinates = parseCoordinates(location.latitude, location.longitude);
    if (!location.google_maps_url || !location.address.trim()) {
      setError(
        "Paste your Google Maps link and confirm your shop's address before registering.",
      );
      return;
    }
    setLoading(true);
    try {
      await registerShop({
        shop_name: form.shop_name.trim(),
        contact: form.contact.trim(),
        address: [unit.trim(), location.address].filter(Boolean).join(", "),
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
        locality: location.locality,
        google_maps_url: location.google_maps_url,
        google_maps_embed_url: location.google_maps_embed_url,
      });
      navigate("/shop-profile", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not register shop. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (shop) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-xl mx-auto px-4 py-8">
          <h1 className="font-heading text-2xl font-bold text-text-primary">
            Shop Profile
          </h1>
          <div className="mt-4 bg-surface rounded-panel border border-border p-5 space-y-2 text-sm">
            <p>
              <span className="text-text-secondary">Shop name:</span>{" "}
              {shop.shop_name}
            </p>
            <p>
              <span className="text-text-secondary">Address:</span>{" "}
              {shop.address}
            </p>
            <p>
              <span className="text-text-secondary">Contact:</span>{" "}
              {shop.contact}
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
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-5 lg:gap-16 lg:py-12">
        <aside className="hidden self-start lg:sticky lg:top-24 lg:col-span-2 lg:block">
          <p className="text-sm font-medium text-primary">Partner workspace</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Your shop,
            <br />
            on Paprout.
          </h2>
          <ol aria-label="Shop setup steps" className="mt-8 space-y-6">
            {[
              [
                "Shop details & location",
                "Name your shop and link its Google Maps listing.",
              ],
              [
                "Photos & verification",
                "Add your storefront and verification documents.",
              ],
              [
                "Print rates & services",
                "Set your prices and finishing options.",
              ],
            ].map(([title, hint], index) => (
              <li
                key={title}
                className="flex gap-3"
                aria-current={index === 0 ? "step" : undefined}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-medium ${index === 0 ? "border-primary bg-primary-wash text-primary-deep" : "border-border bg-surface text-text-muted"}`}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {hint}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <figure className="mt-8 overflow-hidden rounded-panel bg-busy-bg">
            <img
              src="/art/vendor/setup-location-male-v2.webp"
              alt="A print partner checking his shop location"
              width="1536"
              height="1024"
              className="block w-full"
            />
            <figcaption className="border-t border-busy-border px-4 py-3 text-xs leading-5 text-busy-text">
              Connect the Google listing your customers already know.
            </figcaption>
          </figure>
        </aside>
        <section className="min-w-0 lg:col-span-3">
          <p className="mb-2 text-sm font-medium text-primary">
            Step 1 · Shop details
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Register your shop
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-text-secondary">
            Add your shop name and connect its Google Maps listing.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-surface rounded-panel border border-border p-6 space-y-5 shadow-card"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="shop-name"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Shop name
                </label>
                <input
                  name="shop_name"
                  id="shop-name"
                  autoComplete="organization"
                  placeholder="Your shop's name"
                  value={form.shop_name}
                  onChange={handleChange}
                  required
                  pattern=".*\S.*"
                  className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>

              <div>
                <label
                  htmlFor="shop-contact"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Contact number
                </label>
                <input
                  name="contact"
                  id="shop-contact"
                  type="tel"
                  autoComplete="tel"
                  value={form.contact}
                  onChange={handleChange}
                  required
                  pattern=".*\S.*"
                  className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <h2 className="mb-3 flex items-center justify-between text-base font-semibold">
                Where is your shop?
                <span className="text-xs font-normal text-text-muted">
                  Required
                </span>
              </h2>
              <ShopLocationFields value={location} onChange={setLocation} />
            </div>
            <div>
              <label
                htmlFor="shop-unit"
                className="mb-2 block text-sm font-medium"
              >
                Shop / floor number{" "}
                <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="shop-unit"
                value={unit}
                maxLength={100}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="e.g. Shop 12, ground floor"
                className="w-full rounded-control border border-border px-3 py-2 text-sm"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="text-sm text-error-text bg-error-bg rounded-control p-3"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-5 px-5 py-2.5 rounded-control bg-primary text-white text-sm font-semibold hover:bg-primary-deep disabled:opacity-50 transition-colors"
            >
              {loading ? "Registering..." : "Register shop"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="mt-4 text-xs leading-5 text-text-muted">
            Your shop will need approval before customers can place orders.
          </p>
        </section>
      </main>
    </div>
  );
}
