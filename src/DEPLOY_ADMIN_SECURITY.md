# RAN EP7 — ADMIN SECURITY / REGISTRATION / BACKUP DEPLOYMENT

Project: `ran-ep7-90428`

## 1. Deploy Firestore + Storage rules

Run from the project root:

```powershell
firebase login
firebase use ran-ep7-90428
firebase deploy --only firestore:rules,storage
```

If Firebase CLI reports that Storage is not initialized, enable Firebase Storage in the Firebase Console first, then run the deploy again.

## 2. Registration security flow

The active registration PIN is stored as SHA-256 in:

```text
adminSettings/security.registrationPinHash
```

Default first-install PIN:

```text
123456
```

When an administrator changes it to `234567`, the new SHA-256 hash is saved immediately. No rules redeployment is required for the PIN change.

A new administrator registration works as follows:

1. Signed-out visitor enters name, email, password and 6-digit PIN.
2. App creates a harmless `adminRequests/{randomId}` document with `pending_pin`.
3. App requests the same document to move to `verified_pending_auth`.
4. Firestore rules compare the submitted SHA-256 PIN proof with the current protected registration PIN hash.
5. Wrong PIN: the update is denied. Firebase Authentication is NOT called. No Auth account is created.
6. Correct PIN: update succeeds.
7. Only then does Firebase Authentication create the account.
8. The new UID creates its own `adminUsers/{uid}` record with `active: true`.
9. The registration request is marked verified.

## 3. Test after deployment

Set registration PIN in Admin Portal to `234567`.

Then log out and test a new email:

```text
123456 -> MUST FAIL, no Firebase Auth account
234567 -> MUST SUCCEED, Firebase Auth account + adminUsers record
```

## 4. Backup behavior

`BACKUP + DOWNLOAD BOTH • ZIP` now:

- reads the configured Firebase collections;
- creates exact JSON;
- creates organized XLSX;
- stores BOTH JSON and XLSX in Firebase Storage under:

```text
backups/RAN_TODAY_YYYY-MM-DD/
```

- stores backup metadata in Firestore `adminBackups`;
- downloads a local ZIP containing:

```text
RAN_TODAY_YYYY-MM-DD/
  RAN_TODAY_YYYY-MM-DD_CONSOLIDATED.json
  RAN_TODAY_YYYY-MM-DD_CONSOLIDATED.xlsx
  README.txt
```

Chrome/Edge also support `SAVE BOTH TO FOLDER`, which lets the administrator select the local Downloads folder and creates the dated folder directly.

## 5. Recovery archives

Factory reset and replace restore create an administrator-only recovery archive first.

Retention is 90 days. After expiration, archive chunks are permanently purged when the maintenance/archive cleanup runs.

## 6. Important security note

Do NOT replace the Firestore registration rules with `allow write: if true`.
The PIN gate exists specifically to prevent a visitor from creating an administrator account without the correct current PIN.
