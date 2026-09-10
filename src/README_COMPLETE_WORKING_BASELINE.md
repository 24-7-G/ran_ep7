# RAN EP7 — COMPLETE WORKING BASELINE

This package is based on the latest application source and preserves the newer BH/CW bulk systems.

## Correct project root

Run commands from this folder. `package.json`, `index.html`, `main.jsx`, `App.jsx`, `pages/`, `components/`, and `lib/` are all at this level.

## Local development

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

Do NOT open `/ran_ep7/src/main.jsx` manually.

## Production / GitHub Pages

```powershell
npm run build
npm run deploy
```

Production uses `/ran_ep7/` as the Vite base; local development uses `/`.

## Preserved BH bulk features

- Unified single/bulk player add
- One or many IGNs
- Multiple player groups
- Add Another Group
- Duplicate/existing player validation
- Bulk Add Attendance
- Bulk Edit Attendance
- Bulk Redo Attendance
- Bulk Delete Attendance
- Bulk Edit Players
- Bulk Disable Players
- Bulk Delete Players
- Bulk Edit Rewards
- Bulk Delete Rewards
- Bulk Edit Claims
- Bulk Delete Claims

## Preserved CW bulk features

- Unified single/bulk player add
- Multiple groups
- Class / Role / Preferred Weapon
- Duplicate/existing validation
- Bulk Edit Salary
- Bulk Assign Item
- Bulk Edit Item
- Bulk Delete Items
- Bulk Add Attendance
- Bulk Edit Attendance
- Bulk Redo Attendance
- Bulk Delete Attendance
- Bulk Edit Players
- Bulk Disable Players
- Bulk Delete Players

## Baseline rule

Do not reintroduce the old nested `src/src` project or deploy a stale `dist` from another copy. Future changes must start from this complete baseline and preserve existing functionality.
