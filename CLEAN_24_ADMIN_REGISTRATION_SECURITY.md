# CLEAN 24 — Administrator Registration Security

## Behavior
- The 6-digit administrator registration PIN is checked BEFORE Firebase Authentication creates an account.
- Wrong PIN: Firestore rejects the registration request and NO Firebase Auth user is created.
- Correct PIN: the Firebase account is created, linked to a verified registration request, and an active `adminUsers` record is created.
- A normal Firebase-authenticated user without an active `adminUsers` record remains a USER.
- The existing root administrator UID remains an administrator.
- Default first-install registration PIN remains `123456` until changed in Administrator Portal.

## Important deployment step
Deploy the included `src/firestore.rules` to Firebase. The application code alone cannot enforce this security rule.

## Existing bad test accounts
Accounts that were already created during incorrect-PIN testing remain in Firebase Authentication because they already exist. They are not automatically deleted by this patch. Delete those unwanted test accounts once from Firebase Authentication. Future incorrect PIN attempts will not create new Auth users.


## CLEAN 25 hotfix — configurable registration PIN
- Fixed the security-document initialization bug that could leave `registrationPinHash` empty.
- Existing configured PINs are never overwritten.
- Empty/legacy PIN fields are repaired to the first-install default `123456`.
- The Firestore registration rule uses the configured hash when present, and only falls back to `123456` when the security field is genuinely missing/empty.
- A correct current PIN can retry an interrupted registration request.
- A wrong PIN is still rejected before `createUserWithEmailAndPassword()` is reached.
