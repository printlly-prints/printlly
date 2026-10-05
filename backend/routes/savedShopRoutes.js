const express = require("express");
const router = express.Router();
const { saveShop, unsaveShop, getSavedShops } = require("../controllers/savedShopController");
const { verifyToken, requireRole } = require("../middleware/auth");

// Favouriting shops is a customer-only concept - shop owners don't browse
// other shops through this app.
router.post("/", verifyToken, requireRole("customer"), saveShop);
router.delete("/:shopId", verifyToken, requireRole("customer"), unsaveShop);
router.get("/", verifyToken, requireRole("customer"), getSavedShops);

module.exports = router;
