import test from "node:test";
import assert from "node:assert/strict";
import { recoveryState } from "./recoveryState.js";

test("network and server reads use separate states; endpoint404 does not expire session", () => {
  assert.equal(recoveryState({ isAxiosError: true }).reaction, "offline");
  assert.equal(recoveryState({ response: { status: 503 } }).reaction, "service_unavailable");
  assert.equal(recoveryState({ response: { status: 404 } }).reaction, "not_found");
  assert.equal(recoveryState({ response: { status: 404 } }).session, undefined);
  assert.equal(recoveryState({ response: { status: 401 } }).session, true);
  assert.equal(recoveryState({ response: { status: 410 } }).session, false);
});
test("rate limits respect server delay without interpreting payment status", () => {
  const limited = recoveryState({ response: { status: 429, headers: { "retry-after": "4" } } }, 1000);
  assert.equal(limited.retryAt, 5000);
  assert.equal(limited.rateLimited, true);
  assert.equal(recoveryState({ response: { status: 503, headers: { "retry-after": "Sat, 17 Oct 2026 10:00:00 GMT" } } }).retryAt, Date.parse("2026-10-17T10:00:00Z"));
});
