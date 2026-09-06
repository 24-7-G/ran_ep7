# CLEAN 32 — BACKUP DOWNLOAD FIX

# Latest Changelog — CLEAN 31

- CLEAN 31: supplied RAN V emblem is now the global brand icon and favicon.
- CLEAN 31: added role-aware GUIDE/manual with a full first-time administrator walkthrough.
- CLEAN 31: guide is available from the global header for visitors, users, and administrators.
- CLEAN 31: retained CLEAN 30 Spark/no-Storage baseline and Firebase registration/security work.

# Latest Changelog

## CLEAN 16
- Hide technical Firebase IDs/UIDs from user-facing detail panels.
- Keep internal IDs for database relationships.
- Enforce 10-row pagination across BH/CW main tables and ledgers.
- Add CW Treasury ledger pagination.
- Add 10-row pagination to CW Guild Inventory and Item Catalog.
- Change CW spending/assignment inventory selectors from 5 to 10 per page.
- Preserve CLEAN 15 as the starting baseline.


## CLEAN 30 — Spark Plan
- Removed Firebase Storage dependency and deployment.
- Backups remain local JSON + XLSX ZIP with Firestore metadata.
- Use `firebase deploy --only firestore:rules`.

## CLEAN 41 — 2026-09-05
- Replaced the multi-file Excel backup design with one human-readable workbook plus exact JSON restore.
- Removed custom `styles.xml` generation to address Microsoft's Excel repair dialog.
- Simplified worksheet OOXML for maximum Excel compatibility.
- Tightened `raidSchedules` and `cwSchedules` Firestore writes to active administrators.
