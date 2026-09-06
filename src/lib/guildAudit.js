import { addDoc, collection, serverTimestamp } from "firebase/firestore";

const ENTITY_COLLECTIONS = {
  player: "players",
  "bh-player": "players",
  "bh-attendance": "bhAttendance",
  "bh-reward": "bhRewards",
  "reward": "bhRewards",
  "reward-claim": "bhRewardClaims",
  "bh-reward-claim": "bhRewardClaims",
  "duck-race": "bhDuckRaceStatus",
  "bh-scoring": "bhScoring",
  "raid-schedule": "raids",
  "cw-player": "cwPlayers",
  "cw-attendance": "cwAttendance",
  "cw-item": "cwItems",
  "cw-item-assignment": "cwItemAssignments",
  "cw-inventory-purchase": "cwInventoryTransactions",
  "cw-inventory-receipt": "cwInventoryTransactions",
  "cw-inventory-stock": "cwInventoryTransactions",
  "cw-spending": "treasuryEntries",
  "cw-reward": "treasuryEntries",
  "cw-schedule": "cwSchedules",
  "cw-salary-settings": "cwSettings",
  "cw-role": "cwSettings",
  "treasury-entry": "treasuryEntries",
  "treasury-balance-override": "treasuryEntries",
};

function clean(value) {
  return value == null ? "" : String(value).trim();
}

export function auditCollectionFor(entityType = "", module = "") {
  const entity = clean(entityType).toLowerCase();
  const mod = clean(module).toLowerCase();
  if (ENTITY_COLLECTIONS[entity]) return ENTITY_COLLECTIONS[entity];
  if (entity.includes("schedule") || mod.includes("schedule")) return "raids";
  if (entity.includes("attendance")) return mod.startsWith("cw-") ? "cwAttendance" : "bhAttendance";
  if (entity.includes("reward-claim") || entity.includes("claim")) return "bhRewardClaims";
  if (entity.includes("reward")) return mod.startsWith("cw-") ? "treasuryEntries" : "bhRewards";
  if (entity.includes("treasury") || mod.includes("treasury")) return "treasuryEntries";
  if (entity.includes("item")) return mod.startsWith("cw-") ? "cwItemAssignments" : "bhRewards";
  if (entity.includes("player")) return mod.startsWith("cw-") ? "cwPlayers" : "players";
  return "guildNotices";
}

export function buildAuditConnections(payload = {}) {
  const entityType = clean(payload.entityType);
  const module = clean(payload.module);
  const sourceCollection = clean(payload.sourceCollection) || auditCollectionFor(entityType, module);
  const sourceId = clean(payload.entityId);
  const links = [];

  const add = (label, collectionName, id, extra = {}) => {
    if (!collectionName || !clean(id)) return;
    links.push({ label, collection: collectionName, id: String(id), ...extra });
  };

  add("PRIMARY", sourceCollection, sourceId, { entityType });
  if (payload.playerId) add("PLAYER", module.startsWith("cw-") ? "cwPlayers" : "players", payload.playerId, { playerName: clean(payload.playerName) });
  if (payload.rewardId) add("REWARD", "bhRewards", payload.rewardId, { rewardName: clean(payload.rewardName) });
  if (payload.claimId) add("CLAIM", "bhRewardClaims", payload.claimId, { rewardName: clean(payload.rewardName) });
  if (payload.bossId) add("BOSS / SCHEDULE", "raids", payload.bossId, { bossName: clean(payload.bossName) });
  if (payload.treasuryId) add("TREASURY", "treasuryEntries", payload.treasuryId);
  if (payload.itemId) add("ITEM", module.startsWith("cw-") ? "cwItems" : "bhRewards", payload.itemId, { itemName: clean(payload.itemName || payload.rewardName) });
  if (payload.scheduleId) add("SCHEDULE", module.startsWith("cw-") ? "cwSchedules" : "raids", payload.scheduleId);

  const relatedModules = Array.from(new Set([
    module,
    ...(Array.isArray(payload.relatedModules) ? payload.relatedModules.map(clean) : []),
  ].filter(Boolean)));

  return {
    source: sourceCollection && sourceId ? { collection: sourceCollection, id: sourceId, entityType } : null,
    links,
    relatedModules,
  };
}

export function normalizeAuditChanges(changes = []) {
  if (!Array.isArray(changes)) return [];
  return changes.filter(Boolean).map((change) => {
    if (typeof change === "string") return { field: "ACTION", from: "", to: change };
    return {
      field: clean(change.field || change.label || "CHANGE"),
      from: change.from == null ? "" : String(change.from),
      to: change.to == null ? "" : String(change.to),
    };
  });
}

export function buildAuditPayload(payload = {}, defaults = {}) {
  const actor = clean(payload.createdBy || payload.updatedBy || defaults.actor) || "System";
  const module = clean(payload.module || defaults.module);
  const scope = clean(payload.scope || defaults.scope);
  const details = Array.isArray(payload.details) ? payload.details.filter(Boolean).map(String) : [];
  const changes = normalizeAuditChanges(payload.changes);
  const connections = buildAuditConnections({ ...payload, module });

  const preciseDetails = [
    `Action: ${clean(payload.action || payload.title) || "Activity"}`,
    `Module: ${module || "SYSTEM"}`,
    `Actor: ${actor}`,
    payload.playerName ? `Player / recipient: ${clean(payload.playerName)}` : "",
    payload.bossName ? `Boss: ${clean(payload.bossName)}` : "",
    payload.rewardName ? `Reward: ${clean(payload.rewardName)}` : "",
    payload.itemName || payload.item ? `Item: ${clean(payload.itemName || payload.item)}` : "",
    payload.points != null ? `Points: ${payload.points}` : "",
    payload.status ? `Status: ${clean(payload.status)}` : "",
    payload.reason ? `Reason: ${clean(payload.reason)}` : "",
  ].filter(Boolean);

  const mergedDetails = Array.from(new Set([...preciseDetails, ...details]));

  return {
    ...payload,
    scope: scope || "guild",
    module: module || "system",
    title: clean(payload.title) || "Guild Activity",
    message: clean(payload.message),
    type: clean(payload.type) || "info",
    active: payload.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    timestamp: serverTimestamp(),
    createdBy: actor,
    createdByUid: payload.createdByUid || defaults.uid || null,
    updatedBy: clean(payload.updatedBy || actor),
    updatedByUid: payload.updatedByUid || defaults.uid || null,
    action: clean(payload.action || payload.title),
    entityType: clean(payload.entityType),
    entityId: clean(payload.entityId),
    playerId: payload.playerId ? String(payload.playerId) : null,
    playerName: clean(payload.playerName),
    recipientPlayerId: payload.recipientPlayerId ? String(payload.recipientPlayerId) : (payload.playerId ? String(payload.playerId) : null),
    recipientPlayerName: clean(payload.recipientPlayerName || payload.playerName),
    bossId: clean(payload.bossId),
    bossName: clean(payload.bossName),
    rewardId: payload.rewardId ? String(payload.rewardId) : null,
    rewardName: clean(payload.rewardName),
    claimId: payload.claimId ? String(payload.claimId) : null,
    itemId: payload.itemId ? String(payload.itemId) : null,
    itemName: clean(payload.itemName || payload.item),
    treasuryId: payload.treasuryId ? String(payload.treasuryId) : null,
    scheduleId: payload.scheduleId ? String(payload.scheduleId) : null,
    points: payload.points == null || payload.points === "" || !Number.isFinite(Number(payload.points)) ? null : Number(payload.points),
    status: clean(payload.status),
    reason: clean(payload.reason),
    notes: clean(payload.notes),
    details: mergedDetails,
    changes,
    connections,
    connectionMap: connections.links,
  };
}

export async function writeGuildAudit(db, payload = {}, defaults = {}) {
  const data = buildAuditPayload(payload, defaults);
  return addDoc(collection(db, "guildNotices"), data);
}
