# CLEAN 28 — Administrator Registration + Backup Reliability Fix

## Administrator registration
- Registration form is reset every time it opens; old administrator test values are never carried into a new registration.
- Registration is only allowed from the signed-out administrator login flow.
- The browser hashes the entered 6-digit registration PIN and submits the proof to Firestore.
- Firestore verifies that proof against the current protected `adminSettings/security.registrationPinHash` BEFORE Firebase Authentication creates the account.
- The new Auth identity can claim only its own PIN-verified pending request, with the request email matching the Auth email.
- The new administrator record is created before the request is marked verified, reducing the chance of an interrupted client update stranding the new administrator.
- A wrong PIN cannot create the `adminRequests` record and therefore never reaches `createUserWithEmailAndPassword`.
- Changing `123456` to `234567` immediately changes which hash Firestore accepts; no rules redeploy is required for the PIN value change itself.

## Important Firebase deployment
The included `src/firestore.rules` must be deployed once after this code/rules update. After that, PIN changes are data changes in `adminSettings/security` and do not require another rules deployment.

Deploy rules with:
`firebase deploy --only firestore:rules`

## Backup
- Complete backup reliably contains BOTH JSON and XLSX inside a dated ZIP folder: `RAN_TODAY_YYYY-MM-DD/`.
- Added explicit JSON-only and XLSX-only export controls for administrators.
- XLSX contains organized collection sheets plus the exact JSON payload in `Backup JSON` for lossless import.
- Existing 90-day recovery archives remain unchanged.

## Verification performed
- Static source inspection of App registration flow, Firestore rules, Firebase config imports, backup functions, and admin portal wiring.
- Confirmed SHA-256 values used by the default PIN logic:
  - 123456 → 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
  - 234567 → 2dc0269fa54d269a87536810ec453cb095b4b92f45e63826a21dff1c2e76f169
- Full Vite build could not be executed in this environment because dependencies are not installed in the working copy (`vite: not found`).
