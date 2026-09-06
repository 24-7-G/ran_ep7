# CLEAN 22 — Guild Support Ticket System

Based on CLEAN 21.

## Ticket UX
- Renamed Guild Questions to Guild Support / Support Ticket Center.
- Added categories:
  - BH ATTENDANCE
  - CW ATTENDANCE
  - SALARY
  - REWARDS
  - TREASURY
  - ITEM / INVENTORY
  - SCHEDULE
  - PLAYER / ACCOUNT
  - CONCERN / COMPLAINT
  - OTHER
- Added category quick-filter chips and category dropdown.
- Preserved status, priority, player/IGN, search, sorting, and 10-row pagination.
- Existing older category values are normalized for display/filtering so old Firebase records remain usable.
- Ticket detail/reply/edit/PIN/admin workflows remain on the existing guildTickets collection.

## Responsive behavior
- Category chips horizontally scroll on narrow screens.
- Filters stack cleanly on phones.
- Ticket actions wrap without clipping.
- Modal uses viewport-safe scrolling and mobile safe-area support.
- No Firebase document IDs are displayed as ticket content.

## Build note
A production Vite build was not run in this environment because the package's Vite executable is not installed in the provided workspace.
