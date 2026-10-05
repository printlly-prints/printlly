require("dotenv").config();
const mongoose = require("mongoose");

// One-off migration: Shop.pricing.sides_surcharge_percent (a percentage
// of the page subtotal) becomes Shop.pricing.sides_extra_rate (a flat
// rupee amount per page printed, which the vendor sets directly).
//
// The conversion is
//
//   sides_extra_rate = round2(rate_per_page_bw x sides_surcharge_percent / 100)
//
// which is what the old rule actually charged for a B&W page. That makes
// it exact for B&W - the common case, and what most shops price around -
// and an approximation for colour, where the old percentage charged more
// per page (20% of ₹8 is ₹1.60, not ₹0.40).
//
// That asymmetry is the point of the change rather than a flaw in the
// migration: duplex effort does not depend on colour, so there is no
// single flat rate that reproduces the old behaviour for both. A vendor
// who was implicitly charging more for colour duplex will now charge the
// B&W amount for it, and can raise the one number if they disagree. This
// is a starting value, not a final answer, which is why the script
// prints the colour comparison for every shop instead of hiding it.
//
// Reads through the raw driver, not the Mongoose model: the schema now
// describes the NEW field, so a model read would not return the old one
// and there would be nothing to migrate from.
//
// Usage:
//   node scripts/migrateSidesToFlatRate.js            # dry run - prints, writes nothing
//   node scripts/migrateSidesToFlatRate.js --confirm  # actually writes
//
// Idempotent: a shop that already has sides_extra_rate and no percentage
// is reported as already migrated and left untouched.

const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const confirm = process.argv.includes("--confirm");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${confirm ? "APPLY (--confirm)" : "DRY RUN"}\n`);

  const collection = mongoose.connection.collection("shops");
  const shops = await collection.find({}).toArray();
  console.log(`${shops.length} shop(s) in the database\n`);

  let migrated = 0;
  let already = 0;
  let nothingToDo = 0;

  for (const shop of shops) {
    const label = `${shop.shop_name} (${shop._id})`;
    const pricing = shop.pricing || {};
    const percent = pricing.sides_surcharge_percent;

    if (typeof percent !== "number") {
      if (typeof pricing.sides_extra_rate === "number") {
        console.log(`SKIP     ${label} - already migrated (sides_extra_rate ₹${pricing.sides_extra_rate})`);
        already += 1;
      } else {
        // Neither field: nothing to convert from, and the schema default
        // applies the next time this document is saved through the model.
        console.log(`SKIP     ${label} - no sides pricing of either kind`);
        nothingToDo += 1;
      }
      continue;
    }

    const bwRate = typeof pricing.rate_per_page_bw === "number" ? pricing.rate_per_page_bw : 0;
    const colorRate = typeof pricing.rate_per_page_color === "number" ? pricing.rate_per_page_color : 0;
    const flat = round2(bwRate * (percent / 100));

    console.log(`MIGRATE  ${label}`);
    console.log(`         was: ${percent}% of the page subtotal`);
    console.log(`         now: ₹${flat} per page, flat`);
    console.log(
      `         per B&W page:    ₹${round2(bwRate * (percent / 100))} before -> ₹${flat} after  (unchanged)`
    );
    // Printed even when it matches, so the vendor-facing consequence is
    // never silently buried in a run over many shops.
    const colorBefore = round2(colorRate * (percent / 100));
    console.log(
      `         per colour page: ₹${colorBefore} before -> ₹${flat} after` +
        `  (${colorBefore === flat ? "unchanged" : `${colorBefore > flat ? "cheaper" : "dearer"} for the customer`})`
    );

    if (confirm) {
      await collection.updateOne(
        { _id: shop._id },
        {
          $set: { "pricing.sides_extra_rate": flat },
          // Removed, not left alongside: two fields describing the same
          // charge is how one of them quietly becomes the stale one that
          // somebody later reads by mistake.
          $unset: { "pricing.sides_surcharge_percent": "" },
        }
      );
    }
    migrated += 1;
  }

  console.log(
    `\n${confirm ? "Applied" : "Would migrate"}: ${migrated} shop(s)` +
      ` | already migrated: ${already} | no sides pricing: ${nothingToDo}`
  );
  // The Settings singleton carries the same field, purely as the seed for
  // a NEW shop's pricing (see createShop). Converted here too rather than
  // left behind: Mongoose applies the schema default when reading a
  // document that is missing the path, so leaving it alone would not
  // break anything - it would silently seed new shops from the schema
  // default while a contradictory percentage sat in the database looking
  // authoritative. That is the stale-second-field problem this migration
  // exists to avoid, one collection over.
  const settingsCollection = mongoose.connection.collection("settings");
  const settings = await settingsCollection.findOne({});
  console.log("");
  console.log("Global Settings (seed values for newly created shops)");

  let settingsChanged = false;
  if (!settings) {
    console.log("  none exists yet - it will be created with the schema default");
  } else if (typeof settings.sides_surcharge_percent !== "number") {
    const current =
      typeof settings.sides_extra_rate === "number"
        ? `₹${settings.sides_extra_rate}`
        : "unset, schema default applies";
    console.log(`  already migrated (sides_extra_rate ${current})`);
  } else {
    const seedBw = typeof settings.rate_per_page_bw === "number" ? settings.rate_per_page_bw : 0;
    const seedFlat = round2(seedBw * (settings.sides_surcharge_percent / 100));
    console.log(`  was: ${settings.sides_surcharge_percent}%  ->  now: ₹${seedFlat} per page, flat`);
    settingsChanged = true;
    if (confirm) {
      await settingsCollection.updateOne(
        { _id: settings._id },
        { $set: { sides_extra_rate: seedFlat }, $unset: { sides_surcharge_percent: "" } }
      );
    }
  }

  if (!confirm && (migrated > 0 || settingsChanged)) {
    console.log("\nNothing was written. Re-run with --confirm to apply.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
