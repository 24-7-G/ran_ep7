# CLEAN 42 — PUBLIC RAID SCHEDULE EDITING

## Authoritative change
Raid Schedule is intentionally editable by any visitor, including regular users and administrators. The previous non-admin VIEW ONLY state has been removed.

## UI
- Every raid card shows EDIT SCHEDULE.
- Non-admin users can open the same schedule editor.
- Spawn time, recurrence, timezone, active state, interval, anchor date, and weekly days can be changed.
- Save is no longer blocked by `isAdmin`.

## Firestore
- Added the actual `raids` collection rules used by RaidPage.
- Public create/update is limited to known schedule fields.
- Public delete is disabled.
- Raid schedule audit entries in `guildNotices` may be created when `entityType == "raid-schedule"` and `module == "raid-schedule"`; updates/deletes remain admin-only.
- Legacy `raidSchedules` collection remains admin-only for compatibility.

## Important
Deploy `src/firestore.rules` after installing this version:
`firebase deploy --only firestore:rules`
