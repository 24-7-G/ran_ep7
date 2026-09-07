# CLEAN 30

Removed Firebase Storage so the project remains on the Spark/no-cost plan. Cloud Storage for Firebase requires Blaze, so the application no longer initializes or calls Firebase Storage.

Backup behavior:
- Generates complete JSON backup in browser.
- Generates XLSX backup in browser.
- Downloads one ZIP containing both.
- Records backup metadata in Firestore collection `adminBackups`.
- Does not upload backup files to Firebase Storage.

No BH/CW/Raid/Treasury/Tickets functionality was intentionally changed.
