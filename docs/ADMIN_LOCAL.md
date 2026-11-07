# Paprout admin on this computer

- Admin panel: http://127.0.0.1:5174
- Local backend: http://127.0.0.1:5000
- Local database: `mongodb://127.0.0.1:27017/paprout_local`
- Database files: `.codex/mongodb/data` (persistent and ignored by Git)

The admin account was created with the existing backend `scripts/createAdmin.js` flow, using bcrypt and the shared password policy. Credentials are not stored in source files. This account belongs to the local development database; it does not provision a production account. Shops and orders remain empty until added through normal application flows.

The backend's ignored `.env` contains the local connection and generated signing secret. The panel's ignored `.env.local` points at the local backend. Keep both files and the database directory to retain the local setup.

To restart after closing the development servers, run MongoDB first, then the backend and admin panel in separate terminals:

```powershell
# From the repository root
& '.codex/mongodb/mongodb-win32-x86_64-windows-8.0.34/bin/mongod.exe' --dbpath '.codex/mongodb/data' --bind_ip 127.0.0.1 --port 27017

# Backend terminal
cd backend
node server.js

# Admin terminal
cd admin-panel
npm run dev -- --host 127.0.0.1 --port 5174
```

MongoDB Community 8.0.34 was downloaded from MongoDB's official Windows archive and verified against its published SHA-256. The database binds to loopback. The downloaded archive and debug symbols were removed after installation; the executable and persistent data remain.

The shared admin theme uses Paprout's paper, cyan, magenta, yellow and ink palette, with semantic status colors and Inter typography. Read-only page validation covers the dashboard, vendor verification, shops, orders, settlements, support and settings. The production frontend build, theme text/control contrast checks, admin sign-in and authenticated backend reads pass. No vendor approval, payout or settings mutation was performed during validation.

Design refinement followed the Unslop guidance by [Damir Sokolovsky](https://heydamir.design/unslop), CC BY 4.0.

Dashboard refinement adds a compact KPI band, recent orders, the vendor review queue and a proportional shop verification breakdown, all backed by existing API reads. Empty counts stay empty; no historical trend data is fabricated. Shared filters and the settings fee selector use Radix Select for keyboard navigation, typeahead, selection indicators, focus restoration and collision-aware menus. Lucide supplies navigation and action icons. Run npm run check for the zero/mixed/pending-only dashboard calculation checks. Desktop and 390px mobile layouts, filter resets and keyboard dismissal were checked without changing platform settings. Populated order and vendor rows have not been exercised against this empty local database.

## Vendor and user directories

The admin sidebar includes Vendors (/vendors) and Users (/users). Both are read-only directories with server-side name/email/phone search and 25-account pagination. Vendor rows include linked shop and verification/active status, including owners with no shop; user rows include all-time order counts. The new GET /admin/accounts endpoint accepts only role=shop_owner or role=customer and inherits the admin router's authentication and role checks. Explicit projections exclude passwords, OAuth IDs, KYC and payout data.

From backend, run npm run check:admin-accounts while local MongoDB is running. This check creates and drops its own randomly named paprout_account_check_* database; it never uses paprout_local. It covers access control, role isolation, literal search, bounded pagination, missing-shop states, order counts and private-field exclusion. No fixture accounts are added to the application database.
