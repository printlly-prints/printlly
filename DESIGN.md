---
name: Printlly — Paper in Motion
description: Target editable vector Figma system for document printing and pickup; construction in progress.
colors:
  primary: "#6D35B1"
  primary-pressed: "#53258D"
  selection: "#EDE4F5"
  highlight: "#D8F36A"
  illustration-accent: "#FF9E79"
  background: "#FFF7E8"
  surface: "#FFFFFF"
  ink: "#2C1838"
  text-secondary: "#65516C"
  error: "#A12F4D"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "64px"
    lineHeight: "72px"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "48px"
    lineHeight: "56px"
  heading:
    fontFamily: "Manrope, sans-serif"
    fontSize: "32px"
    lineHeight: "40px"
  section:
    fontFamily: "Manrope, sans-serif"
    fontSize: "24px"
    lineHeight: "32px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    lineHeight: "24px"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
rounded:
  control: "12px"
  control-roomy: "16px"
  card: "20px"
  feature-card: "24px"
spacing:
  unit: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
  hero: "64px"
  display: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: Printlly

## Overview

**Creative North Star: "Paper in Motion"**

A lively paper world connects digital PDFs to a real local print counter. Original hand-drawn people and a folded-paper courier mascot add warmth and recognition. Rounded paper surfaces, aubergine linework, plum actions, lavender, lime and apricot form the target visual language.

This is the Figma target specification: native screen and illustration jobs have completed, while final render validation and interactive prototypes remain in progress. It is not an extraction of an implemented website or Expo theme. The user explicitly replaced the Swiss/cobalt direction and requires native vector illustrations only. Preserve repository naming and product truth. Final authored palette bindings and renders still need validation; see design/FIGMA_REDESIGN_STATE.json.

**Key Characteristics:**

- Individual native vector characters, poses and avatars.
- Illustrations specific to upload, shop selection and collection.
- Warm rounded paper cards with selective offset depth.
- Readable operational typography and labelled states.

## Colors

Plum anchors actions; lime and apricot add expressive highlights around ivory and white.

### Primary

Use primary for the next action, primary-pressed for press feedback, and selection for chosen options. Primary labels use surface white.

### Secondary

Highlight and illustration-accent support artwork and friendly milestones. Pair both with ink. White or plum small text on apricot fails the calculated contrast.

### Neutral

Background is the page field; surface is a working card. Ink supplies text and essential outlines. Text-secondary supports metadata; error accompanies recovery copy and a non-color indicator.

**The Legible Paper Rule.** Pale fills never serve as the sole boundary of an essential control; use a contrasting outline and visible focus.

## Typography

Manrope headings and Inter body were verified available in Figma. Frontmatter roles are target specifications, not shipped runtime CSS. Adapt large headings to available width; preserve body and label sizes.

**The Read Before Decorate Rule.** Prices, settings, errors and pickup digits remain readable before illustration competes for attention. Use tabular figures in implementation and equal-width editable Figma digit cells when the font feature cannot be authored.

## Layout

Use a four-pixel rhythm. Reference grids: desktop 1440, 12 columns, 80 margins, 24 gutters; tablet 768, eight columns, 32 margins, 16 gutters; phone 390, four columns, 24 margins, 16 gutters. These are compositions, not verified implementation breakpoints.

At narrow widths and large text, stack metadata and wrap totals. Preserve 48 logical pixels of interactive hit area. Respect safe areas and keyboards. Sticky controls reserve content space; tall interiors need actual scrolling. Public pages can use larger illustrated compositions; operational views retain aligned rows and visible actions.

## Elevation & Depth

Target depth uses outlines, tonal panels and selective short offset shadows (2–4 pixels). Exact authored shadow colors and blur remain unverified. Avoid shadows on every operational row.

## Shapes

Cards have generous corners (20–24 pixels), controls rounded rectangles (12–16 pixels). Folded-paper seams and ticket silhouettes express product identity.

**The Separate Character Rule.** Build each mascot, human pose and avatar as its own editable native vector component with curved paths and shapes. Compose instances in screens; do not import a flattened combined scene or copy reference characters. Generated PNG explorations are retained references, not final Figma assets.

## Components

Buttons retain labels through loading and distinguish focus, press, disabled and web hover. Inputs retain labels, values and recovery guidance. Document cards show per-document settings, shop rows show supported facts, receipts itemize prices, and pickup tickets prioritize the server-issued code.

The paper courier mascot accompanies self-collection; it must not imply a delivery service. Human upload/shop/pickup poses and four avatar components add personality in appropriate contexts. Interface icons are a consistent vector family; no emoji substitutes.

Motion targets: 120ms press, 180ms selection, 240ms detail and 300ms screen, login, upload or ticket continuity. A single brief login fold or greeting keeps the form stable. Reduced motion removes traveling/folding artwork and uses instant navigation or a short dissolve. Complete Figma motion routes and runtime performance are not verified.

## Do's and Don'ts

- Do build independent native vector illustrations and reusable instances.
- Do make artwork specific to PDFs, local printing and pickup.
- Do use dark labels on pale accents and inspect rendered contrast.
- Do preserve readable text, 48-pixel targets and recovery actions.
- Do label sample values and expert attention predictions honestly.
- Don't restore the rejected restrained Swiss/cobalt direction.
- Don't copy reference characters, flatten final artwork or use emoji icons.
- Don't fabricate reviews, metrics, delivery, authentication or a printing stage.
- Don't equate agent counts with independent validation or planned links with working prototypes.


