# CLEAN 34 — Exact V Brand + Full Clan War Banner

Baseline: CLEAN 33.

Changes only:
- Header now imports the approved `src/assets/ran-v-icon.png` directly instead of `/assets/...`.
- Removed the old CSS diamond pseudo-elements from the global brand mark.
- Increased the V emblem for visibility while keeping mobile responsive sizing.
- ADMIN/USER role badge uses the same approved V image.
- Added a full-width Clan War banner immediately below the global header on CW.
- Banner uses `object-fit: contain` so the complete artwork remains visible and is not cropped in half.
- Added `public/ran-v-icon.png` as a safe static copy.
- Existing Firebase, backup, BH, CW, Raid, Treasury, Tickets, permissions, and Admin logic otherwise preserved.
