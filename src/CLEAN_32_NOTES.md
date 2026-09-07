# CLEAN 32 — BACKUP DOWNLOAD FIX

- Fixed `saveBackupMetadata is not defined` in the Administrator Portal backup flow.
- Added the missing Firestore `adminBackups` metadata writer using a generated document ID.
- `BACKUP + DOWNLOAD BOTH • ZIP` now records lightweight backup metadata in Firestore and downloads the consolidated ZIP locally.
- Local download continues to use the browser's normal download behavior (typically the default Downloads folder).
- No Firebase Storage dependency; Spark/no-cost plan design preserved.
- CLEAN 31 remains the functional baseline; this is an incremental bug fix only.
