# CLEAN 23 — Administrator Portal & Data Management

Based on CLEAN 22.

## Added
- Administrator Portal opened by clicking the ADMIN badge.
- Administrator display name and email editing.
- Administrator password change with current-password reauthentication.
- Historical actor synchronization across mapped ledger/audit collections using the administrator UID; readable names are updated instead of exposing Firebase UIDs.
- New administrator registration flow from the login modal.
- Six-digit administrator registration PIN, default `123456`.
- Existing administrators approve pending registrations after PIN-hash verification.
- Six-digit factory reset PIN, default `123456`, independently changeable.
- Complete mapped Firestore backup to organized XLSX plus exact JSON restore snapshot.
- Restore modes: merge or replace all mapped operational collections.
- Data Status scan with document counts and latest activity timestamps.
- Monthly audit consolidation for old `guildNotices` records into `guildNoticeArchives` summaries.
- Protected factory reset that preserves administrator accounts and security settings.
- Internal Firebase document IDs / UIDs are not rendered as normal application content.

## Backup scope
The backup maps all application collections currently used by the app, including raids, players, BH attendance/rewards/history, CW attendance/players/schedules/items/assignments, treasury, tickets, guild notices, and administrator metadata.

Firebase Authentication passwords cannot be exported by design. Email/display-name/admin metadata can be backed up, while Auth accounts must be recreated or password-reset after a full restore.

## Security note
The six-digit registration PIN is handled as a SHA-256 hash in the pending registration request and security settings. A registration remains pending until an active administrator approves it. This avoids granting administrator privileges directly from the public registration form.
