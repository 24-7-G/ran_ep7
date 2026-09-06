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
/* -------------------------------------------------------------------------- */

function xmlEscape(value) {
  // Excel XML is XML 1.0. Strip characters that are illegal in XML 1.0
  // before escaping user-entered Firebase text. This prevents Excel's
  // "We found a problem with some content" repair dialog.
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
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
  archiveId: "Archive ID",
  reason: "Reason",
  label: "Label",
  expiresAt: "Expires At",
  backupDate: "Backup Date",
  requestedByUid: "Requested By User ID",
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

const PREFERRED_FIELDS = {
  players: ["id", "playerId", "playerName", "displayName", "class", "level", "status", "joinDate", "createdBy", "createdAt", "updatedAt"],
  bhAttendance: ["id", "date", "attendanceDate", "playerId", "playerName", "boss", "points", "createdBy", "createdAt", "updatedAt"],
  cwAttendance: ["id", "date", "attendanceDate", "playerId", "playerName", "result", "salary", "points", "createdBy", "createdAt", "updatedAt"],
  bhRewards: ["id", "rewardId", "rewardName", "type", "cost", "stock", "status", "createdBy", "createdAt", "updatedAt"],
  bhRewardClaims: ["id", "claimId", "playerId", "playerName", "rewardId", "rewardName", "pointsUsed", "claimedAt", "createdBy"],
  guildTickets: ["id", "ticketId", "playerId", "playerName", "category", "issueType", "subject", "status", "description", "createdAt", "updatedAt"],
  guildNotices: ["id", "createdAt", "createdBy", "action", "details", "changes", "updatedAt"],
  raidSchedules: ["id", "bossId", "bossName", "type", "schedule", "scheduleTime", "timezone", "status", "createdBy", "createdAt", "updatedAt"],
  treasuryEntries: ["id", "date", "playerId", "playerName", "amount", "salary", "reason", "createdBy", "createdAt", "updatedAt"],
  cwItemAssignments: ["id", "itemId", "itemName", "playerId", "playerName", "quantity", "status", "createdBy", "createdAt", "updatedAt"],
  cwInventoryTransactions: ["id", "itemId", "itemName", "playerId", "playerName", "quantity", "action", "createdBy", "createdAt", "updatedAt"],
};

function humanCollectionName(name) {
  return HUMAN_COLLECTION_NAMES[name] || name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanFieldName(field, collectionName) {
  if (field === "id") {
    const lower = String(collectionName).toLowerCase();
    if (lower.includes("player")) return "Player ID";
    if (lower.includes("reward")) return "Reward ID";
    if (lower.includes("ticket")) return "Ticket ID";
    if (lower.includes("schedule") || lower.includes("raid")) return "Record ID";
    return "Record ID";
  }
  if (HUMAN_FIELD_NAMES[field]) return HUMAN_FIELD_NAMES[field];
  return String(field)
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

function cell(value, style = 2, ref = "") {
  const reference = ref ? ` r="${ref}"` : "";
  return `<c${reference} s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(displayCellValue(value))}</t></is></c>`;
}

function sheetXml({ title, subtitle, headers, rows }) {
  const allRows = [];
  const lastColumn = excelColumnName(Math.max(1, headers.length));
  const lastRow = Math.max(3, rows.length + 3);
  allRows.push(`<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>${xmlEscape(title)}</t></is></c></row>`);
  allRows.push(`<row r="2"><c r="A2" s="3" t="inlineStr"><is><t>${xmlEscape(subtitle || "")}</t></is></c></row>`);
  allRows.push(`<row r="3">${headers.map((value, index) => cell(value, 4, `${excelColumnName(index + 1)}3`)).join("")}</row>`);
  rows.forEach((row, index) => {
    const rowNumber = index + 4;
    allRows.push(`<row r="${rowNumber}">${row.map((value, columnIndex) => cell(value, 2, `${excelColumnName(columnIndex + 1)}${rowNumber}`)).join("")}</row>`);
  });
  const widths = headers.map((header, index) => {
    const values = [header, ...rows.slice(0, 200).map((row) => displayCellValue(row[index]))];
    const maxLength = Math.min(45, Math.max(10, ...values.map((value) => String(value || "").length + 2)));
    return `<col min="${index + 1}" max="${index + 1}" width="${maxLength}" customWidth="1"/>`;
  }).join("");
  const filter = headers.length ? `<autoFilter ref="A3:${lastColumn}${lastRow}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${allRows.join("")}</sheetData>${filter}<mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
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

function makeDataSheet(name, records, backup, usedNames) {
  const keysFromData = Array.from(new Set((records || []).flatMap((row) => Object.keys(row.data || {}))));
  const preferred = (PREFERRED_FIELDS[name] || []).filter((key) => key === "id" || keysFromData.includes(key));
  const keys = [...preferred, ...keysFromData.filter((key) => !preferred.includes(key))];
  const headers = keys.map((key) => humanFieldName(key, name));
  // Keep the data row exactly aligned with the header row.
  // The document ID is a synthetic `id` column and must occupy the same
  // position as the `Record ID`/`Player ID` header instead of being added
  // separately. This prevents malformed XLSX sheets when a Firebase record
  // does not itself contain an `id` field.
  const rows = (records || []).map((row) => keys.map((key) => (key === "id" ? row.id : row.data?.[key])));
  return {
    name: safeExcelSheetName(humanCollectionName(name), usedNames),
    title: humanCollectionName(name),
    subtitle: `${records?.length || 0} record(s) • Backup generated ${backup.exportedAt}`,
    headers,
    rows,
  };
}

function makeSheets(backup) {
  const sheets = [];
  const usedSheetNames = new Set();
  const collectionEntries = Object.entries(backup.collections || {});
  const totalDocuments = collectionEntries.reduce((sum, [, rows]) => sum + (rows?.length || 0), 0);
  usedSheetNames.add("Summary");
  sheets.push({
    name: "Summary",
    title: "RAN ONLINE EP7 CLASSIC — GUILD DATA BACKUP",
    subtitle: `Complete readable export • ${backup.exportedAt}`,
    headers: ["Backup Information", "Value"],
    rows: [
      ["Backup Format", backup.format],
      ["Backup Version", backup.version],
      ["Generated At", backup.exportedAt],
      ["Application", backup.application || "RAN Online EP7 Classic Guild Management"],
      ["Total Tables", collectionEntries.length],
      ["Total Records", totalDocuments],
      ["File Purpose", "Human-readable Excel backup. The consolidated workbook also contains the exact JSON restore payload."],
      ["Restore Location", "Administrator Portal → Backup / Restore"],
    ],
  });

  usedSheetNames.add("Table Guide");
  sheets.push({
    name: "Table Guide",
    title: "TABLE GUIDE — WHAT EACH SHEET CONTAINS",
    subtitle: "Use the worksheet tabs at the bottom of Excel to open each organized table.",
    headers: ["Sheet", "Description", "Records"],
    rows: collectionEntries.map(([name, records]) => [humanCollectionName(name), `Firebase collection: ${name}`, records?.length || 0]),
  });

  for (const [name, records] of collectionEntries) sheets.push(makeDataSheet(name, records, backup, usedSheetNames));

  // Exact machine-readable restore payload. Kept separate from the human tables.
  const raw = encodeBase64(JSON.stringify(backup));
  const backupRows = [];
  for (let i = 0; i < raw.length; i += 30000) backupRows.push([raw.slice(i, i + 30000)]);
  usedSheetNames.add("Backup JSON");
  sheets.push({
    name: "Backup JSON",
    title: "EXACT BACKUP PAYLOAD — DO NOT EDIT",
    subtitle: "This sheet is used by the application when importing the XLSX backup.",
    headers: ["EXACT_BACKUP_BASE64"],
    rows: backupRows,
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

function xlsxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><sz val="10"/><color rgb="FF1F2937"/><name val="Aptos"/></font><font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF082033"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B6E99"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs></styleSheet>`;
}

function buildXlsxFromSheets(sheets) {
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("") + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`;
  const entries = [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRelationships },
    { name: "xl/styles.xml", text: xlsxStylesXml() },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet) })),
  ];
  return zipStored(entries);
}

export function buildXlsx(backup) {
  return buildXlsxFromSheets(makeSheets(backup));
}

function buildSummaryXlsx(backup) {
  const entries = Object.entries(backup.collections || {});
  const totalDocuments = entries.reduce((sum, [, rows]) => sum + (rows?.length || 0), 0);
  const sheets = [
    {
      name: "Summary",
      title: "RAN ONLINE EP7 CLASSIC — GUILD DATA BACKUP",
      subtitle: `Human-readable backup summary • ${backup.exportedAt}`,
      headers: ["Backup Information", "Value"],
      rows: [
        ["Backup Format", backup.format],
        ["Backup Version", backup.version],
        ["Generated At", backup.exportedAt],
        ["Application", backup.application || "RAN Online EP7 Classic Guild Management"],
        ["Total Tables", entries.length],
        ["Total Records", totalDocuments],
        ["Restore Location", "Administrator Portal → Backup / Restore"],
      ],
    },
    {
      name: "Table Guide",
      title: "TABLE GUIDE — BACKUP CONTENTS",
      subtitle: "One separate XLSX file is provided for every table in the Excel folder.",
      headers: ["Table", "Excel File", "Description", "Records"],
      rows: entries.map(([name, rows]) => [humanCollectionName(name), `${String(name).replace(/[^a-zA-Z0-9._-]/g, "_")}.xlsx`, `Firebase table: ${name}`, rows?.length || 0]),
    },
  ];
  return buildXlsxFromSheets(sheets);
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

function safeFileName(value) {
  return String(value || "Data").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, "_").slice(0, 80);
}

function buildHumanWorkbookEntries(backup, folder) {
  const entries = [];
  const now = backup.exportedAt;
  entries.push({
    name: `${folder}/Excel/00_Summary.xlsx`,
    blob: buildSummaryXlsx(backup),
  });

  for (const [name, records] of Object.entries(backup.collections || {})) {
    const oneCollectionBackup = {
      ...backup,
      collections: { [name]: records },
    };
    entries.push({
      name: `${folder}/Excel/${String(name).replace(/[^a-zA-Z0-9._-]/g, "_")}.xlsx`,
      blob: buildXlsx(oneCollectionBackup),
    });
  }
  return entries;
}

function buildBackupReadme(backup, folder) {
  const totalDocuments = Object.values(backup.collections || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0);
  return [
    "RAN ONLINE EP7 CLASSIC — COMPLETE GUILD BACKUP",
    `Backup date: ${new Date(backup.exportedAt).toLocaleString()}`,
    `Tables: ${Object.keys(backup.collections || {}).length}`,
    `Records: ${totalDocuments}`,
    "",
    "FOLDER CONTENTS",
    "----------------",
    "1. CONSOLIDATED JSON: Exact machine-readable restore backup.",
    "2. CONSOLIDATED XLSX: Human-readable workbook with organized tables and an exact Backup JSON sheet.",
    "3. Excel/: Separate human-readable XLSX file for each Firebase table, plus 00_Summary.xlsx.",
    "4. README.txt: This explanation.",
    "",
    "The Excel files are organized for people, not programmers: clear column headers, readable names, frozen headers, filters, sensible column widths, and one table per worksheet.",
    "For restoration, use the consolidated JSON or consolidated XLSX from Administrator Portal → Backup / Restore.",
  ].join("\n");
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
  const individualExcel = buildHumanWorkbookEntries(backup, folder);
  return {
    backup,
    folder,
    stamp,
    jsonText,
    jsonBlob,
    xlsxBlob,
    individualExcel,
    jsonName: `${folder}/${folder}_CONSOLIDATED.json`,
    xlsxName: `${folder}/${folder}_CONSOLIDATED.xlsx`,
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
  for (const item of files.individualExcel) {
    entries.push({ name: item.name, bytes: new Uint8Array(await item.blob.arrayBuffer()) });
  }
  return zipStored(entries, "application/zip");
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
    includesIndividualExcelFolder: true,
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

  await writeFile(folder, `${files.folder}_CONSOLIDATED.json`, files.jsonText);
  await writeFile(folder, `${files.folder}_CONSOLIDATED.xlsx`, files.xlsxBlob);
  await writeFile(folder, "README.txt", files.readme);

  const excelFolder = await folder.getDirectoryHandle("Excel", { create: true });
  for (const item of files.individualExcel) {
    const filename = item.name.split("/").pop();
    await writeFile(excelFolder, filename, item.blob);
  }
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
  await downloadBlob(files.jsonBlob, `${files.folder}_CONSOLIDATED.json`);
  return files.backup;
}

export async function downloadXlsxBackup(db) {
  const files = await prepareBackupFiles(db);
  await downloadBlob(files.xlsxBlob, `${files.folder}_CONSOLIDATED.xlsx`);
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
