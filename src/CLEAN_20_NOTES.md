# CLEAN 20 — CW Workspace / Catalog Action Repair

Changes:
- Increased large-desktop application workspace width to 2000px.
- Increased CW wide-modal usable width to 1600px so right-side action buttons are not clipped.
- Rebuilt the CW local calendar window into connected BACK / TODAY / FORWARD controls with 0–7 day choices visible.
- Restyled the CW Schedule section as one continuous professional panel with a unified header and occurrence-card area.
- CW Item Catalog is now sorted by UPDATED AT descending, with name as the tie-breaker.
- Added UPDATED AT and UPDATED BY to the catalog table.
- Added an explicit action guide explaining ASSIGN / EDIT / DISABLE.
- Catalog Actions are fixed-width, horizontally aligned, non-clipping controls.
- ASSIGN is unavailable for disabled/out-of-stock items; this is visual state only and does not change the underlying assignment workflow.
- EDIT remains for catalog definitions only; DISABLE/ENABLE controls future assignments while preserving history.
- Existing 10-row pagination remains in place.
- Treasury ledger remains UPDATED AT descending and paginated to 10.
