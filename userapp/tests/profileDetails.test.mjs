import test from "node:test";
import assert from "node:assert/strict";
import { calendarCells, localDateKey, profileDetailsError, validDob } from "../src/utils/profileDetails.js";

test("DOB rejects impossible, future and ambiguous dates; accepts leap dates", () => {
  assert.equal(validDob("2000-02-29", "2026-10-16"), true);
  for (const date of ["2001-02-29", "2026-02-30", "2026-10-17", "1899-12-31", "16/10/2000", "2000-2-01", ""]) assert.equal(validDob(date, "2026-10-16"), false, date);
  assert.equal(validDob("2026-10-16", "2026-10-16"), true);
});
test("calendar uses local calendar components and correct month/leap-year days", () => {
  assert.equal(localDateKey(new Date(2000, 1, 29, 23, 50)), "2000-02-29");
  const leap = calendarCells(2000, 1);
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(leap[0], null); assert.equal(leap[1], null); assert.equal(leap[2], 1);
  assert.equal(calendarCells(2001, 1).filter(Boolean).length, 28);
});
test("optional details remain optional; malformed contact email is rejected", () => {
  assert.equal(profileDetailsError({ dob: "", contactEmail: "" }), "");
  assert.equal(profileDetailsError({ dob: "2000-02-29", contactEmail: " person@example.com " }), "");
  assert.match(profileDetailsError({ contactEmail: "person@" }), /email/);
  assert.match(profileDetailsError({ dob: "2099-01-01" }), /date of birth/);
});
