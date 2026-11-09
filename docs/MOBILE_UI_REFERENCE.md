# Paprout mobile implementation

Reference: [Paprout mobile screen collection](https://paprout-print-and-pickup.lovable.app/). Individual screenshots are saved in `design/mobile-concepts/lovable-reference/`.

The implementation uses Inter, warm paper, white surfaces, readable cyan actions and the existing CMYK identity. It retains the logo and approved character art. The final tab bar uses a raised moving arch with stationary icons and cyan selection; Orders use compact cyan cards and small mascots, following the user's later corrections.

The four tabs retain independent native-stack histories. The primary print flow remains PDF → per-document settings → matching shop quotes → review → checkout. The real API remains authoritative for page counts and totals. File limits are 10 MB per file and ten files, and pickup codes remain the backend's six digits rather than the reference's four.

Location is resolved on the device, with an explicit location action available in seeded mode and a searchable-area fallback. No area name is fabricated. Shop photos use explicit fill dimensions so the storefront is centered instead of showing only the upper-left corner. Live vendor photos take priority; bundled storefronts are restricted to seeded mode.

You uses the original 17 human portraits from Figma `68:1448`, excludes the mascot, and stores profile appearance and print defaults per account on the device. Account identity and payment contact stay server-owned. A distinct support-chat control opens the existing conversation and unread-reply state; order-specific support retains its order context.

The seeded experience has no demo/sample labels. It remains isolated from live API data, analytics, sockets and real payment processing. No inactive notification switch, fake ratings, invented preparation guarantees, or unsupported “fastest” sorting are added.

Android export and the existing auth, contrast, assets, quote, payment-isolation and navigation checks are used for validation. Live service connectivity, physical-device behavior and release animation performance require separate device validation.

Browser verification covers the four tabs, persistent human-avatar selection, local support-message sending, the ticket-only pickup code, and adding a second PDF from review without dropping the first file's settings. A mixed two-document order quotes ₹187 at CopyHub (₹144 base + ₹32 paper + ₹8 sides + ₹3 fee), retains that total at checkout and returns to an empty Print workspace after completion. Portraits are downsampled to 288 px for the app's 96-point maximum display, reducing their bundled PNG payload from 23 MB to 1.8 MB; original exports remain in the ignored workspace cache.
