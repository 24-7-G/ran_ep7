# RAN EP7 CLEAN 17 — CW Targeted Polish

Authoritative baseline: `RAN_EP7_CLEAN_16_LATEST_IDS_HIDDEN_10_ROW_PAGINATION.zip`

## Only requested changes in CLEAN 17
- Unified the Local Calendar Window and Clan War Occurrence/Schedule presentation so they read as one connected section.
- Enlarged and cleaned up Back / Current / Forward controls while preserving the existing 0–7 day behavior.
- Polished Guild Treasury hierarchy and finance action layout without changing treasury calculations or workflows.
- Removed the seeded first catalog item from the Clan War Rewards modal so the preview starts empty instead of showing filler data such as `testing`.
- Replaced the reward preview with useful live information: current gold, gold after save, item quantity, and selected reward items.
- Changed treasury ledger ordering to newest `UPDATED AT` first and labeled the first ledger column `UPDATED AT`.
- Changed CW attendance/player history ordering to prefer `UPDATED AT` first.
- Changed CW notification ordering to prefer `UPDATED AT` first.
- Changed Assign Item to Player so a new inventory assignment can select multiple item types in one modal and enter a quantity for each selected row.
- Existing edit/link assignment flow remains single-record and unchanged in purpose.
- Inventory assignment table remains paginated at 10 rows per page.
- Existing 10-row pagination across CW ledgers/tables is preserved.

## Validation
- `CWPage.jsx`, `BHPage.jsx`, and `App.jsx` were parsed successfully with the installed TypeScript JSX parser.
- Full Vite build could not run because the environment's local `node_modules` did not contain Vite after the attempted dependency install timed out. No application source was replaced with an older version.
