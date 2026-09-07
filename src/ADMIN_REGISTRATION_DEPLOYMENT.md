# Admin Registration — Required Firebase Deployment

The administrator registration flow is intentionally protected by Firestore rules.
A browser cannot be trusted to decide whether a PIN is correct.

## One-time deployment

From the project root:

```powershell
firebase use ran-ep7-90428
firebase deploy --only firestore:rules
```

The included `firebase.json` points to `src/firestore.rules`.

## Registration flow

1. Visitor opens ADMIN LOGIN while signed out.
2. REGISTER NEW ADMIN always starts with a completely blank form.
3. The browser SHA-256 hashes the entered 6-digit PIN.
4. The browser creates a new random `adminRequests/{randomId}` document.
5. Firestore rules compare that hash with `adminSettings/security.registrationPinHash`.
6. If the PIN is wrong, step 4 is rejected and Firebase Authentication is never called. No account is created.
7. If the PIN is correct, Firebase Authentication creates the account.
8. The new authenticated UID can claim only its own verified request and create `adminUsers/{uid}` with `active: true`.
9. The registration request is marked verified.

## Changing the PIN

An active administrator changes the PIN from ADMIN PORTAL → ADMIN ACCESS.
The new SHA-256 hash is saved to `adminSettings/security`. The Firestore rule reads the current document dynamically, so changing the PIN does not require another rules deployment.

Example:

- old PIN: `123456`
- new PIN: `234567`
- `123456` is immediately rejected
- `234567` is accepted

## Important

If the application shows `permission-denied` for registration even with the correct PIN, deploy the included Firestore rules first. Do not loosen the rules to `allow write: if true`; that would defeat the security design.
