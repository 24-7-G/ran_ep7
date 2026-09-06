# RAN Online EP7 Classic — CLEAN 28

This package keeps the existing application flow and adds the administrator registration/backup reliability fixes.

## Administrator registration security
1. Administrator registration is opened from the signed-out ADMIN LOGIN screen.
2. The form is cleared every time it opens, so previous administrator/test values are not reused.
3. The entered 6-digit PIN is SHA-256 hashed in the browser.
4. Firestore rules compare that hash to `adminSettings/security.registrationPinHash` before a Firebase Auth account is created.
5. A wrong PIN is rejected at Firestore and never reaches Firebase Authentication account creation.
6. A correct PIN creates the Firebase account, then the new Auth identity can claim only its own PIN-verified registration request.
7. The new account receives `adminUsers/{uid}` with `active: true`, so it becomes an administrator.
8. Normal signed-in users without an active `adminUsers` record remain USER.
9. Changing the registration PIN in Administrator Portal changes the accepted PIN immediately after the Firestore write. The rules read the current security document dynamically, so changing the PIN does not require another rules deployment.

## Firebase rules deployment
The rules file is now wired through `firebase.json`:

`firebase deploy --only firestore:rules`

This rules deployment is required once after installing CLEAN 28 / changing the rules file. It is not required each time an administrator changes the PIN value.

## Backup
- `DOWNLOAD BOTH • ZIP` creates a dated `RAN_TODAY_YYYY-MM-DD/` folder inside the ZIP.
- The folder contains matching `CONSOLIDATED.json`, `CONSOLIDATED.xlsx`, and README files.
- The XLSX has readable sheets per collection and an exact `Backup JSON` sheet for lossless import.
- `JSON ONLY` and `XLSX ONLY` are also available.
- JSON and XLSX can both be imported by Administrator Portal.

## Recovery
Factory reset and replace restores create Firestore recovery archives retained for 90 days. Administrator Portal provides `RESTORE POINT`. Expired archives are permanently purged when the maintenance/archive cleanup runs.

## Reminder
Backup reminders support OFF, 1/2/3/7 days, or every administrator login. A reminder is suppressed for the rest of the local calendar day after either a successful backup or `NO, NOT NOW`.

## Validation
- Relative source imports checked: no unresolved local imports found.
- App.jsx, AdminPage.jsx and adminBackup.js delimiter counts are balanced.
- Firestore rules parentheses/braces are balanced.
- The full Vite build was not run in this environment because the working copy has no installed `node_modules`; `npm ci` timed out before installing Vite.
