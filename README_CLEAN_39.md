# RAN EP7 CLEAN 39

CLEAN 39 is the authoritative baseline following CLEAN 38.

This version fixes the Excel backup files that could trigger Microsoft's Excel repair dialog.
The primary cause was a mismatch between the exported header count and data-row count when a Firebase document ID was synthesized as the `id` column. CLEAN 39 keeps the ID inside the same column mapping as its header.

Additional protections were added for XML-invalid control characters and Excel-invalid worksheet names.

The backup remains Spark/no-cost-plan compatible: Firebase Storage is not used.
