import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENING_PREFERENCE_KEY, readOpeningPreference } from '../src/utils/openingPreference.js';

test('opening defaults on for new devices and unreadable stored preferences', () => {
  for (const value of [null, undefined, '', 'invalid', 'true']) assert.equal(readOpeningPreference(value), true);
});

test('an explicit device opt-out persists across a storage round trip independently of event sounds', () => {
  const storage = new Map([['printlly:event-sounds:muted', 'true']]);
  assert.equal(readOpeningPreference(storage.get(OPENING_PREFERENCE_KEY)), true);
  storage.set(OPENING_PREFERENCE_KEY, String(false));
  assert.equal(readOpeningPreference(storage.get(OPENING_PREFERENCE_KEY)), false);
  storage.set(OPENING_PREFERENCE_KEY, String(true));
  assert.equal(readOpeningPreference(storage.get(OPENING_PREFERENCE_KEY)), true);
});
