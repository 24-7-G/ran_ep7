# RAN EP7 CLEAN 13

Authoritative continuation of CLEAN 12.

## Requested changes only

1. Record lists prioritize the most recently `updatedAt` record, with safe fallbacks to creation/event timestamps.
2. BH reward `CLAIM` is now an atomic Firestore transaction: verify assigned player + AVAILABLE status, create the claim record, then mark the reward CLAIMED.
3. Unified audit logging is strengthened without changing the existing BH/CW/Raid flows.

## Audit connections

### Raid + Boss Hunt
- Raid schedule changes log old/new days, time, timezone, schedule type, interval, anchor, active state, actor, and the connection into BH future attendance occurrences.
- BH attendance, players, rewards, claims, Duck Race, scoring, and reward ownership changes carry structured actor/entity/recipient/connection data.
- Reward owner/player movement is logged as a before/after change.
- Weapon claim, claim edit, and claim removal are linked to reward + player + claim records.

### Clan War + Treasury
- Salary attendance records identify the player receiving salary and the linked Treasury attendance source.
- Salary edits log old/new salary and the actor.
- Item distributions identify recipient, item, quantity, cost, and Treasury linkage.
- Item reassignment/deletion logs ownership and quantity changes plus Treasury reversals.
- Treasury edits/deletes/overrides preserve actor, reason, old/new values, and linked CW records.
- CW schedule changes log old/new days and time plus actor and affected CW flow.

## Notification detail

Notification detail views expose:
- actor
- recipient / owner
- created timestamp
- last updated timestamp
- module
- primary record
- linked player/reward/claim/item/Treasury/schedule records
- action details
- normalized before/after changes

No existing BH/CW styling, permissions, navigation, pagination, or workflow was intentionally removed.
