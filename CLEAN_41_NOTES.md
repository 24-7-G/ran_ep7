# RAN EP7 CLEAN 41 — SIMPLE HUMAN BACKUP + XLSX COMPATIBILITY

## Authoritative version
CLEAN 41 is the new authoritative source package. It starts from CLEAN 40 and changes only the backup/XLSX architecture plus the identified schedule write permissions.

## Backup redesign
- One human-readable XLSX workbook per backup.
- One exact JSON restore file per backup.
- README included.
- Removed the confusing `Excel/` folder and separate table-by-table XLSX files.
- XLSX sheets use normal-language headings and practical columns for guild management.
- Technical/security collections remain preserved in the exact JSON backup rather than being exposed as confusing programmer-oriented sheets.
- XLSX keeps a hidden `Backup JSON` sheet so application-generated XLSX backups remain importable.

## XLSX compatibility strategy
- Removed generated `styles.xml` completely.
- Removed cell style references.
- Removed panes, filters, merged cells, page setup, and other optional OOXML constructs.
- Kept worksheet XML deliberately conservative: workbook relationships, content types, worksheets, dimensions, rows, and inline strings only.
- Sanitizes XML 1.0 control characters and malformed surrogate code units.
- Every row is normalized to its header count.

## Validation performed
- Generated a full representative workbook containing all human sheets and the hidden restore sheet.
- `unzip -t` passed with no errors.
- `openpyxl` loaded the workbook successfully and recognized all sheets, including the hidden Backup JSON sheet.
- LibreOffice Calc opened and re-saved the workbook successfully.
- Microsoft Excel is the final compatibility target; unlike CLEAN 40, CLEAN 41 no longer generates the styles.xml part that caused the user's Excel repair log.

## Security change
- `raidSchedules`: public read, administrator-only write.
- `cwSchedules`: public read, administrator-only write.
- The guest PIN-based ticket workflow was intentionally not changed in CLEAN 41 because changing those Firestore rules would break the current unauthenticated ticket edit/delete flow. This remains a separate security hardening task.

## No Firebase Storage
Backups continue to be downloaded locally. Firebase stores lightweight backup metadata only.
