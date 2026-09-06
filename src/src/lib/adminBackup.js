import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
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
/* XLSX                                                                       */
/* -------------------------------------------------------------------------- */

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cell(value) {
  return `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  const body = allRows.map((row, r) => {
    const values = row.map((value) => cell(value));
    return `<row r="${r + 1}">${values.join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function makeSheets(backup) {
  const sheets = [];
  sheets.push({
    name: "README",
    headers: ["Field", "Value"],
    rows: [
      ["Backup Format", backup.format],
      ["Backup Version", backup.version],
      ["Exported At", backup.exportedAt],
      ["Application", backup.application || "RAN Online EP7 Classic Guild Management"],
      ["Purpose", "Complete application backup. Use the embedded Backup JSON sheet for exact restoration."],
    ],
  });

  for (const [name, records] of Object.entries(backup.collections || {})) {
    const keys = Array.from(new Set(records.flatMap((row) => Object.keys(row.data || {}))));
    const headers = ["DOCUMENT_ID", ...keys];
    const rows = records.map((row) => [row.id, ...keys.map((key) => {
      const value = row.data?.[key];
      return typeof value === "object" ? JSON.stringify(value) : value == null ? "" : String(value);
    })]);
    sheets.push({ name: name.slice(0, 31), headers, rows });
  }

  // The XLSX is intentionally self-contained: this sheet stores the exact JSON
  // payload, allowing an exported XLSX to be imported back into the application.
  const raw = encodeBase64(JSON.stringify(backup));
  const backupRows = [];
  // Excel cells have a practical text limit, so split the exact JSON payload
  // into safe-sized chunks. The importer concatenates them in row order.
  for (let i = 0; i < raw.length; i += 30000) backupRows.push([raw.slice(i, i + 30000)]);
  sheets.push({ name: "Backup JSON", headers: ["EXACT_BACKUP_BASE64"], rows: backupRows });
  return sheets;
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
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
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
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
    const header = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes,
    ]);
    local.push(header, data);

    const cdir = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    central.push(cdir);
    offset += header.length + data.length;
  });

  const centralBytes = concatBytes(central);
  const localBytes = concatBytes(local);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0),
  ]);
  return new Blob([localBytes, centralBytes, end], { type: mime });
}

export function buildXlsx(backup) {
  const sheets = makeSheets(backup);
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`;
  const entries = [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRelationships },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet.headers, sheet.rows) })),
  ];
  return zipStored(entries);
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
  const readme = [
    "RAN ONLINE EP7 CLASSIC — COMPLETE LOCAL BACKUP",
    `Backup date: ${now.toLocaleString()}`,
    "",
    "This backup contains two matching formats:",
    "1. JSON — exact machine restore format.",
    "2. XLSX — organized human-readable workbook containing the exact JSON payload in the Backup JSON sheet.",
    "",
    "Either JSON or XLSX can be imported back into the Administrator Portal.",
  ].join("\n");

  return {
    backup,
    folder,
    stamp,
    jsonText,
    jsonBlob,
    xlsxBlob,
    jsonName: `${folder}/${folder}_CONSOLIDATED.json`,
    xlsxName: `${folder}/${folder}_CONSOLIDATED.xlsx`,
    readmeName: `${folder}/README.txt`,
    readme,
  };
}

export async function downloadBackup(db) {
  const files = await prepareBackupFiles(db);
  const xlsxBytes = new Uint8Array(await files.xlsxBlob.arrayBuffer());

  // Browsers commonly block multiple automatic downloads. The ZIP is the
  // reliable cross-browser/mobile backup: it always contains BOTH JSON and XLSX
  // in the dated RAN_TODAY folder, plus a README.
  const bundle = zipStored([
    { name: files.jsonName, text: files.jsonText },
    { name: files.xlsxName, bytes: xlsxBytes },
    { name: files.readmeName, text: files.readme },
  ], "application/zip");

  await downloadBlob(bundle, `${files.folder}_CONSOLIDATED_${files.stamp}.zip`);
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
