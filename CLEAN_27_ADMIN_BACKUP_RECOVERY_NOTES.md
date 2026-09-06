# CLEAN 27 — Admin Backup / Recovery Hotfix

## Fixed
- Daily/interval backup reminder no longer reopens repeatedly on the same local calendar day.
- Choosing `NO, NOT NOW` suppresses the reminder for the rest of that local day.
- A successful backup suppresses the reminder for the rest of that local day.
- A single backup action now downloads one ZIP bundle containing BOTH JSON and XLSX, avoiding browser multi-download blocking.
- Bundle structure is `RAN_TODAY_YYYY-MM-DD/` with matching consolidated JSON, XLSX, and README.
- XLSX remains importable because it contains the exact backup JSON payload in its `Backup JSON` sheet.
- Recovery archive metadata now records the same `RAN_TODAY_YYYY-MM-DD` date folder name.
- Recovery archives remain 90-day restore points and are purged only after expiration.
- PIN save is read-back verified against Firestore before the UI reports success.

## Administrator registration security
The registration flow still verifies the submitted SHA-256 PIN hash through Firestore rules BEFORE creating a Firebase Authentication account.

If the registration PIN is changed from `123456` to `234567`, only `234567` is accepted after the security document and rules are deployed.

**Deploy `src/firestore.rules` to Firebase after any rules change.** The browser client cannot replace Firestore's server-side security enforcement.
