# RAN EP7 CLEAN 18 — CW Quantity Input Fix

## Change
Fixed the Clan War **Assign Item to Player • Inventory** quantity fields so they accept normal integer quantities including **1, 2, 3, 4, 5, 6, 7, 8, 9, 10+**.

## What changed
- Quantity inputs no longer use the money formatter.
- Quantity values are sanitized as plain integer digits.
- Row quantity inputs use a text/numeric-input mode so browser `min` behavior cannot interfere with typing.
- Mouse/focus events on quantity inputs no longer bubble into the inventory-row selection handler.
- The existing multi-item selection and per-item quantity behavior is preserved.
- Existing save validation still requires quantity >= 1 and still checks available stock.

## Preservation rule
No other CW/BH functionality was intentionally changed. CLEAN 17 remains the source baseline; this is CLEAN 18 with only the quantity-input fix.
