# CLEAN 21 — Universal Responsive Repair

Based on CLEAN 20.

## Purpose
Make the entire RAN EP7 application usable across large desktop, laptop, tablet, iOS and Android without page-level clipping or overlapping controls.

## Changes
- Added a universal responsive layer in `src/responsive-global.css`.
- Dense tables now scroll horizontally inside their own containers instead of squeezing columns until buttons overlap.
- Treasury ledger uses a stable readable table width and keeps EDIT/DELETE on one line.
- CW Item Catalog keeps ASSIGN/EDIT/ENABLE/DISABLE on one line.
- Filters collapse from multi-column desktop layouts to tablet and phone layouts.
- Modals respect `100dvh` and safe-area insets and scroll internally.
- Navigation can horizontally scroll on narrow screens instead of being clipped.
- Cards/grids collapse progressively for tablet and phone.
- Touch controls get usable target sizes.
- No Firebase/data/business logic was intentionally changed.

## Important responsive behavior
On iOS/Android, very wide ledgers are intentionally horizontally scrollable inside the ledger area. This is preferable to shrinking the table until text and action buttons overlap.
