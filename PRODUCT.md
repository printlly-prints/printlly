# Printly product context

<!-- impeccable:product-schema 1 -->

## Platform
adaptive

## Users
Customers uploading documents for collection from local print shops, print partners processing orders, and internal administrators. A student-heavy audience is inferred from the project context, not verified research.

## Product Purpose
Upload PDFs, select print settings and a shop, pay online, and collect using a server-issued pickup code.

## Stack
React/Vite website and partner dashboard; React Native/Expo 57 customer app. The user confirmed redesigning the existing app and supplying Flutter-ready specifications rather than creating a Flutter application.

## Capabilities and Constraints
Preserve API contracts, authentication, payments, document lifecycle, orders, and navigation. Backend code must remain untouched. Missing backend support belongs in docs/REDESIGN_BACKEND_GAPS.md. Actual shop status, pricing, photos, saved shops, location, and queue information already have implementation support; earlier design annotations are stale.

## Brand Commitments
The user calls the product Printly; the repository and existing legal identity use Printlly. Retain existing public spelling pending a separate naming decision. Latest direction on 11 October 2026 supersedes the original Swiss suggestion: an expressive, original identity matching PDF printing, richer color themes, illustrated avatars/mascots, rounded layouts and purposeful login animation. Paper in Motion is the current proposed direction; the earlier restrained Ink & Paper palette was rejected. Use the requested Figma account ishantsinghbisht.24011232@gehu.ac.in.

## Evidence on Hand
Existing screen implementations, local brand assets, design HTML, backend models and route contracts. Marketing statistics, reviews, and testimonials are not verified and must not be presented as real proof.

## Product Principles
Keep the path to the next action obvious. Show real payment/order state. Preserve settings when recovering from errors. Use backend facts rather than invented estimates. Make pickup details readable at a counter.
