import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOMER_AVATAR_IDS, customerAvatarId, DEFAULT_AVATAR_ID } from "../src/constants/avatarIds.js";

test("customer avatar choices contain the 16 canonical people and exclude role-only art", () => {
  assert.equal(CUSTOMER_AVATAR_IDS.length, 16);
  assert.equal(new Set(CUSTOMER_AVATAR_IDS).size, 16);
  for (const id of ["00-default-mascot", "04-admin", "01-welcome", "login_customer_mascot", undefined]) {
    assert.equal(CUSTOMER_AVATAR_IDS.includes(id), false);
    assert.equal(customerAvatarId(id), DEFAULT_AVATAR_ID);
  }
  for (const id of CUSTOMER_AVATAR_IDS) assert.equal(customerAvatarId(id), id);
});
