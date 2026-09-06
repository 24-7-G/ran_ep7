# RAN EP7 CLEAN 30 — Spark Plan / Firebase Storage Removal

- Firebase project: `ran-ep7-90428`
- Firebase Storage intentionally removed.
- No `storageBucket`, `getStorage`, `firebase/storage`, Storage rules, or Storage deployment.
- Backups are generated locally as a ZIP containing JSON + XLSX + README.
- Firestore stores lightweight backup metadata only.
- 90-day archive/recovery remains in Firestore.
- Deploy only Firestore rules:

```powershell
firebase use ran-ep7-90428
firebase deploy --only firestore:rules
```
