import test from "node:test";
import assert from "node:assert/strict";
import { recoveryForError, retryAfterSeconds } from "../src/utils/requestRecovery.js";
import { patchUploadItem, successfulDocuments, retryableFiles } from "../src/utils/uploadRecovery.js";

test("request recovery preserves the distinction between session expiry, denied access and resource loss", () => {
  const failure = status => ({ response: { status } });
  assert.equal(recoveryForError(failure(401)).requiresSignIn, true);
  assert.equal(recoveryForError(failure(403)).requiresSignIn, undefined);
  assert.equal(recoveryForError(failure(404)).reaction, "not_found");
  assert.equal(recoveryForError(failure(404), { notFound: "shop_unavailable" }).reaction, "shop_unavailable");
  assert.equal(recoveryForError(failure(503)).reaction, "service_unavailable");
  assert.equal(recoveryForError({ isAxiosError: true, code: "ERR_NETWORK" }).reaction, "offline");
  assert.equal(recoveryForError(new Error("Unexpected response")).reaction, "service_unavailable");
});
test("server Retry-After seconds and dates are respected without inventing a retry interval", () => {
  assert.equal(retryAfterSeconds("12"), 12);
  assert.equal(retryAfterSeconds("garbage"), 0);
  assert.equal(retryAfterSeconds("Thu, 01 Jan 1970 00:00:20 GMT", 10000), 10);
  assert.equal(retryAfterSeconds("Thu, 01 Jan 1970 00:00:20 GMT", 30000), 0);
  assert.equal(recoveryForError({ response: { status: 429, headers: { "retry-after": "7" } } }).retryAfterSeconds, 7);
});
test("partial upload recovery only retries failed files and keeps successful server documents unchanged", () => {
  const doc = { upload_id: "server-one", page_count: 4 };
  const first = { id: "a", status: "uploaded", doc };
  const second = { id: "b", status: "failed", asset: { name: "same-name.pdf" }, error: "Offline" };
  const items = [first, second];
  assert.deepEqual(retryableFiles(items), [second]);
  const retrying = patchUploadItem(items, "b", { status: "uploading", error: "" });
  assert.equal(retrying[0], first);
  assert.deepEqual(successfulDocuments(retrying), [doc]);
  const failedAgain = patchUploadItem(retrying, "b", { status: "failed", error: "Still offline" });
  assert.equal(failedAgain[0].doc, doc);
  const recovered = patchUploadItem(failedAgain, "b", { status: "uploaded", doc: { upload_id: "server-two", page_count: 1 }, asset: null });
  assert.deepEqual(successfulDocuments(recovered).map(value => value.upload_id), ["server-one", "server-two"]);
  assert.deepEqual(retryableFiles(recovered), []);
});
