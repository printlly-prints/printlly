# Paprout vendor workspace

The partner workspace uses the same CMYK token values as the admin panel. The public website retains its scoped paper styles and handwriting font.

| Role | Token / value |
| --- | --- |
| Page | background, #FAFAF7 |
| Work surface | surface, #FFFFFF |
| Main text | text-primary, #242426 |
| Secondary text | text-secondary, #616164 |
| Actions | primary, #007C9C; hover #00637D |
| Selected state | primary-wash, #E2F0F2 |
| Input boundaries | border-strong, #7C9299 |
| Pending work | #FBF3D9 / #755514 |
| Error | #FBEDEF / #9B2937 |
| Identity accents | cyan #00C2FF, magenta #FF2D8D, yellow #F2D85B |

Use semantic tokens rather than raw palette classes. Keep text contrast at 4.5:1 and control boundaries at 3:1. Workspace typography is Inter; controls are 10px radius, panels 16px. Native selects use a cyan chevron and a light color scheme. Status labels remain readable without color.

The background is quiet paper. Approved contextual artwork is used for shop onboarding and empty states; there are no ambient green leaves or glowing background shapes. Generated artwork is in public/art/vendor and retains alpha. The setup scene preserves the approved male shopkeeper; the print-desk and inbox scenes use the paper mascot in different contexts.

Run npm run check for contrast and coordinate validation assertions.
