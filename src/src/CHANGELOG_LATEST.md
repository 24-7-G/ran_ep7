# LATEST — CLEAN 44

CLEAN 44 is authoritative. This is a strict incremental administrator-access fix on the CLEAN 43 baseline.

## CLEAN 44 — Full Administrator Access
- New administrators created through the site's PIN-protected registration always receive `role: "admin"`, `status: "active"`, and `active: true`.
- The application recognizes active administrators consistently using `active: true` or `status: "active"`.
- BH Attendance now uses the App-level administrator authorization, eliminating the old bootstrap-UID-only VIEW ONLY check.
- The Admin Portal maintains the complete administrator role/status record.
- Disabling an administrator now writes both `active: false` and `status: "disabled"`.
- `src/firestore.rules` now uses the active `adminUsers/{uid}` authorization model for protected application data instead of the old bootstrap-UID-only model.
- BH, CW, player, rewards, treasury, settings, backup/archive, and other protected admin tools therefore use the same administrator authorization.
- Raid Schedule remains intentionally editable by any user or administrator.

## Deployment
```powershell
npm install
npm run build
npm run deploy
firebase deploy --only firestore:rules
```

The Firestore rules deployment is required for the administrator fix to take effect in production.
