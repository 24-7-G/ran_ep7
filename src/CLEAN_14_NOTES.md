# CLEAN 14 — Latest BH Claim Fix

Authoritative baseline: CLEAN 13.

## Only change in CLEAN 14
Fixed the Boss Hunt reward inventory CLAIM button crash:

- Added the missing `saving` / `setSaving` React state used by the BH reward claim action.
- The existing `claimReward()` flow is unchanged.
- The existing `rewardSaving` state remains separate for reward-form operations.
- No BH/CW UI, notification, audit, responsive, history, reward, schedule, or data behavior was intentionally changed.

## Error fixed
`ReferenceError: saving is not defined`

The CLAIM button can now render and use its existing `CLAIMING...` busy state correctly.
