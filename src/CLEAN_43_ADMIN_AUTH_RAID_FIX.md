# CLEAN 43 — Dynamic Administrator Access + Public Raid Schedule Fix

Authoritative baseline: CLEAN 42 project source, with only the administrator authorization and Raid Schedule registration fixes applied.

## Fixes
- Admin access is no longer based only on the bootstrap UID.
- Active `adminUsers/{uid}` records grant administrator access.
- `active: true` or `status: "active"` is recognized for compatibility with existing administrator records.
- New administrator registration writes `role: "admin"`, `status: "active"`, and `active: true`.
- The created Firebase Auth email is used for the admin directory record.
- Disabled administrators have `status: "disabled"` and are no longer recognized as active administrators.
- Bootstrap UID remains an administrator.
- Raid Schedule continues to use the `raids` collection.
- Any visitor/user/admin may edit and save Raid Schedule. Delete remains disabled.
- Firestore admin authorization uses the same active-admin model as the frontend.

## Deployment
1. `npm install`
2. `npm run build`
3. `npm run deploy`
4. `firebase deploy --only firestore:rules`

## Important
An account created directly in Firebase Authentication is not automatically an administrator. New administrators must be created through the site's **REGISTER NEW ADMINISTRATOR** flow so the PIN-verified `adminUsers/{uid}` record is created.
