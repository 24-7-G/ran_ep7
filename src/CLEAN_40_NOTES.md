# RAN EP7 CLEAN 40 — XLSX Excel Compatibility / Reliability Fix

## Change
Reworked the browser-generated XLSX worksheet XML so the backup workbooks open directly in Microsoft Excel without the repair/recovery prompt.

## Fixed
- Removed risky worksheet merge/page-layout constructs from generated sheets.
- Added a standard worksheet dimension.
- Added a conservative frozen-header view with a valid selection.
- Normalized every generated row to exactly match the header column count.
- Kept the Firebase document ID inside the correct ID column.
- Added a proper Excel `Normal` cell style and worksheet style inheritance.
- Added `dxfs` and `tableStyles` declarations required by stricter Excel parsers.
- Added `xfId=0` to generated cell formats.
- Preserved XML 1.0 invalid-character sanitization.
- Preserved safe worksheet/file naming.
- Consolidated workbook and every separate `Excel/*.xlsx` workbook use the same corrected generator.
- JSON restore backup is unchanged.
- No Firebase Storage / Blaze dependency added.

## Validation
- Generated a consolidated workbook plus all 24 configured Firebase table workbooks and a summary workbook.
- All 26 generated XLSX files loaded successfully with openpyxl with no workbook warnings.
- Consolidated and summary workbooks were also opened and re-saved by LibreOffice Calc successfully.

CLEAN 40 is the authoritative baseline for the XLSX backup generator.
