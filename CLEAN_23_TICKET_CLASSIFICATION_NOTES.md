# CLEAN 23 — Structured Support Ticket Classification

## Changes
- Added a structured `issueType` field separate from the free-text `subject`.
- Category remains authoritative and is never inferred from the subject.
- Issue Type options change automatically when Category changes.
- Added Issue Type filtering to the admin queue.
- Added Issue Type to ticket rows and ticket detail view.
- Category quick filters now cover every supported category, including OTHER.
- Existing tickets without `issueType` remain compatible and display as OTHER.
- Search also includes the structured issue type.
- Kept existing Firebase collection `guildTickets` and existing ticket workflow/PIN behavior.
- Kept 10-ticket pagination.
- Added responsive filter layout for desktop, laptop, tablet, and phone widths.

## Stored fields for new tickets
- `category`
- `issueType`
- `priority`
- `subject`
- `question`

`subject` is intentionally free text. Filtering uses the structured `category` and `issueType` fields, not the subject wording.
