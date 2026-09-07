# CLEAN 44 — Full Administrator Access Fix

Authoritative baseline: CLEAN 43. This is a strict incremental fix; existing BH/CW/Raid functionality and UI are preserved.

## Fixed
- New administrators created through REGISTER NEW ADMINISTRATOR now always receive `role: "admin"`, `status: "active"`, and `active: true`.
- The application recognizes both `active: true` and `status: "active"` for administrator sessions.
- BH Attendance now uses the same App-level administrator authorization instead of a bootstrap-UID-only local check, fixing the ADMIN header / BH VIEW ONLY mismatch.
- The Admin Portal keeps the complete admin role/status contract on the current administrator record.
- Disabling an administrator now writes `status: "disabled"` as well as `active: false`, so Firestore rules and the UI agree that the account is disabled.
- The deployed Firestore rules (`firebase.json` -> `src/firestore.rules`) now use the active `adminUsers/{uid}` authorization model instead of the old bootstrap-UID-only rule.
- All protected BH, CW, player, reward, treasury, settings, backup, archive, and admin collections use the same active-admin authorization model.
- New administrator registration is PIN-gated and creates the authenticated administrator record before the account is considered an admin.
- Raid Schedule remains intentionally editable by regular users and administrators.

## Required deployment
From the project root:

```powershell
npm run build
npm run deploy
firebase deploy --only firestore:rules
```

The Firestore rules deployment is required because the previous live ruleset only recognized the original bootstrap UID.

## Important
Creating an account directly in Firebase Authentication does not automatically make it an administrator. Use the site's PIN-protected REGISTER NEW ADMINISTRATOR flow so the required `adminUsers/{uid}` record is created.
