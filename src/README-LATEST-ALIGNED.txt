RAN EP7 — BH ATTENDANCE LATEST ALIGNED BUILD

This build preserves the complete BH Attendance functionality and aligns the dashboard to the approved reference layout.

Key changes:
- Notifications & History is permanently positioned directly below the four stat cards.
- Notifications show up to 10 entries per page; pagination appears only when there are more than 10.
- Recent History shows up to 10 entries per page with pagination.
- Clicking any activity entry opens a full detail modal with message, creator, date/time, module, entity and changes/details.
- VIEW ALL HISTORY opens the complete combined activity view.
- All new guild notices store createdAt/timestamp, createdBy/createdByUid, details, changes, entity metadata and player metadata where supplied.
- Today's Boss Spawns uses the large four-card presentation with real boss artwork.
- Recent Spawns remains in the right sidebar as the compact navigation/history view.
- Attendance roster, player management, rewards, claims, scoring, scoring history and existing Firebase logic are preserved.
- No duplicate Reward Center or duplicate primary spawn presentation was introduced.

Run:
  npm i
  npm run dev

Build:
  npm run build

Deploy:
  npm run deploy
