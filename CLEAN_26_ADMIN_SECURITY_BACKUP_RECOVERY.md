# CLEAN 26 — Admin Security, Backup, Firebase Data Status & Recovery

## Authoritative baseline
This package is based on the latest CLEAN 25 application source and keeps the existing BH/CW/Ticket/Raid application flow intact. It does not create V1/V2 page duplicates.

## Admin security
- Only authenticated active administrators can open administrator functions.
- The bootstrap administrator UID remains supported.
- New administrator registration requires the current 6-digit registration PIN.
- The registration PIN is checked by Firestore rules before Firebase Authentication account creation.
- A wrong PIN is rejected before an Auth account is created.
- Any active administrator can change the registration PIN and factory-reset PIN from Admin Portal → Admin Access.
- PIN changes store a SHA-256 hash for rule enforcement and an admin-only readable current PIN value so administrators can use VIEW/HIDE.
- The old PIN stops authorizing registration immediately after the security document changes.

## Backup / restore
- Full JSON backup contains exact Firestore document IDs and mapped fields.
- XLSX backup contains organized per-collection sheets plus an embedded exact JSON payload.
- Exported XLSX can be imported back into the application.
- Replace restore creates a safety archive first.

## 90-day recovery
- Factory reset archives operational collections before deletion.
- Replace restore and audit consolidation also create recovery archives.
- Recovery archives are retained for 90 days.
- Expired archive chunks are permanently purged by the admin maintenance scan.

## Local backup reminder
- Per-admin preference: OFF, 1 day, 2 days, 3 days, 7 days, or every admin login.
- When due, the application asks whether the admin wants a local JSON + XLSX backup.

## Firebase Data Status
- Reads actual mapped Firestore collections.
- Shows collection counts, total documents, latest known activity and status.
- Includes the recovery archive collections in the diagnostic scan.
- Firebase plan quota information is kept conceptually separate from application data inventory.

## Files changed
- `src/App.jsx`
- `src/App.css`
- `src/components/common/Modal.jsx`
- `src/pages/AdminPage.jsx`
- `src/pages/AdminPage.css`
- `src/lib/adminBackup.js`
- `src/firestore.rules`
- `package.json`
- `package-lock.json`

## Deployment requirement
The included `src/firestore.rules` must be deployed to the Firebase project. The client code alone cannot enforce the registration PIN or administrator-only archive/security rules.
