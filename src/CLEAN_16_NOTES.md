# CLEAN 16 — IDs Hidden + 10-Row Pagination

Authoritative baseline: CLEAN 15.

## Requested changes only

### Technical IDs / UIDs
- Removed raw Firebase/document IDs from user-facing BH Reward details and BH Activity details.
- Removed raw IDs from CW Activity Details mapping and linked-record display.
- Technical IDs remain stored internally and continue to be used for Firebase relationships; they are not exposed in the UI.
- Claim/Reward/Schedule/Item/Player/UID labels are not shown as raw technical identifiers.

### Pagination
All user-facing main tables/ledgers use a maximum of 10 rows per page:
- BH notifications: 10
- BH Players & History roster: 10
- BH Rewards: 10
- BH Player History: 10
- CW notifications: 10
- CW Players & History roster: 10
- CW Treasury ledger: 10
- CW Guild Inventory: 10
- CW Item Catalog: 10
- CW inventory selection inside assignment: 10
- CW inventory selection inside spending: 10
- CW Player History: 10

Pagination resets appropriately when relevant filters/searches are changed.

## Preservation
- Based directly on CLEAN 15.
- No BH/CW notification architecture, claim behavior, styling, responsive layout, audit mappings, or prior fixes were intentionally reverted.
