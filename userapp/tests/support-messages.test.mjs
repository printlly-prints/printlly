import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/supportMessages.js", import.meta.url), "utf8");
const { mergeSupportMessages } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("an older history response preserves a reply that arrived on the live connection", () => {
  const earlier = { _id: "one", text: "Can you help?", created_at: "2026-10-15T00:00:00Z" }, live = { _id: "two", text: "Yes", created_at: "2026-10-15T00:00:01Z" };
  assert.deepEqual(mergeSupportMessages([earlier, live], [earlier]), [earlier, live]);
});
test("socket/history duplicates share one server identity and remain chronological", () => {
  const first = { _id: "one", created_at: "2026-10-15T00:00:00Z" }, second = { _id: "two", created_at: "2026-10-15T00:00:01Z" };
  assert.deepEqual(mergeSupportMessages([second], [first, second, second]), [first, second]);
});
