# RAN EP7 CLEAN 29 — Administrator Registration Security Fix

This package preserves the CLEAN 28 application and fixes the administrator registration flow.

## Critical registration fix

The previous registration implementation generated the `adminRequests` document ID from email + PIN. That could collide with an older failed/abandoned request and cause a correct PIN to be rejected later.

CLEAN 29 uses a cryptographically random request document ID for every registration attempt.

Correct PIN flow:

`PIN -> SHA-256 proof -> Firestore rule validation -> Firebase Auth account -> adminUsers/{uid} active=true`

Wrong PIN flow:

`PIN -> SHA-256 proof -> Firestore rejects request -> Firebase Auth is never called -> no account`

## Required once

Deploy the included rules to the same Firebase project:

```powershell
firebase use ran-ep7-90428
firebase deploy --only firestore:rules
```

After that, changing the registration PIN in the Admin Portal changes the active PIN immediately; another rules deployment is not required.

See `ADMIN_REGISTRATION_DEPLOYMENT.md` for the exact flow and troubleshooting.
