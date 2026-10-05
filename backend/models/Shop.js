const mongoose = require("mongoose");

// GeoJSON point. Kept as its own sub-schema so the whole `location` object
// can default to undefined (see below) while `type` still defaults to
// "Point" whenever a location IS set.
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    // [longitude, latitude] - GeoJSON order, not lat/lng.
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

// A Shop belongs to a User with role "shop_owner".
// Customers only ever browse shops where is_active is true AND
// verification_status is "approved" - see getActiveShops in
// shopController.js.
// A shop can list at most this many services. Not a technical limit - it
// keeps the vendor's own pricing page usable and stops a runaway client
// from growing one document without bound.
const MAX_SERVICES_PER_SHOP = 20;

// One vendor-defined finishing service. _id is kept (unlike the document
// sub-schemas elsewhere in this codebase, which set _id: false) precisely
// because orders snapshot it: it is the stable handle for "which of this
// shop's services was this", surviving a later rename.
const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  // A vendor turns a service off when they temporarily can't do it (the
  // laminator is broken) without losing its name and price. A disabled
  // service is invisible to customers and cannot be ordered.
  enabled: {
    type: Boolean,
    default: true,
  },
});

const shopSchema = new mongoose.Schema(
  {
    // One shop per owner - enforced at the schema level (unique index)
    // as the actual guarantee, since a race (double-submit, two open
    // tabs, or a direct API call) could otherwise slip past an
    // application-level check alone. createShop (shopController.js)
    // still checks explicitly first too, purely to turn that into a
    // clear 409 instead of a raw Mongo duplicate-key error.
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    shop_name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    contact: {
      type: String,
      required: true,
      trim: true,
    },
    // Set by PATCH /shops/me/location. Optional: a shop without one simply
    // has no distance. Defaults to undefined rather than an empty
    // { type: "Point" } - the 2dsphere index below rejects a Point with no
    // coordinates, which would make every new shop fail to save.
    location: {
      type: pointSchema,
      default: undefined,
    },
    // Vendor-entered area/landmark label ("Near Graphic Era University",
    // "Clement Town") - what customers type into search, alongside
    // shop_name and address. See GET /shops ?search=.
    locality: {
      type: String,
      trim: true,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    // Who took the shop offline - null whenever is_active is true. Decides
    // whether the vendor may undo it themselves: a vendor can reverse their
    // own deactivation, but not an admin's (e.g. a policy takedown) - see
    // reactivateMyShop in shopController.js. Shops deactivated before this
    // field existed read back as null and are treated like a vendor's own.
    deactivated_by: {
      type: String,
      enum: ["vendor", "admin", null],
      default: null,
    },
    // Public-facing photos (POST /shops/me/photos) - ordinary public
    // Cloudinary uploads, shown on customer-facing shop cards. Nothing
    // sensitive here, unlike kyc below.
    owner_photo_url: {
      type: String,
      default: null,
    },
    shop_photo_url: {
      type: String,
      default: null,
    },
    // Submitted via POST /shops/me/kyc, reviewed via PATCH /shops/:id/
    // verify. This whole sub-document is sensitive and must never be
    // returned wholesale to a client - see getMyShop, which strips the
    // file reference before responding even to the shop's own owner.
    kyc: {
      id_proof_type: {
        type: String,
        enum: ["aadhaar", "pan", "other"],
      },
      // Despite the name (kept to match the field this was specified
      // as), this is NOT a working URL - it's the Cloudinary public_id
      // of an asset uploaded with type: "authenticated" (a government
      // ID must not be reachable via a guessable public link). An
      // authenticated asset always needs a freshly signed, time-limited
      // URL generated at request time (see utils/kycFileAccess.js), so
      // persisting an actual URL here would either not work on its own
      // or be a signature that has since expired - the identifier is
      // the only thing worth keeping. Never included in any API
      // response.
      id_proof_url: {
        type: String,
      },
      // Needed alongside id_proof_url to correctly sign a delivery URL
      // later - the id proof can be an image or a PDF, and Cloudinary
      // signs those under different resource types, so this can't be
      // inferred from id_proof_type alone.
      id_proof_resource_type: {
        type: String,
        enum: ["image", "raw"],
      },
      gst_number: {
        type: String,
      },
    },
    // Set by PATCH /shops/:id/verify (admin-only). A shop only appears
    // in the customer-facing listing once this is "approved" - see
    // getActiveShops.
    verification_status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // Shown to the vendor on their own dashboard when rejected - cleared
    // (set back to null) whenever verification_status leaves "rejected".
    rejection_reason: {
      type: String,
      default: null,
    },
    // Per-shop, vendor-controlled pricing. This is what POST /orders
    // actually charges from - see utils/pricing.js and orderController.js.
    // The global Settings model's rate fields are no longer read there at
    // all; they now exist only as the one-time seed values copied into a
    // new shop's pricing at POST /shops (see createShop in
    // shopController.js), after which the two are completely independent.
    //
    // Defaults below mirror Settings' own current defaults, purely so an
    // already-existing shop document from before this field existed still
    // reads back sensible, non-null pricing (Mongoose backfills schema
    // defaults for paths missing on an old document) rather than an order
    // at that shop suddenly computing NaN/0 charges. New shops never rely
    // on these defaults - createShop always sets every field explicitly.
    //
    // platform_fee is deliberately NOT part of this sub-object: it's the
    // platform's own commission, not a vendor decision, and stays entirely
    // on the global Settings model (see computePlatformFee) - a vendor has
    // no route that can read or change it.
    pricing: {
      rate_per_page_bw: { type: Number, required: true, min: 0, default: 2 },
      rate_per_page_color: { type: Number, required: true, min: 0, default: 8 },
      paper_size_rates: {
        A4: { type: Number, required: true, min: 0, default: 0 },
        A3: { type: Number, required: true, min: 0, default: 5 },
      },
      // Flat extra charged PER PAGE PRINTED (pages x copies) when a
      // document is double-sided, set by the vendor directly - not a
      // percentage of anything. This was sides_surcharge_percent, a % of
      // the page subtotal, which meant a vendor could not simply say what
      // duplex costs them: the real number moved every time they touched
      // their per-page rate. Every other charge on a shop (per-page,
      // paper size, each service) is a rupee amount the vendor types in;
      // this now matches. No upper bound, for the same reason the paper
      // rates have none - it is a price, not a proportion.
      sides_extra_rate: { type: Number, required: true, min: 0, default: 1 },
      // Flat finishing services, charged once per DOCUMENT that selects
      // one. Fully vendor-defined: a shop lists whatever it actually
      // offers ("Matte Lamination", "Hole Punching", "Perfect Binding"),
      // rather than picking from three names this codebase invented.
      //
      // Each entry keeps its own _id, which is what an order snapshots
      // (see Order.documents[].services) - renaming, re-pricing or
      // deleting a service never rewrites history, because an order
      // stores the name and rate it was actually sold at rather than a
      // live reference.
      //
      // Deliberately NOT prefilled from Settings' service_rates at shop
      // creation (see createShop): a new shop starts with an empty list
      // and the vendor adds what they genuinely offer, rather than
      // inheriting names and prices they never chose.
      services: {
        type: [serviceSchema],
        default: [],
        validate: {
          validator: (list) => list.length <= MAX_SERVICES_PER_SHOP,
          message: `A shop can list at most ${MAX_SERVICES_PER_SHOP} services`,
        },
      },
    },
    // How the shop is CURRENTLY trading - entirely separate from
    // is_active/verification_status above, which control whether it
    // appears at all. A shop can be active and approved (so customers can
    // find it) while closed (so it shouldn't be ordered from right now)
    // or busy (so it SHOULD still be ordered from, just with a longer
    // estimate).
    //
    // This is the single stored source of truth for availability.
    // Nothing in this codebase should read it directly to decide whether
    // a shop can take an order: always go through computeShopAvailability
    // (utils/shopStatus.js), which also applies business_hours below and
    // expires a timed Busy.
    //
    //   "open"   - accepting orders, normal preparation
    //   "busy"   - STILL ACCEPTING ORDERS, longer preparation. Busy is
    //              not a kind of closed, and it is not an order status;
    //              the pending -> accepted -> ready_for_pickup ->
    //              completed lifecycle is untouched by it.
    //   "closed" - not accepting new orders
    shop_status: {
      type: String,
      enum: ["open", "busy", "closed"],
      // A function, not a literal, so shops written before this field
      // existed read back as whatever their old is_open said rather than
      // all snapping to "open" - including any shop a vendor had left
      // closed. This is the same no-.lean() default backfilling the
      // customer-facing queries already depend on (see getActiveShops).
      default: function () {
        return this.is_open === false ? "closed" : "open";
      },
    },
    // When a timed Busy lapses. Null means the vendor chose "Until I turn
    // it off", which is the default - that one never expires on its own.
    //
    // Expiry is applied when availability is READ
    // (computeShopAvailability), not by a scheduled job: there is no
    // worker in this deployment, and a lapsed timestamp that only a cron
    // could clear would leave the customer app showing Busy for as long
    // as the cron was down. Read-time means the shop is Open again the
    // instant the clock passes it, on every surface at once.
    busy_until: {
      type: Date,
      default: null,
    },
    // What to tell customers to expect while busy, in minutes. Null falls
    // back to DEFAULT_BUSY_PREP_MINUTES (utils/shopStatus.js).
    busy_prep_minutes: {
      type: Number,
      min: 1,
      max: 240,
      default: null,
    },
    // DEPRECATED - superseded by shop_status above, and read in exactly
    // one place: that field's default, to seed a value for documents
    // written before it existed. It is no longer written, so it WILL go
    // stale on any shop whose status has changed since; never read it for
    // anything else. PATCH /shops/me/status still ACCEPTS an is_open
    // boolean from older clients, but translates it to shop_status.
    is_open: {
      type: Boolean,
      default: true,
    },
    // Where this vendor is paid, for transfers an admin makes BY HAND
    // outside this platform (UPI or a bank transfer). No money moves
    // through this system and nothing here is sent to a payment gateway
    // - these are the details a human reads off the screen before making
    // a transfer themselves. See models/Settlement.js.
    //
    // NEVER selected by any customer-facing query: every one of those
    // uses an inclusion-list .select() (see getActiveShops,
    // getShopById, comparePricing, getSavedShops), so this is not
    // reachable by omission - it has to be explicitly asked for, and the
    // only places that do are the owner's own routes and the admin
    // settlement detail route.
    //
    // Every field is optional: a vendor can trade for months before
    // giving bank details, and half-filled details (a UPI id but no
    // account yet) are a normal state, not an error. What is NOT allowed
    // is a malformed IFSC - that is validated in PATCH /shops/me/payout.
    payout: {
      account_holder_name: { type: String, trim: true, default: "" },
      // Stored as the vendor typed it. Deliberately not normalised or
      // partially masked at rest: an admin has to read this back
      // character-for-character to make a real transfer, and a masked
      // store would make that impossible.
      account_number: { type: String, trim: true, default: "" },
      // Always stored upper-case (the controller upper-cases it), since
      // IFSC codes are canonically upper-case and a vendor typing
      // lower-case should not produce a second, different-looking value
      // for the same bank branch.
      ifsc_code: { type: String, trim: true, default: "" },
      upi_id: { type: String, trim: true, default: "" },
      // When these details last changed. Paired with PayoutHistory,
      // which records that a change happened without recording the
      // values - an account number changed shortly before a large
      // settlement is the thing an admin should notice.
      updated_at: { type: Date, default: null },
    },
    // Optional automatic schedule. When enabled is false, shop_status
    // above is purely a manual choice - open_time/close_time are ignored
    // (they may not even be set yet). When enabled is true, the shop is
    // closed outside [open_time, close_time) in IST no matter what
    // shop_status says - the manual choice still lets a vendor close for
    // a one-off reason (e.g. a holiday) without touching their schedule,
    // and a Busy shop outside its hours reads as closed, not busy. See
    // computeShopAvailability for the exact rule.
    business_hours: {
      // "HH:MM", 24-hour, e.g. "09:00" / "21:00". Validated as such in
      // PATCH /shops/me/status (shopController.js) - not schema-level
      // regex here, so an invalid stored value fails loudly there with a
      // clear message rather than a generic Mongoose CastError.
      open_time: { type: String, default: null },
      close_time: { type: String, default: null },
      enabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Required by $geoNear in GET /shops and POST /shops/compare-pricing
// (?lat/&lng). 2dsphere indexes skip documents with no location, so shops
// that never set one are unaffected.
shopSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Shop", shopSchema);
