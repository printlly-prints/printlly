require("dotenv").config();
const mongoose = require("mongoose");
const Shop = require("../models/Shop");

// One-off migration: Shop.pricing.services changes from a fixed object of
// three known keys
//
//   { spiral_binding: {enabled, rate}, stapling: {...}, lamination: {...} }
//
// to a vendor-defined array
//
//   [ { _id, name, rate, enabled }, ... ]
//
// Every existing shop's three services become three array entries named
// "Spiral Binding", "Stapling" and "Lamination", each keeping its existing
// rate and enabled value EXACTLY - including services the vendor never
// turned on, which carry over as enabled: false rather than being dropped.
// A vendor who had set a price and left it disabled gets that price back,
// not a zero.
//
// Reads through the raw driver rather than the Mongoose model: the schema
// now describes the NEW shape, so a findOne() would refuse to hand back
// the old object (or silently coerce it) and there would be nothing left
// to migrate from.
//
// Usage:
//   node scripts/migrateServicesToArray.js            # dry run - prints, writes nothing
//   node scripts/migrateServicesToArray.js --confirm  # actually writes
//
// Idempotent: a shop whose services are already an array is reported as
// "already migrated" and left untouched, so re-running is harmless.

// The order matters only for how they will appear in the vendor's list.
const LEGACY_SERVICES = [
  { key: "spiral_binding", name: "Spiral Binding" },
  { key: "stapling", name: "Stapling" },
  { key: "lamination", name: "Lamination" },
];

function describe(entry) {
  return `${entry.name} (₹${entry.rate}, ${entry.enabled ? "enabled" : "disabled"})`;
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("shops");

  const shops = await collection.find({}).toArray();
  console.log(`${confirm ? "APPLYING" : "DRY RUN"} - ${shops.length} shop(s) in the database\n`);

  let migrated = 0;
  let already = 0;
  let nothingToDo = 0;

  for (const shop of shops) {
    const label = `"${shop.shop_name}" (${shop._id})`;
    const services = shop.pricing?.services;

    if (Array.isArray(services)) {
      already += 1;
      console.log(`SKIP  ${label}: already an array (${services.length} service(s))`);
      continue;
    }

    if (!services || typeof services !== "object") {
      // No services sub-object at all - give it an empty array so the
      // field exists in the new shape.
      nothingToDo += 1;
      console.log(`EMPTY ${label}: no services object, will set []`);
      if (confirm) {
        await collection.updateOne({ _id: shop._id }, { $set: { "pricing.services": [] } });
      }
      continue;
    }

    const converted = LEGACY_SERVICES.map(({ key, name }) => ({
      _id: new mongoose.Types.ObjectId(),
      name,
      // Preserved exactly as stored, including a price on a service the
      // vendor had switched off.
      rate: typeof services[key]?.rate === "number" ? services[key].rate : 0,
      enabled: services[key]?.enabled === true,
    }));

    console.log(`MIGRATE ${label}`);
    console.log(`        from: ${JSON.stringify(services)}`);
    console.log(`        to:   ${converted.map(describe).join(", ")}`);

    if (confirm) {
      await collection.updateOne({ _id: shop._id }, { $set: { "pricing.services": converted } });
    }
    migrated += 1;
  }

  console.log(
    `\n${confirm ? "Applied" : "Would migrate"}: ${migrated} shop(s)` +
      ` | already an array: ${already} | no services object: ${nothingToDo}`
  );
  if (!confirm && (migrated > 0 || nothingToDo > 0)) {
    console.log("\nNothing was written. Re-run with --confirm to apply.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
