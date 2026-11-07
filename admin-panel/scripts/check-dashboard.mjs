import assert from 'node:assert/strict';
import { verificationBreakdown } from '../src/lib/dashboard.js';

assert.deepEqual(verificationBreakdown({ shops_approved: 0, shops_pending_verification: 0, shops_rejected: 0 }), { total: 0, percentages: [0, 0, 0] });
assert.deepEqual(verificationBreakdown({ shops_approved: 6, shops_pending_verification: 3, shops_rejected: 1 }), { total: 10, percentages: [60, 30, 10] });
assert.deepEqual(verificationBreakdown({ shops_approved: 0, shops_pending_verification: 2, shops_rejected: 0 }), { total: 2, percentages: [0, 100, 0] });
console.log('Dashboard breakdown: zero, mixed and pending-only totals passed.');
