const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const { parsePagination } = require("../utils/pagination");

// Mounted behind the admin router's authentication and role checks.
async function listAccounts(req, res) {
  const { role, search = "" } = req.query;
  if (!["customer", "shop_owner"].includes(role)) {
    return res.status(400).json({ message: "role must be 'customer' or 'shop_owner'" });
  }
  if (typeof search !== "string" || search.length > 120) {
    return res.status(400).json({ message: "Search must be text up to 120 characters." });
  }

  try {
    const filter = { role };
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["name", "email", "phone"].map((field) => ({
        [field]: { $regex: escaped, $options: "i" },
      }));
    }
    const { limit, skip } = parsePagination(req.query);
    const [accounts, total] = await Promise.all([
      User.find(filter)
        // An allowlist prevents password hashes, OAuth IDs and future private fields leaking.
        .select("name email phone role auth_provider createdAt")
        .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    const ids = accounts.map((account) => account._id);
    let rows;
    if (role === "shop_owner") {
      const shops = ids.length ? await Shop.find({ owner_id: { $in: ids } })
        .select("owner_id shop_name address verification_status is_active").lean() : [];
      const byOwner = new Map(shops.map((shop) => [String(shop.owner_id), shop]));
      rows = accounts.map((account) => ({ ...account, shop: byOwner.get(String(account._id)) || null }));
    } else {
      const counts = ids.length ? await Order.aggregate([
        { $match: { customer_id: { $in: ids } } },
        { $group: { _id: "$customer_id", count: { $sum: 1 } } },
      ]) : [];
      const byCustomer = new Map(counts.map((row) => [String(row._id), row.count]));
      rows = accounts.map((account) => ({ ...account, order_count: byCustomer.get(String(account._id)) || 0 }));
    }
    return res.status(200).json({ accounts: rows, total, limit, skip });
  } catch (error) {
    console.error(`Failed to list admin accounts: ${error.message}`);
    return res.status(500).json({ message: "Could not load accounts. Please try again." });
  }
}

module.exports = { listAccounts };
