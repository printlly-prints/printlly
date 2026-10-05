const express = require("express");
const router = express.Router();
const { getPricingConfig } = require("../controllers/pricingController");

// Public - no verifyToken. Anyone should be able to see pricing before
// signing up.
router.get("/", getPricingConfig);

module.exports = router;
