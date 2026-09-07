import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  Timestamp,
  GeoPoint,
  serverTimestamp,
} from "firebase/firestore";

// Every application collection that participates in the complete backup.
// Keep this list in one place so Backup / Restore / Data Status use the same map.
export const BACKUP_COLLECTIONS = [
  "raids",
  "raidSchedules",
  "players",
  "bhAttendance",
  "bhBalances",
  "bhRewards",
  "bhRewardClaims",
  "bhDuckRaceStatus",
  "bhScoring",
  "bhScoringHistory",
  "cwPlayers",
  "cwAttendance",
  "cwSchedules",
  "cwSettings",
  "cwItems",
  "cwItemAssignments",
  "cwInventoryTransactions",
  "treasuryEntries",
  "treasuryConfig",
  "guildTickets",
  "guildNotices",
  "adminUsers",
  "adminRequests",
  "adminSettings",
];

export const ARCHIVE_META_COLLECTION = "adminArchives";
export const ARCHIVE_CHUNK_COLLECTION = "adminArchiveChunks";
export const ARCHIVE_RETENTION_DAYS = 90;

const safe = (value) => {
  if (value == null) return null;
  if (typeof value?.toDate === "function" && value?.seconds != null) {
    return { __type: "timestamp", value: value.toDate().toISOString() };
  }
  if (value instanceof Date) return { __type: "timestamp", value: value.toISOString() };
  if (value instanceof GeoPoint) {
    return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(safe);
  if (typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([key, item]) => { out[key] = safe(item); });
    return out;
  }
  return value;
};

const restoreValue = (value) => {
  if (Array.isArray(value)) return value.map(restoreValue);
  if (value && typeof value === "object") {
    if (value.__type === "timestamp") return Timestamp.fromDate(new Date(value.value));
    if (value.__type === "geopoint") return new GeoPoint(Number(value.latitude), Number(value.longitude));
    const out = {};
    Object.entries(value).forEach(([key, item]) => { out[key] = restoreValue(item); });
    return out;
  }
  return value;
};

export async function readBackup(db, { collections = BACKUP_COLLECTIONS, includeEmpty = true } = {}) {
  const snapshot = {
    format: "RAN-EP7-GUILD-BACKUP",
    version: 2,
    exportedAt: new Date().toISOString(),
    application: "RAN Online EP7 Classic Guild Management",
    collections: {},
  };

  for (const collectionName of collections) {
    const snap = await getDocs(collection(db, collectionName));
    if (includeEmpty || snap.size) {
      snapshot.collections[collectionName] = snap.docs.map((item) => ({
        id: item.id,
        data: safe(item.data()),
      }));
    }
  }
  return snapshot;
}

export async function restoreBackup(db, backup, { replace = false, onProgress } = {}) {
  if (!backup || backup.format !== "RAN-EP7-GUILD-BACKUP" || !backup.collections) {
    throw new Error("This file is not a valid RAN EP7 guild backup.");
  }

  const collections = Object.entries(backup.collections)
    .filter(([name]) => BACKUP_COLLECTIONS.includes(name));
  const total = collections.reduce((sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  let done = 0;

  if (replace) {
    for (const [collectionName] of collections) {
      const snap = await getDocs(collection(db, collectionName));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
    }
  }

  for (const [collectionName, rows] of collections) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 450) {
      const batch = writeBatch(db);
      rows.slice(i, i + 450).forEach((row) => {
        if (!row?.id || !row?.data) return;
        batch.set(doc(db, collectionName, String(row.id)), restoreValue(row.data), { merge: false });
      });
      await batch.commit();
      done += Math.min(450, rows.length - i);
      onProgress?.({ done, total, collectionName });
    }
  }

  return { total, collections: collections.length };
}

/* -------------------------------------------------------------------------- */
/* XLSX — human-readable Excel export                                         */
/*                                                                            */
/* IMPORTANT: Keep this workbook intentionally simple. It is a human backup,  */
/* not a Firebase programmer dump. The exact machine restore remains JSON.    */
/* We deliberately do NOT generate styles.xml, panes, filters, merged cells,  */
/* or other optional OOXML features here. This produces conservative XLSX      */
/* files that Microsoft Excel can open without its repair/recovery dialog.    */
/* -------------------------------------------------------------------------- */

function xmlEscape(value) {
  // XML 1.0 does not allow most C0 control characters. Also normalize lone
  // surrogate code units so TextEncoder cannot turn them into malformed XML.
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "�")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1�");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelColumnName(number) {
  let n = Math.max(1, Number(number) || 1);
  let out = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const HUMAN_FIELD_NAMES = {
  id: "Record ID",
  uid: "User ID",
  playerId: "Player ID",
  playerName: "Player Name",
  ign: "Player Name",
  displayName: "Name",
  email: "Email",
  name: "Name",
  class: "Class",
  level: "Level",
  status: "Status",
  active: "Active",
  role: "Role",
  category: "Category",
  issueType: "Issue Type",
  subject: "Subject",
  description: "Description",
  question: "Question",
  answer: "Answer",
  details: "Details",
  action: "Action",
  changes: "Changes",
  date: "Date",
  created: "Created",
  createdBy: "Created By",
  createdByUid: "Created By User ID",
  createdAt: "Created At",
  updatedAt: "Updated At",
  updatedBy: "Updated By",
  updatedByUid: "Updated By User ID",
  claimedAt: "Claimed At",
  claimedBy: "Claimed By",
  rewardId: "Reward ID",
  rewardName: "Reward Name",
  reward: "Reward",
  claimId: "Claim ID",
  points: "Points",
  pointsUsed: "Points Used",
  balance: "Balance",
  cost: "Cost (Points)",
  stock: "Stock",
  quantity: "Quantity",
  itemId: "Item ID",
  itemName: "Item Name",
  item: "Item",
  salary: "Salary",
  amount: "Amount",
  result: "Result",
  boss: "Boss",
  bossId: "Boss ID",
  bossName: "Boss Name",
  schedule: "Schedule",
  scheduleTime: "Schedule Time",
  timezone: "Timezone",
  type: "Type",
  joinDate: "Join Date",
  attendanceDate: "Attendance Date",
  occurrenceDate: "Occurrence Date",
  recordId: "Record ID",
  ticketId: "Ticket ID",
  reason: "Reason",
  label: "Label",
  expiresAt: "Expires At",
  backupDate: "Backup Date",
};

const HUMAN_COLLECTION_NAMES = {
  raids: "Raids",
  raidSchedules: "Raid Schedule",
  players: "Players",
  bhAttendance: "BH Attendance",
  bhBalances: "BH Balances",
  bhRewards: "BH Rewards",
  bhRewardClaims: "BH Reward Claims",
  bhDuckRaceStatus: "BH Duck Race Status",
  bhScoring: "BH Scoring",
  bhScoringHistory: "BH Scoring History",
  cwPlayers: "CW Players",
  cwAttendance: "CW Attendance",
  cwSchedules: "CW Schedule",
  cwSettings: "CW Settings",
  cwItems: "CW Items / Inventory",
  cwItemAssignments: "CW Item Assignments",
  cwInventoryTransactions: "CW Inventory Transactions",
  treasuryEntries: "Guild Treasury",
  treasuryConfig: "Treasury Settings",
  guildTickets: "Guild Tickets",
  guildNotices: "Activity Log / Notices",
  adminUsers: "Administrators",
  adminRequests: "Admin Registration Requests",
  adminSettings: "Admin Settings",
};

function humanCollectionName(name) {
  return HUMAN_COLLECTION_NAMES[name] || String(name || "Data")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanFieldName(field, collectionName = "") {
  if (field === "id") {
    const lower = String(collectionName).toLowerCase();
    if (lower.includes("player")) return "Player ID";
    if (lower.includes("reward")) return "Reward ID";
    if (lower.includes("ticket")) return "Ticket ID";
    return "Record ID";
  }
  if (HUMAN_FIELD_NAMES[field]) return HUMAN_FIELD_NAMES[field];
  return String(field || "Field")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayCellValue(value) {
  if (value == null) return "";
  if (value && typeof value === "object" && value.__type === "timestamp") return value.value || "";
  if (value && typeof value === "object" && value.__type === "geopoint") return `${value.latitude}, ${value.longitude}`;
  if (Array.isArray(value)) return value.map(displayCellValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanValue(row, ...keys) {
  for (const key of keys) {
    if (key === "id") return row?.id ?? "";
    if (row?.data && row.data[key] !== undefined && row.data[key] !== null) return row.data[key];
  }
  return "";
}

function recordRows(backup, collectionName) {
  return Array.isArray(backup.collections?.[collectionName]) ? backup.collections[collectionName] : [];
}

function humanRowsForCollection(backup, collectionName, columns) {
  return recordRows(backup, collectionName).map((record) =>
    columns.map((column) => displayCellValue(humanValue(record, ...(column.keys || []))))
  );
}

function combinedRows(backup, definitions) {
  const rows = [];
  for (const definition of definitions) {
    for (const record of recordRows(backup, definition.collection)) {
      rows.push(definition.map(record, backup));
    }
  }
  return rows;
}

const HUMAN_SHEETS = [
  {
    name: "Players",
    title: "PLAYERS",
    subtitle: "Guild roster — easy-to-read player information.",
    collection: "players",
    columns: [
      ["Player ID", ["playerId", "id"]], ["Player Name", ["playerName", "displayName", "name"]],
      ["Class", ["class"]], ["Level", ["level"]], ["Status", ["status"]], ["Join Date", ["joinDate"]],
    ],
  },
  {
    name: "BH Attendance",
    title: "BOSS HUNT ATTENDANCE",
    subtitle: "Attendance records and points earned.",
    collection: "bhAttendance",
    columns: [
      ["Date", ["date", "attendanceDate", "occurrenceDate"]], ["Player", ["playerName", "displayName", "playerId"]],
      ["Boss", ["bossName", "boss"]], ["Points", ["points"]], ["Status", ["status"]], ["Recorded By", ["createdBy", "updatedBy"]],
    ],
  },
  {
    name: "BH Balances",
    title: "BOSS HUNT BALANCES",
    subtitle: "Current attendance-point balances by player.",
    collection: "bhBalances",
    columns: [
      ["Player", ["playerName", "displayName", "playerId"]], ["Player ID", ["playerId", "id"]],
      ["Balance", ["balance", "points"]], ["Updated At", ["updatedAt", "createdAt"]],
    ],
  },
  {
    name: "BH Rewards",
    title: "BOSS HUNT REWARDS",
    subtitle: "Reward catalog, costs, stock, and status.",
    collection: "bhRewards",
    columns: [
      ["Reward ID", ["rewardId", "id"]], ["Reward Name", ["rewardName", "name"]], ["Type", ["type"]],
      ["Cost (Points)", ["cost"]], ["Stock", ["stock"]], ["Status", ["status"]],
    ],
  },
  {
    name: "BH Claims",
    title: "BOSS HUNT CLAIMS",
    subtitle: "Rewards actually claimed by players.",
    collection: "bhRewardClaims",
    columns: [
      ["Claim Date", ["claimedAt", "createdAt"]], ["Player", ["playerName", "displayName", "playerId"]],
      ["Reward", ["rewardName", "reward"]], ["Points Used", ["pointsUsed", "cost"]], ["Status", ["status"]], ["Claimed By", ["claimedBy", "createdBy"]],
    ],
  },
  {
    name: "BH Scoring",
    title: "BOSS HUNT SCORING",
    subtitle: "Current scoring configuration and records.",
    collection: "bhScoring",
    columns: [
      ["Player", ["playerName", "displayName", "playerId"]], ["Points", ["points", "score"]],
      ["Status", ["status"]], ["Updated At", ["updatedAt", "createdAt"]],
    ],
  },
  {
    name: "CW Players",
    title: "CLAN WAR PLAYERS",
    subtitle: "Clan War roster and player status.",
    collection: "cwPlayers",
    columns: [
      ["Player ID", ["playerId", "id"]], ["Player Name", ["ign", "playerName", "displayName", "name"]],
      ["Class", ["class"]], ["Level", ["level"]], ["Status", ["status", "active"]],
    ],
  },
  {
    name: "CW Attendance",
    title: "CLAN WAR ATTENDANCE",
    subtitle: "Clan War attendance, results, and salary records.",
    collection: "cwAttendance",
    columns: [
      ["Date", ["date", "attendanceDate", "occurrenceDate"]], ["Player", ["playerName", "ign", "playerId"]],
      ["Result", ["result", "status"]], ["Salary", ["salary", "amount"]], ["Recorded By", ["createdBy", "updatedBy"]],
    ],
  },
  {
    name: "CW Schedule",
    title: "CLAN WAR SCHEDULE",
    subtitle: "Clan War occurrence schedule and timing.",
    collection: "cwSchedules",
    columns: [
      ["Schedule", ["schedule", "name", "label"]], ["Date", ["date", "occurrenceDate"]],
      ["Time", ["scheduleTime", "time"]], ["Timezone", ["timezone"]], ["Status", ["status"]], ["Updated At", ["updatedAt", "createdAt"]],
    ],
  },
  {
    name: "CW Items",
    title: "CLAN WAR ITEMS",
    subtitle: "Guild item catalog and inventory setup.",
    collection: "cwItems",
    columns: [
      ["Item ID", ["itemId", "id"]], ["Item Name", ["itemName", "name", "item"]], ["Quantity", ["quantity", "stock"]],
      ["Status", ["status", "active"]], ["Created At", ["createdAt"]], ["Updated At", ["updatedAt"]],
    ],
  },
  {
    name: "CW Inventory",
    title: "CLAN WAR INVENTORY",
    subtitle: "Item assignments and inventory transactions.",
    customRows: (backup) => combinedRows(backup, [
      {
        collection: "cwItemAssignments",
        map: (r) => ["ASSIGNMENT", humanValue(r, "itemName", "item"), humanValue(r, "playerName", "ign", "playerId"), humanValue(r, "quantity"), humanValue(r, "status"), humanValue(r, "createdAt", "updatedAt")],
      },
      {
        collection: "cwInventoryTransactions",
        map: (r) => ["TRANSACTION", humanValue(r, "itemName", "item"), humanValue(r, "playerName", "ign", "playerId"), humanValue(r, "quantity"), humanValue(r, "action", "status"), humanValue(r, "createdAt", "updatedAt")],
      },
    ]),
    customHeaders: ["Record Type", "Item", "Player", "Quantity", "Action / Status", "Date"],
  },
  {
    name: "Treasury",
    title: "GUILD TREASURY",
    subtitle: "Guild money movements and salary records.",
    collection: "treasuryEntries",
    columns: [
      ["Date", ["date", "createdAt"]], ["Player", ["playerName", "ign", "playerId"]],
      ["Amount", ["amount", "salary"]], ["Reason", ["reason", "details"]], ["Recorded By", ["createdBy", "updatedBy"]],
    ],
  },
  {
    name: "Tickets",
    title: "GUILD TICKETS",
    subtitle: "Support requests using the structured category and issue fields.",
    collection: "guildTickets",
    columns: [
      ["Ticket ID", ["ticketId", "id"]], ["Player", ["ign", "playerName", "playerId"]], ["Category", ["category"]],
      ["Issue Type", ["issueType"]], ["Subject", ["subject"]], ["Status", ["status"]], ["Priority", ["priority"]],
      ["Created At", ["createdAt"]], ["Updated At", ["updatedAt"]],
    ],
  },
  {
    name: "Activity Log",
    title: "UNIFIED ACTIVITY LOG",
    subtitle: "Human-readable audit activity. This is the single activity/history feed.",
    collection: "guildNotices",
    columns: [
      ["Date/Time", ["createdAt", "updatedAt"]], ["Area", ["area", "source"]], ["Action", ["action"]],
      ["Player", ["playerName", "ign", "playerId"]], ["Details", ["details", "description"]], ["Changes", ["changes"]], ["By", ["createdBy", "updatedBy"]],
    ],
  },
  {
    name: "Raid Schedule",
    title: "RAID SCHEDULE",
    subtitle: "Boss raid schedules and timing.",
    collection: "raidSchedules",
    columns: [
      ["Boss", ["bossName", "name", "boss"]], ["Schedule Type", ["type"]], ["Schedule", ["schedule"]],
      ["Time", ["scheduleTime", "time"]], ["Timezone", ["timezone"]], ["Status", ["status"]], ["Updated At", ["updatedAt", "createdAt"]],
    ],
  },
];

function normalizeHumanSheet(definition, backup) {
  const headers = definition.customHeaders || definition.columns.map(([label]) => label);
  const rows = definition.customRows
    ? definition.customRows(backup).map((row) => row.map(displayCellValue))
    : humanRowsForCollection(backup, definition.collection, definition.columns.map(([label, keys]) => ({ label, keys })));
  return { name: definition.name, title: definition.title, subtitle: definition.subtitle, headers, rows };
}

function makeSheets(backup) {
  const collectionEntries = Object.entries(backup.collections || {});
  const totalDocuments = collectionEntries.reduce((sum, [, rows]) => sum + (rows?.length || 0), 0);
  const sheets = [
    {
      name: "Summary",
      title: "RAN ONLINE EP7 CLASSIC — GUILD BACKUP",
      subtitle: "Human-readable backup. The separate JSON file is the exact machine restore copy.",
      headers: ["Backup Information", "Value"],
      rows: [
        ["Backup Date", backup.exportedAt],
        ["Application", backup.application || "RAN Online EP7 Classic Guild Management"],
        ["Total Collections", collectionEntries.length],
        ["Total Records", totalDocuments],
        ["Human Backup", "This workbook is designed for normal people to read and manage."],
        ["Exact Restore", "Use the matching .json backup for a complete Firebase restore."],
        ["Security", "Sensitive Firebase security fields are kept out of the human sheets."],
      ],
    },
    {
      name: "Data Coverage",
      title: "DATA COVERAGE",
      subtitle: "Every Firebase backup collection is accounted for. Technical collections remain in the exact JSON backup.",
      headers: ["Firebase Collection", "Human Sheet", "Records", "Purpose"],
      rows: collectionEntries.map(([name, rows]) => {
        const human = HUMAN_SHEETS.find((sheet) => sheet.collection === name || (name === "cwItemAssignments" && sheet.name === "CW Inventory") || (name === "cwInventoryTransactions" && sheet.name === "CW Inventory"));
        return [humanCollectionName(name), human?.name || "Exact JSON only", rows?.length || 0, human ? human.subtitle : "Technical/security data preserved for exact restore."];
      }),
    },
    ...HUMAN_SHEETS
      .filter((definition) => definition.customRows || definition.collection)
      .map((definition) => normalizeHumanSheet(definition, backup)),
  ];

  // Keep the exact restore payload inside the workbook as a hidden final sheet.
  // This preserves XLSX import while keeping normal users out of the technical dump.
  const raw = encodeBase64(JSON.stringify(backup));
  const backupRows = [];
  for (let i = 0; i < raw.length; i += 30000) backupRows.push([raw.slice(i, i + 30000)]);
  sheets.push({
    name: "Backup JSON",
    title: "EXACT BACKUP PAYLOAD — DO NOT EDIT",
    subtitle: "Hidden technical restore payload. Use the separate JSON file for normal backup management.",
    headers: ["EXACT_BACKUP_BASE64"],
    rows: backupRows,
    hidden: true,
  });
  return sheets;
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function concatBytes(parts) {
  const size = parts.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  parts.forEach((item) => { out.set(item, offset); offset += item.length; });
  return out;
}

function u16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8 = (value) => new TextEncoder().encode(value);

function zipStored(entries, mime = "application/zip") {
  const local = [];
  const central = [];
  let offset = 0;
  entries.forEach(({ name, text, bytes }) => {
    const nameBytes = utf8(name);
    const data = bytes instanceof Uint8Array ? bytes : utf8(text ?? "");
    const crc = crc32(data);
    const header = concatBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes]);
    local.push(header, data);
    const cdir = concatBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]);
    central.push(cdir);
    offset += header.length + data.length;
  });
  const centralBytes = concatBytes(central);
  const localBytes = concatBytes(local);
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0)]);
  return new Blob([localBytes, centralBytes, end], { type: mime });
}

function safeExcelSheetName(name, usedNames = new Set()) {
  const base = String(name || "Sheet")
    .replace(/[\\\/\?\*\[\]:]/g, "-")
    .replace(/^'+/, "")
    .trim()
    .slice(0, 31) || "Sheet";
  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate)) {
    const suffix = `-${counter++}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function sheetCell(value, ref) {
  const text = displayCellValue(value);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function sheetXml({ title, subtitle, headers, rows }) {
  const lastColumn = excelColumnName(Math.max(1, headers.length));
  const lastRow = Math.max(3, rows.length + 3);
  const allRows = [];
  allRows.push(`<row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(title)}</t></is></c></row>`);
  allRows.push(`<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(subtitle || "")}</t></is></c></row>`);
  allRows.push(`<row r="3">${headers.map((value, index) => sheetCell(value, `${excelColumnName(index + 1)}3`)).join("")}</row>`);

  rows.forEach((row, index) => {
    const rowNumber = index + 4;
    const normalized = headers.map((_, columnIndex) => row?.[columnIndex] ?? "");
    allRows.push(`<row r="${rowNumber}">${normalized.map((value, columnIndex) => sheetCell(value, `${excelColumnName(columnIndex + 1)}${rowNumber}`)).join("")}</row>`);
  });

  const dimension = `A1:${lastColumn}${lastRow}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetData>${allRows.join("")}</sheetData></worksheet>`;
}

function buildXlsxFromSheets(sheets) {
  const usedNames = new Set();
  const normalizedSheets = sheets.map((sheet) => ({ ...sheet, name: safeExcelSheetName(sheet.name, usedNames) }));
  const workbookSheets = normalizedSheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}"${sheet.hidden ? ` state="hidden"` : ""} r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRels = normalizedSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${normalizedSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`;
  const entries = [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRelationships },
    ...normalizedSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet) })),
  ];
  return zipStored(entries);
}

export function buildXlsx(backup) {
  return buildXlsxFromSheets(makeSheets(backup));
}

async function buildHumanWorkbookEntries() {
  // CLEAN 41 intentionally creates ONE human workbook. Separate table-by-table
  // XLSX files were confusing and made it harder to guarantee compatibility.
  return [];
}

export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function localDateFolder(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `RAN_TODAY_${year}-${month}-${day}`;
}

export async function prepareBackupFiles(db) {
  const backup = await readBackup(db);
  const now = new Date();
  const folder = localDateFolder(now);
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonText = JSON.stringify(backup, null, 2);
  const xlsxBlob = buildXlsx(backup);
  const jsonBlob = new Blob([jsonText], { type: "application/json" });
  const readme = buildBackupReadme(backup, folder);
  const individualExcel = await buildHumanWorkbookEntries();
  return {
    backup,
    folder,
    stamp,
    jsonText,
    jsonBlob,
    xlsxBlob,
    individualExcel,
    jsonName: `${folder}/${folder}.json`,
    xlsxName: `${folder}/${folder}.xlsx`,
    readmeName: `${folder}/README.txt`,
    readme,
  };
}

async function saveBackupMetadata(db, metadata) {
  const backupRef = doc(collection(db, "adminBackups"));
  await setDoc(backupRef, { ...metadata, createdAt: serverTimestamp() });
  return backupRef.id;
}

async function buildCompleteBackupZip(files) {
  const entries = [
    { name: files.jsonName, text: files.jsonText },
    { name: files.xlsxName, bytes: new Uint8Array(await files.xlsxBlob.arrayBuffer()) },
    { name: files.readmeName, text: files.readme },
  ];
  return zipStored(entries, "application/zip");
}

function buildBackupReadme(backup, folder) {
  const totalDocuments = Object.values(backup.collections || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0);
  return [
    "RAN ONLINE EP7 CLASSIC — COMPLETE GUILD BACKUP",
    `Backup date: ${new Date(backup.exportedAt).toLocaleString()}`,
    `Collections: ${Object.keys(backup.collections || {}).length}`,
    `Records: ${totalDocuments}`,
    "",
    "FILES",
    "-----",
    `1. ${folder}.xlsx — one human-readable workbook for normal people to read and manage.`,
    `2. ${folder}.json — exact machine-readable restore backup containing all Firebase data.`,
    "3. README.txt — this explanation.",
    "",
    "EXCEL WORKBOOK",
    "The workbook uses simple Excel worksheets with clear human headers. Technical/security collections are preserved in the exact JSON backup instead of being exposed as confusing management sheets.",
    "The workbook also contains a hidden Backup JSON sheet so the application can restore an XLSX backup when needed.",
    "",
    "RESTORE",
    "Use Administrator Portal → Backup / Restore. JSON is the preferred exact restore format; XLSX is supported for application-generated backups.",
    "",
    "NO FIREBASE STORAGE",
    "Backup files are downloaded locally. Firebase stores only lightweight backup metadata.",
  ].join("\n");
}

export async function saveBackupAndDownload(db, { actorUid = "", actor = "Administrator" } = {}) {
  const files = await prepareBackupFiles(db);
  const metadata = {
    folder: files.folder,
    backupDate: files.backup.exportedAt,
    actorUid,
    actor,
    storage: "local-download",
    collectionCount: Object.keys(files.backup.collections || {}).length,
    documentCount: Object.values(files.backup.collections || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0),
    includesConsolidatedXlsx: true,
    includesIndividualExcelFolder: false,
    workbookDesign: "single-human-readable-workbook-plus-exact-json",
  };
  const backupId = await saveBackupMetadata(db, metadata);
  const bundle = await buildCompleteBackupZip(files);
  await downloadBlob(bundle, `${files.folder}_COMPLETE_${files.stamp}.zip`);
  return { files, metadata, backupId };
}

export async function saveBackupToChosenFolder(db) {
  const files = await prepareBackupFiles(db);
  if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") throw new Error("Your browser does not support direct folder saving. Use BACKUP + DOWNLOAD BOTH • ZIP instead.");
  const root = await window.showDirectoryPicker({ mode: "readwrite" });
  const folder = await root.getDirectoryHandle(files.folder, { create: true });

  const writeFile = async (parent, filename, content) => {
    const handle = await parent.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  await writeFile(folder, `${files.folder}.json`, files.jsonText);
  await writeFile(folder, `${files.folder}.xlsx`, files.xlsxBlob);
  await writeFile(folder, "README.txt", files.readme);
  return files.backup;
}

export async function downloadBackup(db) {
  const files = await prepareBackupFiles(db);
  const bundle = await buildCompleteBackupZip(files);
  await downloadBlob(bundle, `${files.folder}_COMPLETE_${files.stamp}.zip`);
  return files.backup;
}

export async function downloadJsonBackup(db) {
  const files = await prepareBackupFiles(db);
  await downloadBlob(files.jsonBlob, `${files.folder}.json`);
  return files.backup;
}

export async function downloadXlsxBackup(db) {
  const files = await prepareBackupFiles(db);
  await downloadBlob(files.xlsxBlob, `${files.folder}.xlsx`);
  return files.backup;
}

/* -------------------------------------------------------------------------- */
/* XLSX IMPORT                                                                */
/* -------------------------------------------------------------------------- */

function findZipEntry(bytes, wantedName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Our generated workbook uses the simple "stored" ZIP method. We only need
  // this parser for the application's own exported XLSX, so no third-party
  // dependency is required.
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (name === wantedName) {
      if (method !== 0) throw new Error("This XLSX uses compression that the built-in importer cannot read.");
      return bytes.subarray(dataStart, dataEnd);
    }
    offset = dataEnd;
  }
  return null;
}

function xmlTextValues(xml) {
  const values = [];
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = regex.exec(xml))) {
    values.push(match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"));
  }
  return values;
}

export async function readXlsxBackup(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbookXmlBytes = findZipEntry(bytes, "xl/workbook.xml");
  const relsXmlBytes = findZipEntry(bytes, "xl/_rels/workbook.xml.rels");
  if (!workbookXmlBytes || !relsXmlBytes) throw new Error("Invalid XLSX backup: workbook metadata is missing.");

  const decoder = new TextDecoder();
  const workbookXml = decoder.decode(workbookXmlBytes);
  const relsXml = decoder.decode(relsXmlBytes);
  const backupSheetMatch = workbookXml.match(/<sheet\s+[^>]*name="Backup JSON"[^>]*r:id="([^"]+)"[^>]*\/>/);
  if (!backupSheetMatch) throw new Error("This XLSX does not contain the application's Backup JSON sheet.");

  const relId = backupSheetMatch[1];
  const relRegex = new RegExp(`<Relationship\\s+[^>]*Id="${relId}"[^>]*Target="([^"]+)"[^>]*/>`);
  const relMatch = relsXml.match(relRegex);
  if (!relMatch) throw new Error("The Backup JSON sheet relationship is missing.");

  const target = relMatch[1].replace(/^\//, "").replace(/^xl\//, "xl/");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheetBytes = findZipEntry(bytes, sheetPath);
  if (!sheetBytes) throw new Error("The Backup JSON sheet could not be read.");

  const values = xmlTextValues(decoder.decode(sheetBytes));
  const base64 = values.filter((value) => value && value !== "EXACT_BACKUP_BASE64").join("");
  if (!base64) throw new Error("The XLSX Backup JSON sheet is empty.");

  try {
    return JSON.parse(decodeBase64(base64));
  } catch {
    throw new Error("The XLSX Backup JSON payload is invalid or corrupted.");
  }
}

/* -------------------------------------------------------------------------- */
/* 90-DAY DELETION ARCHIVE                                                    */
/* -------------------------------------------------------------------------- */

export async function archiveCollections(db, {
  collections = BACKUP_COLLECTIONS,
  actorUid = "",
  actor = "Administrator",
  reason = "manual-delete",
  label = "Deleted data",
} = {}) {
  const archiveId = `archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const archiveDate = new Date();
  const folderName = localDateFolder(archiveDate);
  const archiveRef = doc(db, ARCHIVE_META_COLLECTION, archiveId);
  const meta = {
    label,
    reason,
    folderName,
    backupDate: `${archiveDate.getFullYear()}-${String(archiveDate.getMonth() + 1).padStart(2, "0")}-${String(archiveDate.getDate()).padStart(2, "0")}`,
    status: "active",
    retentionDays: ARCHIVE_RETENTION_DAYS,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + ARCHIVE_RETENTION_DAYS * 86400000)),
    createdByUid: actorUid,
    createdBy: actor,
    collectionCount: 0,
    documentCount: 0,
  };
  await writeBatch(db).set(archiveRef, meta).commit();

  let collectionCount = 0;
  let documentCount = 0;
  const CHUNK_SIZE = 50;

  for (const collectionName of collections) {
    const snap = await getDocs(collection(db, collectionName));
    if (!snap.size) continue;
    collectionCount += 1;
    documentCount += snap.size;

    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE).map((item) => ({ id: item.id, data: safe(item.data()) }));
      const chunkRef = doc(collection(db, ARCHIVE_CHUNK_COLLECTION));
      await writeBatch(db).set(chunkRef, {
        archiveId,
        collectionName,
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        records: chunk,
        createdAt: serverTimestamp(),
      }).commit();
    }
  }

  await writeBatch(db).set(archiveRef, { collectionCount, documentCount, updatedAt: serverTimestamp() }, { merge: true }).commit();
  return { archiveId, collectionCount, documentCount };
}

export async function listArchives(db) {
  const snap = await getDocs(collection(db, ARCHIVE_META_COLLECTION));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export async function restoreArchive(db, archiveId, { onProgress } = {}) {
  const snap = await getDocs(query(collection(db, ARCHIVE_CHUNK_COLLECTION), where("archiveId", "==", archiveId)));
  const chunks = snap.docs.map((item) => item.data()).sort((a, b) => `${a.collectionName}:${a.chunkIndex}`.localeCompare(`${b.collectionName}:${b.chunkIndex}`));
  const total = chunks.reduce((sum, chunk) => sum + (chunk.records?.length || 0), 0);
  let done = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    (chunk.records || []).forEach((row) => {
      if (!row?.id || !row?.data) return;
      batch.set(doc(db, chunk.collectionName, String(row.id)), restoreValue(row.data), { merge: false });
    });
    await batch.commit();
    done += chunk.records?.length || 0;
    onProgress?.({ done, total, collectionName: chunk.collectionName });
  }
  await writeBatch(db).set(doc(db, ARCHIVE_META_COLLECTION, archiveId), { status: "restored", restoredAt: serverTimestamp() }, { merge: true }).commit();
  return { total, chunks: chunks.length };
}

export async function purgeExpiredArchives(db, { now = Date.now() } = {}) {
  const archives = await listArchives(db);
  const expired = archives.filter((archive) => {
    if (archive.status === "purged") return false;
    const expires = toMillis(archive.expiresAt);
    return expires > 0 && expires <= now;
  });

  for (const archive of expired) {
    const chunks = await getDocs(query(collection(db, ARCHIVE_CHUNK_COLLECTION), where("archiveId", "==", archive.id)));
    for (let i = 0; i < chunks.docs.length; i += 450) {
      const batch = writeBatch(db);
      chunks.docs.slice(i, i + 450).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
    await writeBatch(db).set(doc(db, ARCHIVE_META_COLLECTION, archive.id), { status: "purged", purgedAt: serverTimestamp() }, { merge: true }).commit();
  }
  return expired.length;
}
