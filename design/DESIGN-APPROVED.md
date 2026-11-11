# Phase 1 design — My Business Platform (handover)

Canvas (private): https://claude.ai/artifact/ABHRFZnZ8Qvu7v8SmNvPws
Boards: Desktop prototype (clickable, 1440), iPhone prototype (clickable, 390x844), Design system, Blueprint.
Status: APPROVED by the user on 11/11/2026 (no changes requested). Phase 2 NOT started; needs a project folder first. Don't change the approved design without the user's permission.

## Coda public-site findings (structure only)
- Page = icon/title + one-line subtitle + callout + content blocks.
- Section heading + "Add X" action; saved-view tabs above tables (All / By status), filter chips, search right; "New row" at table end; status pills.
- Mobile: bottom tab bar (4 pages + More), compact top bar with back arrow, stacked cards.
- Doc page list sidebar is collapsible.

## Tokens (v0.1)
bg #FFFFFF, surface-1 #F7F8FA, surface-2 #F2F4F7, border #E4E7EC, border-strong #D0D5DD,
text #111827 / #344054 / #5B6474, accent #0F766E (hover #115E59, soft #E3F1EF), accent-2 #B45309 (sparing),
success #067647, info #1849A9, warning #93370D, danger #B42318.
Inter; 32/24/18/16/14/13/12. Spacing 4-base (4,8,12,16,24,32,48). Radius 6 / 10. Shadow only on popovers.
Layout: sidebar 240, top bar 56, content max 1280, gutter 32. Phone: bottom tabs Home/Customers/Quotes/Calendar/More, 44px targets, 16px inputs.
SG: S$, GST 9% on (subtotal - discount), DD/MM/YYYY, 24h, +65, Q-YYYY-NNNN.

Source files: design/canvas/*.dc.html (a copy of the published canvas; these use the canvas's own format, not app code). The canvas link above is the master copy.
