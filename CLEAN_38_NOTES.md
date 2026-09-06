# CLEAN 38 — Organized Backup Excel Folder

Baseline: CLEAN 37.

Changes:
- Expanded the existing Backup + Download Both ZIP workflow.
- ZIP now contains a separate `Excel/` folder.
- `Excel/00_Summary.xlsx` contains a human-readable backup summary and table guide.
- Every Firebase application collection included in the backup gets its own separate XLSX file in `Excel/`.
- Human-readable Excel tables use friendly column headers such as Player ID, Player Name, Date, Created By, Created At, Updated At, Reward Name, Salary, Status, etc.
- Known collection fields are ordered logically; unknown fields remain included afterward so no data is silently omitted.
- XLSX worksheets have a title, subtitle, frozen header row, filters, readable column widths, borders, and landscape print setup.
- Consolidated XLSX remains importable through the existing `Backup JSON` exact-payload sheet.
- Local folder save now creates the same `Excel/` folder and individual XLSX files when the browser supports `showDirectoryPicker`.
- Firebase Storage is still not used; the project remains Spark-plan compatible.
- Existing BH/CW/Raid/Tickets/Admin/registration/restore functionality is preserved.
