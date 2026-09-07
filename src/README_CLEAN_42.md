# RAN Online EP7 Classic — CLEAN 41

CLEAN 41 is the authoritative source package for this release.

### Main changes
- Simplified backup into one readable XLSX + one exact JSON restore file.
- Removed the separate `Excel/` folder and 20+ confusing individual XLSX files.
- Rebuilt XLSX generation using conservative OOXML with no styles.xml.
- Human sheets cover Players, BH, CW, Inventory, Treasury, Tickets, Activity Log, and Raid/CW schedules.
- Technical/security data remains in the exact JSON restore backup.
- Tightened Raid Schedule and CW Schedule writes to administrators.

### Backup output
```text
RAN_TODAY_YYYY-MM-DD/
├── RAN_TODAY_YYYY-MM-DD.xlsx
├── RAN_TODAY_YYYY-MM-DD.json
└── README.txt
```

Do not treat older CLEAN 39/40 packages as the latest source after adopting CLEAN 41.


CLEAN 42 is the authoritative version for the public Raid Schedule editing change.
