# RAN EP7 CLEAN 38

## Organized Backup Export

The Administrator Portal backup now creates a complete local backup package:

```text
RAN_TODAY_YYYY-MM-DD/
├── RAN_TODAY_YYYY-MM-DD_CONSOLIDATED.json
├── RAN_TODAY_YYYY-MM-DD_CONSOLIDATED.xlsx
├── README.txt
└── Excel/
    ├── 00_Summary.xlsx
    ├── players.xlsx
    ├── bhAttendance.xlsx
    ├── cwAttendance.xlsx
    ├── bhRewards.xlsx
    ├── bhRewardClaims.xlsx
    ├── guildTickets.xlsx
    ├── guildNotices.xlsx
    ├── raidSchedules.xlsx
    ├── treasuryEntries.xlsx
    └── ...
```

The JSON is the exact restore format. The consolidated XLSX is the main human-readable workbook. The separate Excel folder is designed for people who want to open, filter, print, or send one table without dealing with a programmer-style export.

No Firebase Storage is required.
