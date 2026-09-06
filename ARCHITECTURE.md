# RAN Online EP7 Guild Dashboard — Clean Structure

This package keeps the existing application flow and Firebase data behavior while removing duplicate V1/V2 source files and generated build artifacts.

## Canonical pages
- `src/pages/BHPage.jsx` — canonical Boss Hunt page, based on the previously approved BH V2 implementation.
- `src/pages/BHPage.css` — canonical Boss Hunt styles, based on the previously approved BH V2 styles.
- `src/pages/CWPage.jsx` — canonical Clan War page with the 3-tab navigation and Activity & Notifications drawer.
- `src/pages/CWPage.css` — canonical Clan War styles.

## Structure
- `src/components/common/` — reusable UI components.
- `src/lib/` — Firebase configuration, constants, timezone and time utilities.
- `src/pages/` — route-level page components and page-specific CSS.
- `src/assets/`, `src/bosses/`, `src/icons/` — static visual assets.

## Removed duplication
- No `V1`/`V2` page filenames.
- Removed `src - Copy/`.
- Removed duplicate root-level source files.
- Removed generated `dist/`.
- Removed backup `RaidPage.jsx.bak`.
- `App.jsx` is the single application entry component.

## Important
The refactor is intentionally conservative: page logic remains in the page modules so behavior, Firestore collections, permissions, attendance, rewards, notifications, schedules, and existing UI flow are not rewritten merely for file organization.

## CLEAN 23 Admin/Data Management
- `src/pages/AdminPage.jsx` — administrator control center
- `src/pages/AdminPage.css` — responsive administrator UI
- `src/lib/adminBackup.js` — complete mapped Firestore backup/restore and dependency-free XLSX writer
- `src/lib/firebase.js` — Firebase configuration and clients
- `src/components/common/Header.jsx` — ADMIN badge opens the administrator portal
