import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { PRIMARY_TIMEZONE, GUILD_CLASSES } from "../lib/constants";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";
import { zonedDateToUtc } from "../lib/time";
import swordmanIcon from "../icons/swordman.svg";
import archerIcon from "../icons/archer.svg";
import gunnerIcon from "../icons/gunner.svg";
import shamanIcon from "../icons/shaman.svg";
import extremeIcon from "../icons/extreme.svg";
import brawlerIcon from "../icons/brawler.svg";
import cwWarIcon from "../icons/cw-war.svg";
import guildWarArtwork from "../bosses/guild-war.png";
import "./CWPage.css";

const CW_DAYS = [
  { key: 0, label: "SUNDAY" },
  { key: 1, label: "MONDAY" },
  { key: 2, label: "TUESDAY" },
  { key: 3, label: "WEDNESDAY" },
  { key: 4, label: "THURSDAY" },
  { key: 5, label: "FRIDAY" },
  { key: 6, label: "SATURDAY" },
];
const DEFAULT_CW_DAYS = [1, 3, 5, 6];
const DEFAULT_ROLES = ["Hitter", "Taichi Stream", "Full Support", "Setter"];
const PAGE_SIZE = 10;
const CLASS_ICONS = {
  Swordman: "⚔", Archer: "🏹", Gunner: "▰", Shaman: "✦", Extreme: "✹", Brawler: "✊",
};

function clean(v) { return v == null ? "" : String(v).trim(); }
function num(v, fallback = 0) {
  const cleaned = typeof v === "string" ? v.replace(/,/g, "").trim() : v;
  if (cleaned === "" || cleaned == null) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}
function formatMoneyInput(v) {
  if (v == null || v === "") return "";
  let raw = String(v).replace(/,/g, "").replace(/[^0-9.]/g, "");
  const dot = raw.indexOf(".");
  if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, "");
  if (!raw) return "";
  const [whole, decimal] = raw.split(".");
  const wholeFormatted = whole ? Number(whole).toLocaleString("en-US") : "0";
  return dot === -1 ? wholeFormatted : `${wholeFormatted}.${decimal ?? ""}`;
}
function safeDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v?.seconds != null) return new Date(Number(v.seconds) * 1000);
  const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d;
}
function partsInZone(date, timezone) {
  const d = safeDate(date); if (!d) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || PRIMARY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
    return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  } catch { return null; }
}
function dateKey(date, timezone) { const p = partsInZone(date, timezone); return p ? `${p.year}-${p.month}-${p.day}` : ""; }
function formatDate(date, timezone) { const d = safeDate(date); if (!d) return "—"; try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" }).format(d) } catch { return d.toLocaleDateString() } }
function formatDateTime(date, timezone) { const d = safeDate(date); if (!d) return "—"; try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZoneName: "short" }).format(d) } catch { return d.toLocaleString() } }
function dateTimeInputValue(date, timezone) { const p = partsInZone(date, timezone); return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : ""; }
function zonedDateTimeInputToUtc(value, timezone) { const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); if (!m) return null; return zonedDateToUtc(`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), Number(m[5]), timezone || PRIMARY_TIMEZONE); }
function formatTime(date, timezone) { const d = safeDate(date); if (!d) return "—"; try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZoneName: "short" }).format(d) } catch { return d.toLocaleTimeString() } }
function countdownLabel(at, now) { const ms = (safeDate(at)?.getTime() || 0) - now.getTime(); if (ms > 0) return `STARTS IN ${diffText(ms)}`; if (ms > -2 * 60 * 60 * 1000) return "CW IN PROGRESS"; return "VIEW CW ROSTER →"; }
function money(v) { return num(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function count(v) { return num(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function actor(user) { return clean(user?.email) || clean(user?.displayName) || "System"; }
function diffText(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(sec / 86400); const h = Math.floor(sec % 86400 / 3600); const m = Math.floor(sec % 3600 / 60); const s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
const CLASS_ICON_PATHS = { Swordman: swordmanIcon, Archer: archerIcon, Gunner: gunnerIcon, Shaman: shamanIcon, Extreme: extremeIcon, Brawler: brawlerIcon };
function classIcon(name) { return CLASS_ICON_PATHS[clean(name)] || ""; }
function ClassEmblem({ name, small = false }) { const src = classIcon(name); return src ? <img className={small ? "cw-mini-emblem" : "cw-class-emblem"} src={src} alt="" /> : <span className={small ? "cw-mini-emblem" : "cw-class-emblem"}>{CLASS_ICONS[clean(name)] || "◆"}</span>; }
function buildOccurrence(dateKeyValue, time, timezone) {
  const [h, m] = String(time || "21:00").split(":").map(Number);
  return zonedDateToUtc(dateKeyValue, h || 0, m || 0, timezone || PRIMARY_TIMEZONE);
}
function localDateKeys(timezone, startOffset, endOffset) {
  const now = new Date(); const out = [];
  for (let i = startOffset; i <= endOffset; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i); out.push(dateKey(d, timezone));
  }
  return out;
}

function Modal({ title, children, onClose, wide = false }) {
  return <div className="cw-modal-backdrop" onMouseDown={onClose}><div className={`cw-modal ${wide ? "cw-modal-wide" : ""}`} onMouseDown={e => e.stopPropagation()}>
    <div className="cw-modal-head"><div><div className="cw-kicker">CLAN WAR</div><h2>{title}</h2></div><button className="cw-icon-close" onClick={onClose}>×</button></div>
    <div className="cw-modal-body">{children}</div>
  </div></div>;
}

const CW_NOTICE_CATEGORIES = {
  ATTENDANCE: "ATTENDANCE",
  SALARY: "SALARY",
  ITEM: "ITEM",
  PLAYER: "PLAYER",
  SCHEDULE: "SCHEDULE",
  ADMIN: "ADMIN",
  TREASURY: "TREASURY",
  SYSTEM: "SYSTEM",
};

function inferNoticeCategory(notice = {}) {
  const explicit = clean(notice.category).toUpperCase();
  if (Object.values(CW_NOTICE_CATEGORIES).includes(explicit)) return explicit;

  const entity = clean(notice.entityType).toLowerCase();
  const title = clean(notice.title).toLowerCase();
  const message = clean(notice.message).toLowerCase();
  const text = `${entity} ${title} ${message}`;

  if (entity.includes("attendance") || /\b(attendance|clock[- ]?in|marked present|present|absence)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.ATTENDANCE;
  }
  if (entity.includes("salary") || /\b(salary|pay|payout|class salary)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.SALARY;
  }
  if (entity.includes("item") || /\b(item|received|handed out|distribution)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.ITEM;
  }
  if (entity.includes("player") || entity.includes("role") || /\b(player|ign|class|role|roster)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.PLAYER;
  }
  if (entity.includes("treasury") || /\b(treasury|guild gold|balance override|expense|funds)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.TREASURY;
  }
  if (entity.includes("schedule") || /\b(schedule|occurrence|clan war time|cw time)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.SCHEDULE;
  }
  if (entity.includes("admin") || /\b(admin|administrator|permission|role settings|configuration)\b/.test(text)) {
    return CW_NOTICE_CATEGORIES.ADMIN;
  }
  return CW_NOTICE_CATEGORIES.SYSTEM;
}

function treasuryCategory(entry = {}) {
  const type = clean(entry.type).toLowerCase();
  if (type === "cw-salary" || type === "cw-salary-reversal") return "SALARY";
  if (type === "item-purchase" || type === "item-purchase-reversal" || type === "inventory-purchase") return "ITEM";
  if (type === "cw-war-income" || type === "guild-income") return "INCOME";
  if (type === "balance-override" || type === "balance-adjustment" || type === "opening-balance") return "TREASURY";
  return "EXPENSE";
}
function treasuryTypeLabel(entry = {}) {
  const type = clean(entry.type).toLowerCase();
  return type === "cw-salary" ? "CW SALARY" : type === "item-purchase" ? "ITEM COST" : type === "inventory-purchase" ? "INVENTORY PURCHASE" : type === "cw-salary-reversal" ? "SALARY REVERSAL" : type === "item-purchase-reversal" ? "ITEM COST REVERSAL" : type === "balance-override" ? "BALANCE OVERRIDE" : type === "opening-balance" ? "LEGACY OPENING BALANCE" : type === "balance-adjustment" ? "LEGACY BALANCE ADJUSTMENT" : (type === "cw-war-income" || type === "guild-income") ? "RECEIVED FROM CW WAR" : "GUILD EXPENSE";
}

function noticeIcon(category) {
  switch (category) {
    case CW_NOTICE_CATEGORIES.ATTENDANCE: return "✓";
    case CW_NOTICE_CATEGORIES.SALARY: return "₲";
    case CW_NOTICE_CATEGORIES.ITEM: return "◇";
    case CW_NOTICE_CATEGORIES.PLAYER: return "♟";
    case CW_NOTICE_CATEGORIES.SCHEDULE: return "◷";
    case CW_NOTICE_CATEGORIES.ADMIN: return "⚙";
    case CW_NOTICE_CATEGORIES.TREASURY: return "₲";
    default: return "◆";
  }
}

function NoticeItem({ item, timezone, onClick }) {
  const category = inferNoticeCategory(item);
  return <button className={`cw-notice-item cw-notice-category-${category.toLowerCase()}`} onClick={() => onClick(item)}>
    <span className="cw-notice-icon">{noticeIcon(category)}</span>
    <span className="cw-notice-category">{category}</span>
    <span className="cw-notice-copy"><strong>{clean(item.title) || "Activity"}</strong><span>{clean(item.message) || "Record changed."}</span></span>
    <span className="cw-notice-meta"><b>{formatDateTime(item.createdAt || item.timestamp, timezone)}</b><em>{clean(item.createdBy) || "System"}</em></span><b className="cw-chevron">›</b>
  </button>;
}


export default function CWPage({ user, isAdmin }) {
  const { resolvedTimezone } = useGlobalDisplayTimezone();
  const [players, setPlayers] = useState([]), [attendance, setAttendance] = useState([]), [schedules, setSchedules] = useState([]), [notices, setNotices] = useState([]), [treasuryEntries, setTreasuryEntries] = useState([]);
  const [roleSettings, setRoleSettings] = useState({ roles: DEFAULT_ROLES });
  const [salarySettings, setSalarySettings] = useState({ byClass: {}, byClassRole: [] });
  const [loading, setLoading] = useState(true), [message, setMessage] = useState("");
  const [backDays, setBackDays] = useState(0), [forwardDays, setForwardDays] = useState(0);
  const [activePanel, setActivePanel] = useState("attendance"), [selectedOccurrence, setSelectedOccurrence] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null), [selectedAttendance, setSelectedAttendance] = useState(null), [auditDetail, setAuditDetail] = useState(null);
  const [playerHistoryTab, setPlayerHistoryTab] = useState("all"), [playerHistorySearch, setPlayerHistorySearch] = useState(""), [playerHistoryPage, setPlayerHistoryPage] = useState(1);
  const [noticeMode, setNoticeMode] = useState("new"), [noticePage, setNoticePage] = useState(1), [noticeNewPage, setNoticeNewPage] = useState(1), [noticeOldPage, setNoticeOldPage] = useState(1), [allNoticePage, setAllNoticePage] = useState(1), [noticeSearch, setNoticeSearch] = useState(""), [noticeCategoryFilter, setNoticeCategoryFilter] = useState("all"), [noticeAdminFilter, setNoticeAdminFilter] = useState("all"), [noticeTimeFilter, setNoticeTimeFilter] = useState("all"), [noticeDateFilter, setNoticeDateFilter] = useState(""), [noticeFrom, setNoticeFrom] = useState(""), [noticeTo, setNoticeTo] = useState("");
  const [playerSearch, setPlayerSearch] = useState(""), [roleFilter, setRoleFilter] = useState("all"), [classFilter, setClassFilter] = useState("all"), [playerPage, setPlayerPage] = useState(1);
  const [historySearch, setHistorySearch] = useState(""), [historyPage, setHistoryPage] = useState(1);
  const [treasurySearch, setTreasurySearch] = useState(""), [treasuryCategoryFilter, setTreasuryCategoryFilter] = useState("all"), [treasuryDateFilter, setTreasuryDateFilter] = useState(""), [treasuryFrom, setTreasuryFrom] = useState(""), [treasuryTo, setTreasuryTo] = useState("");
  const [playerModal, setPlayerModal] = useState(null), [playerForm, setPlayerForm] = useState({ ign: "", className: GUILD_CLASSES?.[0] || "Swordman", role: DEFAULT_ROLES[0] });
  const [attendanceModal, setAttendanceModal] = useState(null), [attendanceForm, setAttendanceForm] = useState({ salaryGold: "", itemCostGold: "", receivedItem: "", notes: "", adminComment: "" });
  const [cwItems, setCwItems] = useState([]), [itemAssignments, setItemAssignments] = useState([]), [inventoryTransactions, setInventoryTransactions] = useState([]);
  const [inventoryTransactionsLoaded, setInventoryTransactionsLoaded] = useState(false);
  const [inventoryPurchaseModal, setInventoryPurchaseModal] = useState(false), [inventoryPurchaseLines, setInventoryPurchaseLines] = useState([{ itemId: "", quantity: "1" }]), [inventoryPurchaseNote, setInventoryPurchaseNote] = useState("");
  const [cwSpendingModal, setCwSpendingModal] = useState(false), [cwSpendingGold, setCwSpendingGold] = useState(""), [cwSpendingLines, setCwSpendingLines] = useState([{ itemId: "", quantity: "1" }]), [cwSpendingNote, setCwSpendingNote] = useState("");
  const [spendingInventorySearch, setSpendingInventorySearch] = useState(""), [spendingInventoryCategory, setSpendingInventoryCategory] = useState("ALL"), [spendingInventoryPage, setSpendingInventoryPage] = useState(1);
  const [cwRewardsModal, setCwRewardsModal] = useState(false), [cwRewardsGold, setCwRewardsGold] = useState(""), [cwRewardsLines, setCwRewardsLines] = useState([{ itemId: "", itemName: "", quantity: "1" }]), [cwRewardsNote, setCwRewardsNote] = useState("");
  const [itemModal, setItemModal] = useState(null), [itemForm, setItemForm] = useState({ name: "", unitCost: "", description: "", active: true });
  const [itemAssignmentModal, setItemAssignmentModal] = useState(null), [itemAssignmentForm, setItemAssignmentForm] = useState({ playerId: "", itemId: "", quantity: "1", occurrenceKey: "", notes: "", adminComment: "" });
  const [adminConfirm, setAdminConfirm] = useState(null);
  const [treasuryModal, setTreasuryModal] = useState(null), [treasuryForm, setTreasuryForm] = useState({ type: "cw-war-income", amount: "", description: "", item: "", transactionAt: "", adminComment: "" });
  const [treasuryEditOriginal, setTreasuryEditOriginal] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(false), [roleModal, setRoleModal] = useState(false), [salaryModal, setSalaryModal] = useState(false), [newRole, setNewRole] = useState("");
  const [scheduleForm, setScheduleForm] = useState({ days: DEFAULT_CW_DAYS.slice(), time: "21:00", timezone: PRIMARY_TIMEZONE });
  const [salaryDraft, setSalaryDraft] = useState({}); const [saving, setSaving] = useState(false); const [now, setNow] = useState(new Date());


  useEffect(() => {
    const unsubscribePlayers = onSnapshot(
      collection(db, "cwPlayers"),
      (snapshot) => {
        setPlayers(
          snapshot.docs.map((playerDoc) => ({
            id: playerDoc.id,
            ...playerDoc.data(),
          }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubscribeAttendance = onSnapshot(
      collection(db, "cwAttendance"),
      (snapshot) => {
        setAttendance(
          snapshot.docs.map((attendanceDoc) => ({
            id: attendanceDoc.id,
            ...attendanceDoc.data(),
          }))
        );
      }
    );

    const unsubscribeItems = onSnapshot(
      collection(db, "cwItems"),
      (snapshot) => {
        setCwItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    const unsubscribeItemAssignments = onSnapshot(
      collection(db, "cwItemAssignments"),
      (snapshot) => {
        setItemAssignments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    const unsubscribeInventoryTransactions = onSnapshot(
      collection(db, "cwInventoryTransactions"),
      (snapshot) => { setInventoryTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))); setInventoryTransactionsLoaded(true); }
    );

    const unsubscribeSchedules = onSnapshot(
      collection(db, "cwSchedules"),
      (snapshot) => {
        setSchedules(
          snapshot.docs.map((scheduleDoc) => ({
            id: scheduleDoc.id,
            ...scheduleDoc.data(),
          }))
        );
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "cwSettings", "current"),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};

        setRoleSettings({
          roles:
            Array.isArray(data.roles) && data.roles.length
              ? data.roles
              : DEFAULT_ROLES,
        });

        setSalarySettings({
          byClass:
            data.salaryByClass &&
              typeof data.salaryByClass === "object"
              ? data.salaryByClass
              : {},
          byClassRole: Array.isArray(data.salaryByClassRole) ? data.salaryByClassRole : [],
        });
      }
    );

    const unsubscribeNotices = onSnapshot(
      collection(db, "guildNotices"),
      (snapshot) => {
        const noticeRows = snapshot.docs
          .map((noticeDoc) => ({
            id: noticeDoc.id,
            ...noticeDoc.data(),
          }))
          .filter((notice) => {
            const moduleName = clean(notice.module);
            const text = `${clean(notice.title)} ${clean(notice.entityType)} ${clean(notice.message)}`.toLowerCase();

            // CW is isolated from BH and Treasury. Old/mis-tagged documents
            // must not leak into the CW notice board simply because they
            // happen to contain a CW-like module value.
            const isBossHuntRecord = /\b(boss hunt|sonya|geomancer|reflector|giant hawk|reward)\b/.test(text);
            if (isBossHuntRecord) return false;
            if (["cw-attendance", "cw", "cw-treasury", "cw-item"].includes(moduleName)) return true;
            if (moduleName === "treasury") {
              return /\b(cw|clan war)\b/.test(text) || clean(notice.entityType).toLowerCase().includes("cw-");
            }

            return /^cw\b|\bclan war\b|cw-attendance|cw-player|cw-schedule|cw-salary|cw-role|cw-item|cw-treasury/.test(text);
          })
          .sort(
            (a, b) =>
              (safeDate(
                b.createdAt || b.timestamp
              )?.getTime() || 0) -
              (safeDate(
                a.createdAt || a.timestamp
              )?.getTime() || 0)
          );

        setNotices(noticeRows);
      }
    );

    const unsubscribeTreasuryEntries = onSnapshot(
      collection(db, "treasuryEntries"),
      (snapshot) => {
        setTreasuryEntries(
          snapshot.docs.map((entryDoc) => ({
            id: entryDoc.id,
            ...entryDoc.data(),
          }))
        );
      }
    );

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      unsubscribePlayers();
      unsubscribeAttendance();
      unsubscribeItems();
      unsubscribeItemAssignments();
      unsubscribeInventoryTransactions();
      unsubscribeSchedules();
      unsubscribeSettings();
      unsubscribeNotices();
      unsubscribeTreasuryEntries();
      clearInterval(timer);
    };
  }, []);

  const schedule = useMemo(() => { const a = schedules.filter(x => x.active !== false); return a[0] || { id: "default", days: DEFAULT_CW_DAYS.slice(), time: "21:00", timezone: PRIMARY_TIMEZONE, active: true } }, [schedules]);
  const baseTz = schedule.timezone || PRIMARY_TIMEZONE;
  const todayKey = dateKey(now, baseTz);
  const occurrences = useMemo(() => {
    const out = [], days = Array.isArray(schedule.days) ? schedule.days : DEFAULT_CW_DAYS;
    for (let i = -backDays; i <= forwardDays; i++) {
      const temp = new Date(now); temp.setDate(temp.getDate() + i); const key = dateKey(temp, baseTz); const p = partsInZone(temp, baseTz); if (!p) continue;
      const weekday = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
      if (days.includes(weekday)) { const at = buildOccurrence(key, schedule.time, baseTz); out.push({ key, time: schedule.time, timezone: baseTz, at, day: weekday }) }
    }
    return out.sort((a, b) => (safeDate(a.at)?.getTime() || 0) - (safeDate(b.at)?.getTime() || 0));
  }, [schedule, baseTz, now, backDays, forwardDays]);
  const nextOccurrence = occurrences.find(o => (safeDate(o.at)?.getTime() || 0) >= now.getTime()) || occurrences[0];
  const windowOccurrences = useMemo(() => { const today = occurrences.filter(o => o.key === todayKey); const rest = occurrences.filter(o => o.key !== todayKey); return [...today, ...rest].slice(0, 16); }, [occurrences, todayKey]);

  const currentOccurrence = occurrences.find(o => o.key === todayKey);
  const todayOccurrence = currentOccurrence || null;
  const shownOccurrence = selectedOccurrence || currentOccurrence || nextOccurrence;
  const inventoryStock = useMemo(() => {
    const map = {};
    const addStock = (idValue, quantityValue, direction) => {
      const id = String(idValue || "");
      const q = Math.max(0, Math.floor(num(quantityValue, 0)));
      if (!id || q <= 0) return;
      if (!map[id]) map[id] = { received: 0, distributed: 0, available: 0, threshold: 0 };
      if (direction === "in") map[id].received += q;
      if (direction === "out") map[id].distributed += q;
    };

    inventoryTransactions.forEach((tx) => {
      if (tx.itemId) {
        addStock(tx.itemId, tx.quantity, tx.direction);
        return;
      }
      if (Array.isArray(tx.inventoryLines)) {
        tx.inventoryLines.forEach(line => addStock(line.itemId, line.quantity, tx.direction || "in"));
      }
    });

    Object.values(map).forEach(v => {
      v.available = Math.max(0, v.received - v.distributed);
      v.threshold = v.received > 0 ? Math.max(1, Math.ceil(v.received * 0.10)) : 0;
    });
    return map;
  }, [inventoryTransactions]);
  const stockForItem = (itemId) => inventoryStock[String(itemId)] || { received: 0, distributed: 0, available: 0, threshold: 0 };
  const previousInventoryStatus = useRef({});
  const inventoryStatusInitialized = useRef(false);
  useEffect(() => {
    if (!cwItems.length || !inventoryTransactionsLoaded) return;
    const next = {};
    cwItems.forEach(item => {
      const st = stockForItem(item.id);
      next[String(item.id)] = st.received <= 0 || st.available <= 0 ? "OUT" : st.available <= st.threshold ? "LOW" : "IN";
    });
    if (!inventoryStatusInitialized.current) { previousInventoryStatus.current = next; inventoryStatusInitialized.current = true; return; }
    Object.entries(next).forEach(([itemId, status]) => {
      const previous = previousInventoryStatus.current[itemId];
      if (!previous || previous === status) return;
      const item = cwItems.find(i => String(i.id) === itemId); const st = stockForItem(itemId);
      if (!item) return;
      const title = status === "LOW" ? "INVENTORY LOW STOCK" : status === "OUT" ? "INVENTORY OUT OF STOCK" : "INVENTORY RESTOCKED";
      const message = status === "LOW" ? `${item.name} is low: ${st.available} remaining of ${st.received} received (10% threshold).` : status === "OUT" ? `${item.name} is out of stock: 0 remaining.` : `${item.name} was restocked: ${st.available} available.`;
      audit({ category: "ITEM", module: "cw-item", title, message, entityType: "cw-inventory-stock", entityId: itemId, item: item.name, details: [`Previous status: ${previous}`, `Current status: ${status}`, `Available: ${st.available}`, `Received: ${st.received}`, `Distributed: ${st.distributed}`, `10% threshold: ${st.threshold}`] }).catch(() => { });
    });
    previousInventoryStatus.current = next;
  }, [inventoryStock, cwItems, inventoryTransactionsLoaded]);
  const activePlayers = useMemo(() => players.filter(p => p.active !== false).sort((a, b) => clean(a.ign).localeCompare(clean(b.ign), undefined, { numeric: true, sensitivity: "base" })), [players]);
  const rosterPlayers = useMemo(() => players.slice().sort((a, b) => { const activeDiff = (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0); return activeDiff || clean(a.ign).localeCompare(clean(b.ign), undefined, { numeric: true, sensitivity: "base" }); }), [players]);
  const classes = useMemo(() => Array.from(new Set([...(GUILD_CLASSES || []), ...players.map(p => clean(p.className || p.class)).filter(Boolean)])), [players]);
  const roles = useMemo(() => Array.from(new Set([...(roleSettings.roles || DEFAULT_ROLES), ...players.map(p => clean(p.role)).filter(Boolean)])), [roleSettings, players]);
  const filteredPlayers = useMemo(() => { const q = playerSearch.toLowerCase().trim(); return rosterPlayers.filter(p => (!q || [p.ign, p.className || p.class, p.role].some(v => clean(v).toLowerCase().includes(q))) && (classFilter === "all" || clean(p.className || p.class) === classFilter) && (roleFilter === "all" || clean(p.role) === roleFilter)) }, [rosterPlayers, playerSearch, classFilter, roleFilter]);
  const playerPageCount = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const visiblePlayers = filteredPlayers.slice((playerPage - 1) * PAGE_SIZE, playerPage * PAGE_SIZE);
  const historyRows = useMemo(() => attendance.filter(r => !historySearch.trim() || [r.ign, r.className, r.role, r.receivedItem, r.notes].some(v => clean(v).toLowerCase().includes(historySearch.toLowerCase().trim()))).sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey))), [attendance, historySearch]);
  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE));
  const visibleHistory = historyRows.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);
  const totalSalary = attendance.reduce((s, r) => s + num(r.salaryGold), 0);
  const legacyItemCount = attendance.reduce((s, r) => s + (clean(r.receivedItem) ? Math.max(1, num(r.itemQuantity, 1)) : 0), 0);
  const assignedItemCount = itemAssignments.reduce((s, r) => s + Math.max(0, Math.floor(num(r.quantity, 0))), 0);
  const totalItems = legacyItemCount + assignedItemCount;
  const participatedToday = attendance.filter(r => clean(r.dateKey) === todayKey).length;
  const cwGoldEarnedToday = treasuryEntries.filter(e => (e.type === "cw-war-income" || e.type === "guild-income") && (clean(e.sourceModule) === "cw-rewards" || clean(e.source) === "clan-war-reward") && clean(e.dateKey) === todayKey).reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0);
  const cwItemsEarnedToday = inventoryTransactions.filter(t => t.direction === "in" && clean(t.source) === "clan-war-reward" && clean(t.dateKey) === todayKey).reduce((sum, t) => sum + Math.max(0, Math.floor(num(t.quantity, 0))), 0);

  const noticeDateKey = dateKey(now, resolvedTimezone);
  const noticeSearchLower = noticeSearch.toLowerCase().trim();
  const noticeAdmins = useMemo(() => Array.from(new Set(notices.map(n => clean(n.createdBy)).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [notices]);
  const matchingNotices = useMemo(() => notices.filter(n => {
    const created = safeDate(n.createdAt || n.timestamp);
    const createdDateKey = dateKey(created, resolvedTimezone);
    if (noticeCategoryFilter !== "all" && inferNoticeCategory(n) !== noticeCategoryFilter) return false;
    if (noticeAdminFilter !== "all" && clean(n.createdBy) !== noticeAdminFilter) return false;
    if (noticeDateFilter && createdDateKey !== noticeDateFilter) return false;
    if (noticeFrom && createdDateKey < noticeFrom) return false;
    if (noticeTo && createdDateKey > noticeTo) return false;
    if (noticeTimeFilter !== "all" && created) {
      const ageMs = now.getTime() - created.getTime();
      const limitMs = noticeTimeFilter === "24h" ? 24 * 60 * 60 * 1000 : noticeTimeFilter === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      if (ageMs < 0 || ageMs > limitMs) return false;
    }
    return !noticeSearchLower || [n.title, n.message, n.createdBy, n.playerName, n.rewardName, n.bossName, n.item, n.description]
      .some(v => clean(v).toLowerCase().includes(noticeSearchLower));
  }), [notices, noticeSearchLower, noticeCategoryFilter, noticeAdminFilter, noticeTimeFilter, noticeDateFilter, noticeFrom, noticeTo, resolvedTimezone, now]);
  const newNotices = useMemo(() => matchingNotices.filter(n => dateKey(n.createdAt || n.timestamp, resolvedTimezone) === noticeDateKey), [matchingNotices, resolvedTimezone, noticeDateKey]);
  const oldNotices = useMemo(() => matchingNotices.filter(n => dateKey(n.createdAt || n.timestamp, resolvedTimezone) !== noticeDateKey), [matchingNotices, resolvedTimezone, noticeDateKey]);
  const newPageCount = Math.max(1, Math.ceil(newNotices.length / PAGE_SIZE));
  const oldPageCount = Math.max(1, Math.ceil(oldNotices.length / PAGE_SIZE));
  const visibleNewNotices = newNotices.slice((noticeNewPage - 1) * PAGE_SIZE, noticeNewPage * PAGE_SIZE);
  const visibleOldNotices = oldNotices.slice((noticeOldPage - 1) * PAGE_SIZE, noticeOldPage * PAGE_SIZE);
  const newCount = newNotices.length;
  const oldCount = oldNotices.length;
  const allNoticePageCount = Math.max(1, Math.ceil(matchingNotices.length / PAGE_SIZE));
  const safeAllNoticePage = Math.min(allNoticePage, allNoticePageCount);
  const visibleAllNotices = matchingNotices.slice((safeAllNoticePage - 1) * PAGE_SIZE, safeAllNoticePage * PAGE_SIZE);

  useEffect(() => { setNoticePage(1); setNoticeNewPage(1); setNoticeOldPage(1); setAllNoticePage(1) }, [noticeSearch, noticeCategoryFilter, noticeAdminFilter, noticeTimeFilter, noticeDateFilter, noticeFrom, noticeTo]);

  function requireAdminComment(title, message, action) {
    if (!isAdmin) return;
    setAdminConfirm({ title, message, comment: "", action });
  }

  async function runAdminAction() {
    if (!adminConfirm) return;
    const comment = clean(adminConfirm.comment);
    if (!comment) { setMessage("Admin comment is required for this action."); return; }
    setSaving(true);
    try { await adminConfirm.action(comment); setAdminConfirm(null); } catch (e) { console.error(e); setMessage(e?.message || "Action failed."); } finally { setSaving(false); }
  }

  async function audit(payload) {
    try {
      const moduleName = payload.module || "cw-attendance";
      const category = payload.category || inferNoticeCategory(payload);
      await addDoc(collection(db, "guildNotices"), {
        module: moduleName,
        category,
        title: payload.title || "CW activity",
        message: payload.message || "",
        type: "info",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        createdBy: actor(user),
        createdByUid: user?.uid || null,
        entityType: payload.entityType || "",
        entityId: payload.entityId || "",
        playerId: payload.playerId || null,
        playerName: payload.playerName || "",
        bossName: payload.bossName || "",
        item: payload.item || "",
        description: payload.description || "",
        details: Array.isArray(payload.details) ? payload.details : [],
        changes: Array.isArray(payload.changes) ? payload.changes : []
      });
    } catch (e) { console.error(e) }
  }

  function openAddPlayer() { setPlayerForm({ ign: "", className: classes[0] || "Swordman", role: roles[0] || DEFAULT_ROLES[0] }); setPlayerModal({ mode: "add" }) }
  function openEditPlayer(p) { setPlayerForm({ ign: clean(p.ign), className: clean(p.className || p.class), role: clean(p.role) || roles[0] }); setPlayerModal({ mode: "edit", player: p }) }
  async function savePlayer() {
    if (!isAdmin) return;
    const ign = clean(playerForm.ign);
    if (!ign) { setMessage("IGN is required."); return }
    if (players.some(p => clean(p.ign).toLowerCase() === ign.toLowerCase() && p.id !== playerModal?.player?.id)) { setMessage("That IGN already exists."); return }
    if (playerModal.mode === "edit") {
      const p = playerModal.player;
      requireAdminComment("EDIT CW PLAYER", "An admin comment is required and will be written to the guild audit log.", async (comment) => {
        await updateDoc(doc(db, "cwPlayers", p.id), { ign, className: playerForm.className, role: playerForm.role, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
        await audit({ category: "PLAYER", title: "CW PLAYER UPDATED", message: `${ign} player profile was updated by ${actor(user)}.`, entityType: "cw-player", entityId: p.id, playerId: p.id, playerName: ign, changes: [{ field: "IGN", from: clean(p.ign), to: ign }, { field: "Class", from: clean(p.className || p.class), to: playerForm.className }, { field: "Role", from: clean(p.role), to: playerForm.role }], details: [`Admin comment: ${comment}`] });
        setPlayerModal(null); setMessage("Player updated.");
      });
      return;
    }
    setSaving(true);
    try { const ref = await addDoc(collection(db, "cwPlayers"), { ign, className: playerForm.className, role: playerForm.role, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null }); await audit({ category: "PLAYER", title: "CW PLAYER ADDED", message: `${ign} was added to the Clan War roster.`, entityType: "cw-player", entityId: ref.id, playerId: ref.id, playerName: ign, details: [`Class: ${playerForm.className}`, `Role: ${playerForm.role}`] }); setPlayerModal(null); setMessage("Player saved."); } catch (e) { setMessage(e?.message || "Unable to save player.") } finally { setSaving(false) }
  }
  function requestTogglePlayer(p) {
    if (!isAdmin) return;
    const nextActive = p.active === false;
    requireAdminComment(nextActive ? "ENABLE CW PLAYER" : "DISABLE CW PLAYER", `${nextActive ? "Enable" : "Disable"} ${p.ign} in the Clan War roster? History will be preserved.`, async (comment) => {
      await updateDoc(doc(db, "cwPlayers", p.id), { active: nextActive, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      await audit({ category: "PLAYER", title: nextActive ? "CW PLAYER ENABLED" : "CW PLAYER DISABLED", message: `${p.ign} was ${nextActive ? "enabled" : "disabled"} in the Clan War roster.`, entityType: "cw-player", entityId: p.id, playerId: p.id, playerName: p.ign, details: [`Status: ${nextActive ? "Enabled" : "Disabled"}`, `Admin comment: ${comment}`] });
      setMessage(`Player ${nextActive ? "enabled" : "disabled"}.`);
    });
  }

  async function deletePlayer(p) {
    if (!isAdmin) return;
    requireAdminComment("DELETE CW PLAYER", `Delete ${p.ign} from the CW roster? History will be preserved.`, async (comment) => {
      await deleteDoc(doc(db, "cwPlayers", p.id));
      await audit({ category: "PLAYER", title: "CW PLAYER DELETED", message: `${p.ign} was removed from the Clan War roster.`, entityType: "cw-player", entityId: p.id, playerId: p.id, playerName: p.ign, details: ["Historical CW attendance records were preserved.", `Admin comment: ${comment}`] });
      setMessage("Player deleted.");
    });
  }

  function openItemCatalog(mode = "add", item = null) {
    if (!isAdmin) return;
    setItemForm({ name: clean(item?.name), unitCost: item ? formatMoneyInput(item.unitCost) : "", description: clean(item?.description), active: item?.active !== false });
    setItemModal({ mode, item });
  }

  async function saveItemCatalog() {
    if (!isAdmin || !itemModal) return;
    const name = clean(itemForm.name);
    const unitCost = num(itemForm.unitCost);
    if (!name) { setMessage("Item name is required."); return; }
    if (unitCost < 0) { setMessage("Item cost cannot be negative."); return; }
    if (cwItems.some(i => clean(i.name).toLowerCase() === name.toLowerCase() && i.id !== itemModal?.item?.id)) { setMessage("That CW item already exists."); return; }
    if (itemModal.mode === "edit" && itemModal.item) {
      const old = itemModal.item;
      requireAdminComment("EDIT CW ITEM", "An admin comment is required and will be written to the unified CW audit log.", async (comment) => {
        await updateDoc(doc(db, "cwItems", old.id), { name, unitCost, description: clean(itemForm.description), active: itemForm.active !== false, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
        await audit({ category: "ITEM", title: "CW ITEM UPDATED", message: `${name} item definition was updated by ${actor(user)}.`, entityType: "cw-item", entityId: old.id, details: [`Item: ${name}`, `Unit cost: ₲ ${money(unitCost)}`, `Active: ${itemForm.active !== false ? "Yes" : "No"}`, `Admin comment: ${comment}`], changes: [{ field: "Name", from: old.name || "—", to: name }, { field: "Unit cost", from: `₲ ${money(old.unitCost)}`, to: `₲ ${money(unitCost)}` }] });
        setItemModal(null); setMessage("CW item updated.");
      });
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "cwItems"), { name, unitCost, description: clean(itemForm.description), active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null });
      await audit({ category: "ITEM", title: "CW ITEM CREATED", message: `${name} was added to the Clan War item list.`, entityType: "cw-item", entityId: ref.id, details: [`Item: ${name}`, `Unit cost: ₲ ${money(unitCost)}`, `Created by: ${actor(user)}`] });
      setItemModal(null); setMessage("CW item created.");
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to save CW item."); } finally { setSaving(false); }
  }

  function openInventoryAssignment(item = null) {
    if (!isAdmin) return;
    const defaultOcc = occurrences.find(o => o.key === todayKey) || selectedOccurrence || nextOccurrence || occurrences[0];
    const firstStockItem = item || cwItems.find(i => i.active !== false && stockForItem(i.id).available > 0) || null;
    setItemAssignmentForm({ playerId: "", itemId: firstStockItem ? String(firstStockItem.id) : "", quantity: "1", occurrenceKey: defaultOcc?.key || "", notes: "", adminComment: "" });
    setItemAssignmentModal({ player: null, assignment: null, treasuryEntry: null, inventoryItem: firstStockItem });
  }

  function openAssignmentFromHub() {
    if (!isAdmin) return;
    setItemModal(null);
    openInventoryAssignment();
  }

  function openGuildInventory() { setItemModal({ mode: "inventory" }); }

  function openItemAssignment(p, assignment = null, treasuryEntry = null) {
    if (!isAdmin) return;
    const defaultOcc = occurrences.find(o => o.key === todayKey) || selectedOccurrence || nextOccurrence || occurrences[0];
    const treasuryItemMatch = treasuryEntry ? cwItems.find(i => clean(i.name).toLowerCase() === clean(treasuryEntry.item).toLowerCase() && i.active !== false) : null;
    setItemAssignmentForm({
      playerId: assignment?.playerId || p?.id || treasuryEntry?.playerId || "",
      itemId: assignment?.itemId || treasuryItemMatch?.id || cwItems.find(i => i.active !== false)?.id || "",
      quantity: assignment ? String(num(assignment.quantity, 1)) : (treasuryEntry && treasuryItemMatch && num(treasuryItemMatch.unitCost) > 0 ? String(Math.max(1, Math.round(Math.abs(num(treasuryEntry.amount)) / num(treasuryItemMatch.unitCost)))) : "1"),
      occurrenceKey: assignment?.dateKey || (treasuryEntry ? dateKey(treasuryEntry.transactionAt || treasuryEntry.createdAt, baseTz) : "") || defaultOcc?.key || "",
      notes: assignment?.notes || "",
      adminComment: ""
    });
    setItemAssignmentModal({ player: p, assignment, treasuryEntry });
  }

  const spendingInventoryCategories = useMemo(() => {
    const values = cwItems.map(i => clean(i.category || "Clan War")).filter(Boolean);
    return ["ALL", ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [cwItems]);

  const spendingInventoryRows = useMemo(() => {
    const q = clean(spendingInventorySearch).toLowerCase();
    return cwItems
      .filter(i => i.active !== false)
      .map(item => {
        const st = stockForItem(item.id);
        const category = clean(item.category || "Clan War");
        const status = st.available <= 0 ? "OUT" : st.available <= st.threshold ? "LOW" : "IN STOCK";
        return { item, st, category, status };
      })
      .filter(row => spendingInventoryCategory === "ALL" || row.category === spendingInventoryCategory)
      .filter(row => !q || row.item.name.toLowerCase().includes(q) || row.category.toLowerCase().includes(q))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [cwItems, inventoryTransactions, spendingInventorySearch, spendingInventoryCategory]);

  const spendingInventoryPageCount = Math.max(1, Math.ceil(spendingInventoryRows.length / 5));
  const spendingInventoryPageSafe = Math.min(spendingInventoryPage, spendingInventoryPageCount);
  const spendingInventoryPageRows = spendingInventoryRows.slice((spendingInventoryPageSafe - 1) * 5, spendingInventoryPageSafe * 5);

  function openCwSpending() {
    if (!isAdmin) return;
    const first = cwItems.find(i => i.active !== false);
    setCwSpendingGold("");
    setCwSpendingLines([{ itemId: first?.id || "", itemName: first?.name || "", unitCost: first ? formatMoneyInput(first.unitCost) : "", quantity: "1" }]);
    setCwSpendingNote("");
    setSpendingInventorySearch("");
    setSpendingInventoryCategory("ALL");
    setSpendingInventoryPage(1);
    setCwSpendingModal(true);
  }

  async function saveCwSpending() {
    if (!isAdmin) return;
    const lines = [];
    for (const line of cwSpendingLines) {
      const name = clean(line.itemName);
      let item = cwItems.find(i => String(i.id) === String(line.itemId));
      if (!item && name) item = cwItems.find(i => clean(i.name).toLowerCase() === name.toLowerCase());
      if (!item && name) {
        const unitCost = Math.max(0, num(line.unitCost, 0));
        if (unitCost <= 0) { setMessage(`Enter a unit cost for new item: ${name}.`); return; }
        const ref = await addDoc(collection(db, "cwItems"), { name, unitCost, description: "Created from Clan War spending", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null });
        item = { id: ref.id, name, unitCost, active: true };
        await audit({ category: "ITEM", module: "cw-item", title: "CW ITEM CREATED FROM SPENDING", message: `${name} was added to the Clan War item catalog.`, entityType: "cw-item", entityId: ref.id, details: [`Item: ${name}`, `Unit cost: ₲ ${money(unitCost)}`, `Created by: ${actor(user)}`] });
      }
      const quantity = Math.floor(num(line.quantity, 0));
      if (item && quantity > 0) lines.push({ item, quantity, unitCost: num(item.unitCost), total: num(item.unitCost) * quantity });
    }
    const stockTotal = lines.reduce((sum, l) => sum + l.total, 0);
    const goldSpent = Math.max(0, num(cwSpendingGold, 0) || stockTotal);
    if (goldSpent <= 0 && !lines.length) { setMessage("Enter the gold spent or add stock purchased."); return; }
    if (goldSpent > treasuryBalance) { setMessage(`Not enough Guild Gold. Available: ₲ ${money(treasuryBalance)}.`); return; }
    if (lines.length && goldSpent < stockTotal) { setMessage(`Gold spent cannot be less than the stock value of ₲ ${money(stockTotal)}.`); return; }
    setSaving(true);
    try {
      const createdAtNow = new Date();
      const summary = lines.map(l => `${l.item.name} × ${l.quantity}`).join(" • ");
      const description = clean(cwSpendingNote) || (summary ? "Clan War stock purchase" : "Clan War expense");
      const tr = await addDoc(collection(db, "treasuryEntries"), {
        type: lines.length ? "inventory-purchase" : "expense", ledgerType: lines.length ? "inventory" : "treasury", direction: "out", amount: -Math.abs(goldSpent),
        description, item: summary, inventoryLines: lines.map(l => ({ itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity, unitCost: l.unitCost, totalCost: l.total })),
        transactionAt: createdAtNow, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null,
        adminComment: clean(cwSpendingNote)
      });
      for (const l of lines) await addDoc(collection(db, "cwInventoryTransactions"), {
        type: "purchase", direction: "in", itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity, unitCost: l.unitCost, totalCost: l.total,
        sourceTreasuryId: tr.id, source: "cw-spending", createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null
      });
      await audit({
        category: "TREASURY", module: "cw-treasury", title: "CLAN WAR SPENDING & SUPPLIES RECORDED",
        message: `₲ ${money(goldSpent)} deducted from Guild Gold${summary ? ` and ${summary} added to Inventory Vault` : ""}.`,
        entityType: "cw-spending", entityId: tr.id,
        details: [
          `Gold spent: -₲ ${money(goldSpent)}`,
          ...(lines.length ? lines.map(l => `${l.item.name}: +${l.quantity} added to Inventory Vault`) : []),
          `Added: ${formatDateTime(createdAtNow, resolvedTimezone)}`,
          `Recorded by: ${actor(user)}`,
          ...(clean(cwSpendingNote) ? [`Note: ${clean(cwSpendingNote)}`] : [])
        ]
      });
      setCwSpendingModal(false);
      setMessage(`Clan War spending recorded: -₲ ${money(goldSpent)}${lines.length ? ` and ${lines.reduce((n, l) => n + l.quantity, 0)} stock item${lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"} added.` : "."}`);
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to save Clan War spending."); } finally { setSaving(false); }
  }

  function openInventoryPurchase() {
    if (!isAdmin) return;
    const first = cwItems.find(i => i.active !== false);
    setInventoryPurchaseLines([{ itemId: first?.id || "", quantity: "1" }]);
    setInventoryPurchaseNote(""); setInventoryPurchaseModal(true);
  }

  function openClanWarRewards() {
    if (!isAdmin) return;
    setCwRewardsGold("");
    const first = cwItems.find(i => i.active !== false);
    setCwRewardsLines([{ itemId: first?.id || "", itemName: first?.name || "", quantity: "1" }]);
    setCwRewardsNote("");
    setCwRewardsModal(true);
  }

  async function saveClanWarRewards() {
    if (!isAdmin) return;
    const gold = Math.max(0, num(cwRewardsGold, 0));
    const resolvedLines = [];
    for (const line of cwRewardsLines) {
      const typedName = clean(line.itemName || "");
      const quantity = Math.floor(num(line.quantity, 0));
      if (!typedName || quantity <= 0) continue;
      let item = cwItems.find(i => String(i.id) === String(line.itemId));
      if (!item) item = cwItems.find(i => clean(i.name).toLowerCase() === typedName.toLowerCase());
      if (!item) {
        const existing = cwItems.find(i => clean(i.name).toLowerCase() === typedName.toLowerCase());
        if (existing) item = existing;
        else {
          const ref = await addDoc(collection(db, "cwItems"), {
            name: typedName, unitCost: 0, description: "Clan War reward item", active: true,
            createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null
          });
          item = { id: ref.id, name: typedName, unitCost: 0, description: "Clan War reward item", active: true };
        }
      }
      resolvedLines.push({ item, quantity });
    }
    const lines = resolvedLines;
    if (gold <= 0 && !lines.length) { setMessage("Enter today's Clan War gold or add at least one item reward."); return; }
    setSaving(true);
    try {
      const createdAtNow = new Date();
      const summary = lines.map(l => `${l.item.name} × ${l.quantity}`).join(" • ");
      let treasuryId = "";
      if (gold > 0) {
        const tr = await addDoc(collection(db, "treasuryEntries"), {
          type: "cw-war-income", ledgerType: "treasury", direction: "in", amount: gold,
          dateKey: todayKey, sourceModule: "cw-rewards", source: "clan-war-reward",
          description: "Clan War gold earned", item: summary,
          rewardItems: lines.map(l => ({ itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity })),
          transactionAt: createdAtNow, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null,
          adminComment: clean(cwRewardsNote)
        });
        treasuryId = tr.id;
      }
      const invRefs = [];
      for (const l of lines) {
        const ref = await addDoc(collection(db, "cwInventoryTransactions"), {
          type: "cw-reward", direction: "in", source: "clan-war-reward",
          itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity,
          unitCost: 0, totalCost: 0, dateKey: todayKey, sourceTreasuryId: treasuryId || null,
          itemSummary: `${l.item.name} × ${l.quantity}`, note: clean(cwRewardsNote),
          createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null
        });
        invRefs.push(ref.id);
      }
      await audit({
        category: "ITEM", module: "cw-rewards", title: "CLAN WAR GOLD & REWARDS RECEIVED",
        message: `Today's Clan War earned ${gold > 0 ? `₲ ${money(gold)}` : "₲ 0"}${summary ? ` and ${summary}` : ""}.`,
        entityType: "cw-reward", entityId: treasuryId || invRefs[0] || "",
        details: [
          `CW date: ${formatDate(createdAtNow, resolvedTimezone)}`,
          `Gold earned: ₲ ${money(gold)}`,
          `Items earned: ${lines.reduce((n, l) => n + l.quantity, 0)} pcs`,
          ...(lines.length ? lines.map(l => `${l.item.name}: +${l.quantity} added to Inventory Vault`) : []),
          `Recorded by: ${actor(user)}`,
          ...(clean(cwRewardsNote) ? [`Note: ${clean(cwRewardsNote)}`] : [])
        ]
      });
      setCwRewardsModal(false);
      setMessage(`Clan War winnings recorded: ₲ ${money(gold)} gold and ${lines.reduce((n, l) => n + l.quantity, 0)} item${lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"} added to Inventory.`);
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to save Clan War rewards."); } finally { setSaving(false); }
  }

  function openFreeInventory() {
    if (!isAdmin) return;
    const first = cwItems.find(i => i.active !== false);
    setInventoryPurchaseLines([{ itemId: first?.id || "", quantity: "1" }]);
    setInventoryPurchaseNote("Clan War reward / free stock"); setInventoryPurchaseModal("free");
  }

  async function saveInventoryPurchase() {
    if (!isAdmin) return;
    const lines = inventoryPurchaseLines.map(line => { const item = cwItems.find(i => String(i.id) === String(line.itemId)); const quantity = Math.floor(num(line.quantity, 0)); return item && quantity > 0 ? { item, quantity, unitCost: num(item.unitCost), total: num(item.unitCost) * quantity } : null; }).filter(Boolean);
    if (!lines.length) { setMessage("Add at least one inventory item and quantity."); return; }
    const total = lines.reduce((a, l) => a + l.total, 0); if (total <= 0) { setMessage("Inventory purchase total must be greater than zero."); return; }
    setSaving(true);
    try {
      const summary = lines.map(l => `${l.item.name} × ${l.quantity}`).join(" • ");
      const tr = await addDoc(collection(db, "treasuryEntries"), { type: "inventory-purchase", ledgerType: "inventory", direction: "out", amount: -Math.abs(total), description: clean(inventoryPurchaseNote) || "Inventory stock purchase", item: summary, inventoryLines: lines.map(l => ({ itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity, unitCost: l.unitCost, totalCost: l.total })), transactionAt: new Date(), createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null });
      for (const l of lines) await addDoc(collection(db, "cwInventoryTransactions"), { type: "purchase", direction: "in", itemId: String(l.item.id), itemName: clean(l.item.name), quantity: l.quantity, unitCost: l.unitCost, totalCost: l.total, sourceTreasuryId: tr.id, source: "guild-purchase", createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null });
      await audit({ category: "ITEM", module: "cw-item", title: "INVENTORY STOCK PURCHASED", message: `${summary} added to inventory for -₲ ${money(total)}.`, entityType: "cw-inventory-purchase", entityId: tr.id, details: [`Total cost: -₲ ${money(total)}`, ...lines.map(l => `${l.item.name}: +${l.quantity}`)] });
      setInventoryPurchaseModal(false); setMessage("Inventory purchased, Treasury expense recorded and stock updated.");
    } catch (e) { setMessage(e?.message || "Unable to purchase inventory."); } finally { setSaving(false); }
  }

  async function saveFreeInventory() {
    if (!isAdmin) return;
    const lines = inventoryPurchaseLines.map(line => { const item = cwItems.find(i => String(i.id) === String(line.itemId)); const quantity = Math.floor(num(line.quantity, 0)); return item && quantity > 0 ? { item, quantity } : null; }).filter(Boolean);
    if (!lines.length) { setMessage("Add at least one item and quantity."); return; }
    setSaving(true);
    try {
      const summary = lines.map(l => `${l.item.name} × ${l.quantity}`).join(" • ");
      const refs = [];

      // Every free-stock line is a real inbound inventory transaction.
      // It increases physical stock but never creates a Treasury expense.
      for (const l of lines) {
        const ref = await addDoc(collection(db, "cwInventoryTransactions"), {
          type: "cw-reward",
          direction: "in",
          source: "clan-war-reward",
          itemId: String(l.item.id),
          itemName: clean(l.item.name),
          quantity: l.quantity,
          unitCost: 0,
          totalCost: 0,
          itemSummary: `${l.item.name} × ${l.quantity}`,
          note: clean(inventoryPurchaseNote),
          createdAt: serverTimestamp(),
          createdBy: actor(user),
          createdByUid: user?.uid || null
        });
        refs.push(ref);
      }

      await audit({
        category: "ITEM",
        module: "cw-item",
        title: "FREE CW STOCK RECEIVED",
        message: `${summary} added to inventory at ₲0.`,
        entityType: "cw-inventory-receipt",
        entityId: refs[0]?.id || "",
        details: ["Treasury expense: ₲0", ...lines.map(l => `${l.item.name}: +${l.quantity} free stock`)]
      });
      setInventoryPurchaseModal(false);
      setMessage("Free Clan War stock received at ₲0 and added to Inventory.");
    } catch (e) { setMessage(e?.message || "Unable to receive free stock."); } finally { setSaving(false); }
  }

  async function saveItemAssignment() {
    if (!isAdmin || !itemAssignmentModal) return;
    const { assignment, treasuryEntry } = itemAssignmentModal;
    const player = players.find(p => String(p.id) === String(itemAssignmentForm.playerId)) || itemAssignmentModal.player;
    const item = cwItems.find(i => String(i.id) === String(itemAssignmentForm.itemId));
    const quantity = Math.floor(num(itemAssignmentForm.quantity, 0));
    const matchedOccurrence = occurrences.find(o => o.key === itemAssignmentForm.occurrenceKey);
    const fallbackDate = itemAssignmentForm.occurrenceKey ? buildOccurrence(itemAssignmentForm.occurrenceKey, schedule.time, baseTz) : null;
    const occ = matchedOccurrence || (fallbackDate ? { key: itemAssignmentForm.occurrenceKey, time: schedule.time, timezone: baseTz, at: fallbackDate } : null) || occurrences.find(o => o.key === todayKey) || selectedOccurrence || nextOccurrence;
    if (!player) { setMessage("Select a player."); return; }
    if (!item) { setMessage("Select an item from the CW Item Catalog."); return; }
    if (item.active === false && !assignment) { setMessage("That item is disabled. Enable it before assigning it."); return; }
    if (quantity < 1) { setMessage("Quantity must be at least 1."); return; }
    if (!occ) { setMessage("Select a Clan War occurrence."); return; }
    if (!assignment) {
      const stock = stockForItem(item.id);
      if (stock.available < quantity) { setMessage(`${item.name}: only ${stock.available} in stock.`); return; }
    } else if (!treasuryEntry && assignment.inventoryTransactionId) {
      const stock = stockForItem(item.id);
      const previousQty = Math.floor(num(assignment.quantity, 0));
      const usable = stock.available + previousQty;
      if (usable < quantity) { setMessage(`${item.name}: only ${usable} available for this edited assignment.`); return; }
    }
    if (assignment && !clean(itemAssignmentForm.adminComment)) { setMessage("Admin comment is required when editing an item assignment."); return; }
    setSaving(true);
    try {
      const totalCost = num(item.unitCost) * quantity;
      const payload = { playerId: String(player.id), playerName: clean(player.ign), className: clean(player.className || player.class), role: clean(player.role), itemId: String(item.id), itemName: clean(item.name), unitCost: num(item.unitCost), quantity, totalCost, dateKey: occ.key, scheduledAt: occ.at, scheduledTime: occ.time, scheduledTimezone: baseTz, notes: clean(itemAssignmentForm.notes), updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null };
      let id = assignment?.id;
      if (assignment) await updateDoc(doc(db, "cwItemAssignments", assignment.id), payload);
      else id = (await addDoc(collection(db, "cwItemAssignments"), { ...payload, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null })).id;

      const priorTreasury = treasuryEntry || treasuryEntries.find(e => String(e.sourceItemAssignmentId || "") === String(id));
      let inventoryTransactionId = assignment?.inventoryTransactionId || "";
      if (priorTreasury) {
        const treasuryData = { type: "item-purchase", ledgerType: "item", direction: "out", amount: -Math.abs(totalCost), playerId: String(player.id), playerName: clean(player.ign), dateKey: occ.key, description: `CW item handed out — ${player.ign}`, item: clean(item.name), quantity, unitCost: num(item.unitCost), sourceItemAssignmentId: String(id), sourceModule: "cw-item", transactionAt: occ.at, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null };
        await updateDoc(doc(db, "treasuryEntries", priorTreasury.id), treasuryData);
      } else if (assignment?.inventoryTransactionId) {
        inventoryTransactionId = assignment.inventoryTransactionId;
        await updateDoc(doc(db, "cwInventoryTransactions", inventoryTransactionId), { quantity, totalCost, itemId: String(item.id), itemName: clean(item.name), updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      } else {
        const invRef = await addDoc(collection(db, "cwInventoryTransactions"), { type: "assignment", direction: "out", itemId: String(item.id), itemName: clean(item.name), quantity, unitCost: num(item.unitCost), totalCost, playerId: String(player.id), playerName: clean(player.ign), sourceAssignmentId: String(id), source: "player-distribution", dateKey: occ.key, scheduledAt: occ.at, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null });
        inventoryTransactionId = invRef.id;
      }
      await updateDoc(doc(db, "cwItemAssignments", id), { inventoryTransactionId: inventoryTransactionId || null });

      await updateDoc(doc(db, "cwPlayers", player.id), { updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      await audit({ category: "ITEM", module: "cw-item", title: assignment ? "CW ITEM ASSIGNMENT UPDATED" : "CW ITEM HANDED OUT", message: assignment ? `${quantity} ${quantity === 1 ? "pc" : "pcs"} ${item.name} assignment was updated for ${player.ign} during Clan War.` : `${quantity} ${quantity === 1 ? "pc" : "pcs"} ${item.name} were handed to ${player.ign} during Clan War.`, entityType: "cw-item-assignment", entityId: id, playerId: player.id, playerName: player.ign, item: item.name, details: [`Player: ${player.ign}`, `Item: ${item.name}`, `Quantity: ${quantity}`, `Unit cost: ₲ ${money(item.unitCost)}`, `Total item cost: ₲ ${money(totalCost)}`, `CW date: ${formatDate(occ.at, resolvedTimezone)}`, `Treasury expense: ${priorTreasury ? `-₲ ${money(totalCost)}` : "₲ 0 — inventory distribution only"}`, assignment ? `Admin comment: ${clean(itemAssignmentForm.adminComment)}` : `Recorded by: ${actor(user)}`] });
      setItemAssignmentModal(null); setMessage(assignment ? (priorTreasury ? "Item assignment updated and Treasury synchronized." : "Item assignment updated and inventory synchronized.") : (priorTreasury ? "Item assigned and linked to the existing Treasury expense." : "Item assigned from inventory; no duplicate Treasury expense created."));
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to save item assignment."); } finally { setSaving(false); }
  }

  function requestDeleteItemAssignment(assignment) {
    if (!isAdmin) return;
    requireAdminComment("DELETE CW ITEM ASSIGNMENT", `Remove ${assignment.quantity} × ${assignment.itemName} from ${assignment.playerName}'s CW history? The linked Treasury expense will be reversed.`, async (comment) => {
      const linked = treasuryEntries.find(e => String(e.sourceItemAssignmentId || "") === String(assignment.id));
      if (assignment.inventoryTransactionId) await deleteDoc(doc(db, "cwInventoryTransactions", assignment.inventoryTransactionId)).catch(() => { });
      if (linked) {
        const amount = Math.abs(num(linked.amount));
        if (amount) await addDoc(collection(db, "treasuryEntries"), { type: "item-purchase-reversal", ledgerType: "item", direction: "in", amount, playerId: assignment.playerId, playerName: assignment.playerName, dateKey: assignment.dateKey, item: assignment.itemName, quantity: assignment.quantity, sourceItemAssignmentId: String(assignment.id), sourceModule: "cw-item", transactionAt: safeDate(assignment.scheduledAt) || new Date(), createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null, description: `Reversal — CW item handed out — ${assignment.playerName}` });
      }
      await deleteDoc(doc(db, "cwItemAssignments", assignment.id));
      await audit({ category: "ITEM", module: "cw-item", title: "CW ITEM ASSIGNMENT DELETED", message: `${assignment.quantity} ${assignment.quantity === 1 ? "pc" : "pcs"} ${assignment.itemName} assigned to ${assignment.playerName} was removed.`, entityType: "cw-item-assignment", entityId: assignment.id, playerId: assignment.playerId, playerName: assignment.playerName, details: [`Item: ${assignment.itemName}`, `Quantity: ${assignment.quantity}`, `Treasury reversal: +₲ ${money(Math.abs(num(linked?.amount)))}`, `Reason: ${comment}`, `Deleted by: ${actor(user)}`] });
      setMessage(linked ? "Item assignment deleted and the linked Treasury expense was reversed." : "Item assignment deleted and inventory stock was restored.");
    });
  }

  function requestToggleItem(item) {
    if (!isAdmin) return;
    const nextActive = item.active === false;
    requireAdminComment(nextActive ? "ENABLE CW ITEM" : "DISABLE CW ITEM", `${nextActive ? "Enable" : "Disable"} ${item.name}? Existing player history will be preserved.`, async (comment) => {
      await updateDoc(doc(db, "cwItems", item.id), { active: nextActive, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      await audit({ category: "ITEM", title: nextActive ? "CW ITEM ENABLED" : "CW ITEM DISABLED", message: `${item.name} was ${nextActive ? "enabled" : "disabled"}.`, entityType: "cw-item", entityId: item.id, details: [`Item: ${item.name}`, `Admin comment: ${comment}`] });
      setMessage(`CW item ${nextActive ? "enabled" : "disabled"}.`);
    });
  }

  function openAttendance(p, occ = shownOccurrence, mode = "edit") {
    if (!isAdmin || !occ) return;
    const existing = attendance.find(r => String(r.playerId) === String(p.id) && clean(r.dateKey) === occ.key);
    if (!existing && clean(occ.key) !== todayKey) { setMessage("CW clock-in is only available for today. Select TODAY to mark attendance."); return; }
    const className = clean(p.className || p.class);
    const role = clean(p.role);
    const roleProfiles = Array.isArray(salarySettings.byClassRole) ? salarySettings.byClassRole : [];
    const exactProfile = roleProfiles.find(x => clean(x.className) === className && clean(x.role).toLowerCase() === role.toLowerCase());
    const allRoleProfile = roleProfiles.find(x => clean(x.className) === className && clean(x.role).toLowerCase() === "all roles");
    const defaultSalary = exactProfile ? exactProfile.salaryGold : allRoleProfile ? allRoleProfile.salaryGold : salarySettings.byClass?.[className];
    setAttendanceForm({ salaryGold: existing ? existing.salaryGold : String(num(defaultSalary, 0) || ""), itemCostGold: existing?.itemCostGold || "", receivedItem: existing?.receivedItem || "", notes: existing?.notes || "", adminComment: "" });
    setAttendanceModal({ player: p, occurrence: occ, existing, mode });
  }
  function openAttendanceRecord(row, mode = "edit") {
    const p = players.find(x => String(x.id) === String(row.playerId));
    const occ = occurrences.find(x => x.key === row.dateKey) || { key: row.dateKey, time: row.scheduledTime || schedule.time, timezone: row.scheduledTimezone || baseTz, at: safeDate(row.scheduledAt) || buildOccurrence(row.dateKey, row.scheduledTime || schedule.time, row.scheduledTimezone || baseTz) };
    if (p) openAttendance(p, occ, mode);
  }
  async function saveAttendance() {
    if (!isAdmin || !attendanceModal) return;
    const { player, occurrence, existing, mode } = attendanceModal;
    if (existing && !clean(attendanceForm.adminComment)) { setMessage("Admin comment is required when editing or overriding attendance."); return; }
    setSaving(true);
    try {
      const salary = num(attendanceForm.salaryGold), itemCost = num(attendanceForm.itemCostGold);
      const payload = { playerId: String(player.id), ign: clean(player.ign), className: clean(player.className || player.class), role: clean(player.role), dateKey: occurrence.key, scheduledTime: occurrence.time, scheduledTimezone: baseTz, scheduledAt: occurrence.at, attended: true, salaryGold: salary, itemCostGold: itemCost, receivedItem: clean(attendanceForm.receivedItem), notes: clean(attendanceForm.notes), manualOverride: mode === "override" || Boolean(existing?.manualOverride), adminComment: clean(attendanceForm.adminComment), updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null };
      let id = existing?.id;
      if (existing) await updateDoc(doc(db, "cwAttendance", id), payload);
      else { id = (await addDoc(collection(db, "cwAttendance"), { ...payload, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null })).id; }
      await updateDoc(doc(db, "cwPlayers", player.id), { updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      const prior = treasuryEntries.filter(e => String(e.sourceAttendanceId || "") === String(id));
      async function upsert(type, amount, description, item) { const old = prior.find(e => e.ledgerType === type); if (!amount) { if (old) await deleteDoc(doc(db, "treasuryEntries", old.id)); return; } const data = { type: type === "salary" ? "cw-salary" : "item-purchase", ledgerType: type, direction: "out", amount: -Math.abs(amount), playerId: String(player.id), playerName: clean(player.ign), dateKey: occurrence.key, description, item: clean(item), sourceAttendanceId: String(id), sourceModule: "cw-attendance", transactionAt: occurrence.at, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }; if (old) await updateDoc(doc(db, "treasuryEntries", old.id), data); else await addDoc(collection(db, "treasuryEntries"), { ...data, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null }); }
      await upsert("salary", salary, `CW salary — ${player.ign}`, "");
      await upsert("item", itemCost, `CW item handed out — ${player.ign}`, attendanceForm.receivedItem);
      await audit({ category: "ATTENDANCE", title: mode === "override" ? "CW ATTENDANCE OVERRIDDEN" : existing ? "CW ATTENDANCE UPDATED" : "CW ATTENDANCE RECORDED", message: `${player.ign} Clan War attendance for ${occurrence.key} was ${mode === "override" ? "overridden" : "saved"}.`, entityType: "cw-attendance", entityId: id, playerId: player.id, playerName: player.ign, details: [`CW date: ${formatDate(occurrence.at, resolvedTimezone)}`, `Class: ${player.className || player.class}`, `Role: ${player.role}`, `Salary: ₲ ${money(salary)}`, `Item cost: ₲ ${money(itemCost)}`, `Received: ${clean(attendanceForm.receivedItem) || "Nothing recorded"}`, `Action: ${mode === "override" ? "OVERRIDE" : existing ? "EDIT" : "ADD"}`, `Admin comment: ${clean(attendanceForm.adminComment) || "None"}`, `Changed by: ${actor(user)}`] });
      if (clean(attendanceForm.receivedItem)) await audit({ category: "ITEM", module: "cw-attendance", title: "CW ITEM HANDED OUT", message: `${attendanceForm.receivedItem} was handed to ${player.ign} during Clan War.`, entityType: "treasury-item", entityId: id, playerId: player.id, playerName: player.ign, details: [`Item: ${attendanceForm.receivedItem}`, `Item cost: ₲ ${money(itemCost)}`, `CW date: ${formatDate(occurrence.at, resolvedTimezone)}`] });
      setAttendanceModal(null); setMessage(mode === "override" ? "CW attendance overridden and logged." : existing ? "CW attendance updated and logged." : "CW attendance saved.");
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to save attendance.") } finally { setSaving(false) }
  }

  function requestDeleteAttendance(row) {
    if (!isAdmin) return;
    requireAdminComment("DELETE CW ATTENDANCE", `Delete ${row.ign || "this player"}'s CW attendance for ${row.dateKey}? Treasury reversal entries will be created.`, async (comment) => {
      const prior = treasuryEntries.filter(e => String(e.sourceAttendanceId || "") === String(row.id));
      for (const e of prior) { const amt = Math.abs(num(e.amount)); if (amt) await addDoc(collection(db, "treasuryEntries"), { type: e.ledgerType === "item" ? "item-purchase-reversal" : "cw-salary-reversal", ledgerType: e.ledgerType || "salary", direction: "in", amount: amt, playerId: row.playerId || null, playerName: row.ign || "", dateKey: row.dateKey || "", description: `Reversal — ${row.ign || "player"}`, sourceAttendanceId: String(row.id), sourceModule: "cw-attendance", transactionAt: safeDate(row.scheduledAt) || new Date(), createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null }); }
      await deleteDoc(doc(db, "cwAttendance", row.id));
      if (row.playerId) await updateDoc(doc(db, "cwPlayers", row.playerId), { updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
      await audit({ category: "ATTENDANCE", title: "CW ATTENDANCE DELETED", message: `${row.ign || "Player"} CW attendance was deleted for ${row.dateKey}.`, entityType: "cw-attendance", entityId: row.id, playerId: row.playerId, playerName: row.ign, details: ["Attendance record deleted and Treasury reversal entries created.", `Admin comment: ${comment}`, `Deleted by: ${actor(user)}`] });
      setSelectedAttendance(null); setAttendanceModal(null); setMessage("CW attendance deleted and Treasury reversed.");
    });
  }

  // Treasury source of truth: every signed ledger entry contributes to the balance.
  // Manual "Available Gold" overrides are stored as delta entries, so the current balance
  // can be corrected without deleting or rewriting the historical ledger.
  const treasuryBalance = treasuryEntries.reduce((sum, e) => sum + num(e.amount), 0);
  const treasurySalaryNet = treasuryEntries.filter(e => e.type === "cw-salary" || e.type === "cw-salary-reversal").reduce((sum, e) => sum + num(e.amount), 0);
  const treasuryItemNet = treasuryEntries.filter(e => e.type === "item-purchase" || e.type === "item-purchase-reversal").reduce((sum, e) => sum + num(e.amount), 0);
  const treasurySalaryOut = Math.max(0, -treasurySalaryNet);
  const treasuryItemOut = Math.max(0, -treasuryItemNet);
  const treasuryIncome = treasuryEntries.filter(e => e.type === "cw-war-income" || e.type === "guild-income").reduce((sum, e) => sum + Math.max(0, num(e.amount)), 0);
  const latestTreasuryIncome = treasuryEntries.filter(e => e.type === "cw-war-income" || e.type === "guild-income").slice().sort((a, b) => (safeDate(b.transactionAt || b.createdAt)?.getTime() || 0) - (safeDate(a.transactionAt || a.createdAt)?.getTime() || 0))[0];
  const treasuryOverrides = treasuryEntries.filter(e => e.type === "balance-override").reduce((sum, e) => sum + num(e.amount), 0);
  const filteredTreasuryEntries = useMemo(() => {
    const q = treasurySearch.toLowerCase().trim();
    return treasuryEntries.slice().filter(e => {
      if (treasuryCategoryFilter !== "all" && treasuryCategory(e) !== treasuryCategoryFilter) return false;
      const d = safeDate(e.createdAt || e.transactionAt || e.updatedAt);
      if (treasuryDateFilter && dateKey(d, resolvedTimezone) !== treasuryDateFilter) return false;
      const dk = dateKey(d, resolvedTimezone);
      if (treasuryFrom && dk && dk < treasuryFrom) return false;
      if (treasuryTo && dk && dk > treasuryTo) return false;
      if (!q) return true;
      return [e.description, e.item, e.playerName, e.createdBy, e.updatedBy, treasuryTypeLabel(e), treasuryCategory(e)].some(v => clean(v).toLowerCase().includes(q));
    }).sort((a, b) => (safeDate(b.createdAt || b.updatedAt || b.transactionAt)?.getTime() || 0) - (safeDate(a.createdAt || a.updatedAt || a.transactionAt)?.getTime() || 0));
  }, [treasuryEntries, treasurySearch, treasuryCategoryFilter, treasuryDateFilter, treasuryFrom, treasuryTo, resolvedTimezone]);

  async function saveTreasuryEntry() {
    if (!isAdmin) return;
    const amount = num(treasuryForm.amount);
    if (!amount || !clean(treasuryForm.description)) { setMessage("Amount and description are required."); return; }
    setSaving(true);
    try {
      const incoming = treasuryForm.type === "cw-war-income" || treasuryForm.type === "guild-income";
      const sign = incoming ? 1 : -1;
      const createdAtNow = new Date();
      const data = { type: treasuryForm.type, direction: incoming ? "in" : "out", amount: sign * amount, description: clean(treasuryForm.description), item: clean(treasuryForm.item), adminComment: clean(treasuryForm.adminComment), transactionAt: createdAtNow, createdAt: serverTimestamp(), createdBy: actor(user), createdByUid: user?.uid || null };
      const ref = await addDoc(collection(db, "treasuryEntries"), data);
      await audit({ category: "TREASURY", module: "cw-treasury", title: incoming ? "TREASURY GOLD RECEIVED" : "TREASURY EXPENSE ADDED", message: `${clean(treasuryForm.description)} recorded for ${incoming ? "+" : "-"}₲ ${money(amount)}.`, entityType: "treasury-entry", entityId: ref.id, details: [`Amount: ${incoming ? "+" : "-"}₲ ${money(amount)}`, `Added: ${formatDateTime(createdAtNow, resolvedTimezone)}`, clean(treasuryForm.item) ? `Item: ${clean(treasuryForm.item)}` : "", `Admin comment: ${clean(treasuryForm.adminComment) || "None"}`, `Recorded by: ${actor(user)}`] });
      setTreasuryModal(null); setMessage("Treasury entry saved and logged.");
    } catch (e) { setMessage(e?.message || "Unable to save treasury entry.") } finally { setSaving(false) }
  }

  async function saveTreasuryEdit() {
    if (!isAdmin || !treasuryEditOriginal) return;
    const original = treasuryEditOriginal;
    const amount = num(treasuryForm.amount);
    const comment = clean(treasuryForm.adminComment);
    const transactionAt = zonedDateTimeInputToUtc(treasuryForm.transactionAt, resolvedTimezone);
    if (!comment) { setMessage("Admin comment is required when editing a treasury entry."); return; }
    if (original.type !== "balance-override" && !transactionAt) { setMessage("Date and time are required."); return; }
    if (amount < 0) { setMessage("Amount cannot be negative. Enter the positive value; the transaction type controls the sign."); return; }
    setSaving(true);
    try {
      const linkedAttendanceId = clean(original.sourceAttendanceId);
      const linkedAttendance = linkedAttendanceId ? attendance.find(r => String(r.id) === linkedAttendanceId) : null;
      const linkedItemAssignmentId = clean(original.sourceItemAssignmentId);
      const linkedItemAssignment = linkedItemAssignmentId ? itemAssignments.find(r => String(r.id) === linkedItemAssignmentId) : null;

      if (linkedItemAssignment && original.type === "item-purchase") {
        const quantity = Math.max(1, Math.floor(num(linkedItemAssignment.quantity, 1)));
        const nextItem = clean(treasuryForm.item) || linkedItemAssignment.itemName;
        const nextDescription = clean(treasuryForm.description);
        const nextTotal = amount;
        const nextUnitCost = quantity ? nextTotal / quantity : nextTotal;
        if (amount === 0) {
          await deleteDoc(doc(db, "cwItemAssignments", linkedItemAssignment.id));
          await deleteDoc(doc(db, "treasuryEntries", original.id));
        } else {
          await updateDoc(doc(db, "cwItemAssignments", linkedItemAssignment.id), { itemName: nextItem, totalCost: nextTotal, unitCost: nextUnitCost, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null, adminComment: comment });
          await updateDoc(doc(db, "treasuryEntries", original.id), { transactionAt, amount: -Math.abs(amount), direction: "out", type: "item-purchase", ledgerType: "item", description: nextDescription || original.description || `CW item handed out — ${linkedItemAssignment.playerName}`, item: nextItem, quantity, unitCost: nextUnitCost, adminComment: comment, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null });
        }
        await updateDoc(doc(db, "cwPlayers", linkedItemAssignment.playerId), { updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }).catch(() => { });
        await audit({ category: "ITEM", module: "cw-item", title: "CW ITEM ASSIGNMENT UPDATED", message: `${linkedItemAssignment.playerName} item assignment was updated from Treasury.`, entityType: "cw-item-assignment", entityId: linkedItemAssignment.id, playerId: linkedItemAssignment.playerId, playerName: linkedItemAssignment.playerName, item: nextItem, details: [`Item: ${nextItem}`, `Quantity: ${quantity}`, `New total cost: ₲ ${money(amount)}`, `Reason: ${comment}`, `Edited by: ${actor(user)}`] });
        setTreasuryEditOriginal(null); setTreasuryModal(null); setMessage("Item assignment and Treasury expense synchronized.");
        return;
      }

      // CW salary/item Treasury rows are controlled by their attendance record.
      // Editing here updates the attendance record AND the linked Treasury row so both views stay synchronized.
      if (linkedAttendance && (original.type === "cw-salary" || original.type === "item-purchase")) {
        const isSalary = original.type === "cw-salary";
        const nextSalary = isSalary ? amount : num(linkedAttendance.salaryGold);
        const nextItemCost = isSalary ? num(linkedAttendance.itemCostGold) : amount;
        const nextItem = isSalary ? clean(linkedAttendance.receivedItem) : clean(treasuryForm.item);
        const nextDescription = clean(treasuryForm.description);
        const attendancePatch = {
          salaryGold: nextSalary,
          itemCostGold: nextItemCost,
          receivedItem: nextItem,
          updatedAt: serverTimestamp(),
          updatedBy: actor(user),
          updatedByUid: user?.uid || null,
          adminComment: comment,
        };
        await updateDoc(doc(db, "cwAttendance", linkedAttendance.id), attendancePatch);
        if (amount === 0) {
          await deleteDoc(doc(db, "treasuryEntries", original.id));
        } else {
          await updateDoc(doc(db, "treasuryEntries", original.id), {
            transactionAt,
            amount: -Math.abs(amount),
            direction: "out",
            type: isSalary ? "cw-salary" : "item-purchase",
            ledgerType: isSalary ? "salary" : "item",
            description: nextDescription || original.description || `${isSalary ? "CW salary" : "CW item handed out"} — ${linkedAttendance.ign}`,
            item: isSalary ? "" : nextItem,
            adminComment: comment,
            updatedAt: serverTimestamp(),
            updatedBy: actor(user),
            updatedByUid: user?.uid || null,
          });
        }
        await updateDoc(doc(db, "cwPlayers", linkedAttendance.playerId), { updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }).catch(() => { });
        await audit({ category: "TREASURY", module: "cw-treasury", title: "LINKED CW TREASURY ENTRY EDITED", message: `${linkedAttendance.ign} ${isSalary ? "salary" : "item cost"} was edited from Treasury and synchronized with CW attendance.`, entityType: "treasury-entry", entityId: original.id, playerId: linkedAttendance.playerId, playerName: linkedAttendance.ign, details: [`Old amount: ₲ ${money(Math.abs(num(original.amount)))}`, `New amount: ₲ ${money(amount)}`, `CW date: ${linkedAttendance.dateKey}`, `Item: ${nextItem || "—"}`, `Reason: ${comment}`, `Edited by: ${actor(user)}`], changes: [{ field: isSalary ? "CW Salary" : "Item Cost", from: `₲ ${money(Math.abs(num(original.amount)))}`, to: `₲ ${money(amount)}` }] });
        setTreasuryEditOriginal(null); setTreasuryModal(null); setMessage("Treasury entry edited and CW attendance synchronized.");
        return;
      }

      // A balance override is a signed delta. Editing it means choosing a new target balance.
      if (original.type === "balance-override") {
        const current = treasuryBalance;
        const baseWithoutOriginal = current - num(original.amount);
        const nextDelta = amount - baseWithoutOriginal;
        await updateDoc(doc(db, "treasuryEntries", original.id), {
          direction: nextDelta >= 0 ? "in" : "out", amount: nextDelta, overrideTarget: amount, balanceBefore: baseWithoutOriginal, balanceAfter: amount, adminComment: comment, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null
        });
        await audit({ category: "TREASURY", module: "cw-treasury", title: "BALANCE OVERRIDE EDITED", message: `Available Guild Gold override was changed to ₲ ${money(amount)}.`, entityType: "treasury-balance-override", entityId: original.id, details: [`Old target: ₲ ${money(original.overrideTarget ?? original.balanceAfter ?? 0)}`, `New target: ₲ ${money(amount)}`, `Reason: ${comment}`, `Edited by: ${actor(user)}`], changes: [{ field: "Override target", from: `₲ ${money(original.overrideTarget ?? original.balanceAfter ?? 0)}`, to: `₲ ${money(amount)}` }] });
        setTreasuryEditOriginal(null); setTreasuryModal(null); setMessage("Balance override edited and logged.");
        return;
      }

      const incoming = treasuryForm.type === "cw-war-income" || treasuryForm.type === "guild-income";
      const sign = incoming ? 1 : -1;
      const next = { type: treasuryForm.type, direction: incoming ? "in" : "out", amount: sign * amount, description: clean(treasuryForm.description), item: clean(treasuryForm.item), adminComment: comment, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null };
      await updateDoc(doc(db, "treasuryEntries", original.id), next);
      await audit({ category: "TREASURY", module: "cw-treasury", title: "TREASURY ENTRY EDITED", message: `Treasury entry ${original.description || original.id} was edited.`, entityType: "treasury-entry", entityId: original.id, details: [`Old amount: ${num(original.amount) >= 0 ? "+" : "-"}₲ ${money(Math.abs(num(original.amount)))}`, `New amount: ${incoming ? "+" : "-"}₲ ${money(amount)}`, `Old description: ${original.description || "—"}`, `New description: ${clean(treasuryForm.description)}`, `Item: ${clean(treasuryForm.item) || "—"}`, `Reason: ${comment}`, `Edited by: ${actor(user)}`], changes: [{ field: "Amount", from: `₲ ${money(Math.abs(num(original.amount)))}`, to: `${incoming ? "+" : "-"}₲ ${money(amount)}` }, { field: "Description", from: original.description || "—", to: clean(treasuryForm.description) }] });
      setTreasuryEditOriginal(null); setTreasuryModal(null); setMessage("Treasury entry edited and logged.");
    } catch (e) { console.error(e); setMessage(e?.message || "Unable to edit treasury entry.") } finally { setSaving(false) }
  }

  function requestDeleteTreasuryEntry(entry) {
    if (!isAdmin) return;
    requireAdminComment("DELETE TREASURY ENTRY", `Delete ${entry.description || "this treasury entry"}? The change will be reflected in Guild Gold and recorded in the audit trail.`, async (comment) => {
      const linkedAttendanceId = clean(entry.sourceAttendanceId);
      const linkedAttendance = linkedAttendanceId ? attendance.find(r => String(r.id) === linkedAttendanceId) : null;
      try {
        const linkedItemAssignment = clean(entry.sourceItemAssignmentId) ? itemAssignments.find(r => String(r.id) === String(entry.sourceItemAssignmentId)) : null;
        if (linkedItemAssignment && entry.type === "item-purchase") {
          await deleteDoc(doc(db, "cwItemAssignments", linkedItemAssignment.id));
          await deleteDoc(doc(db, "treasuryEntries", entry.id));
          await audit({ category: "ITEM", module: "cw-item", title: "CW ITEM ASSIGNMENT DELETED", message: `${linkedItemAssignment.quantity} ${linkedItemAssignment.quantity === 1 ? "pc" : "pcs"} ${linkedItemAssignment.itemName} assigned to ${linkedItemAssignment.playerName} was deleted from Treasury.`, entityType: "cw-item-assignment", entityId: linkedItemAssignment.id, playerId: linkedItemAssignment.playerId, playerName: linkedItemAssignment.playerName, item: linkedItemAssignment.itemName, details: [`Deleted Treasury amount: -₲ ${money(Math.abs(num(entry.amount)))}`, `Item: ${linkedItemAssignment.itemName}`, `Quantity: ${linkedItemAssignment.quantity}`, `Reason: ${comment}`, `Deleted by: ${actor(user)}`] });
          setMessage("Item assignment and linked Treasury expense deleted.");
          return;
        }
        if (entry.type === "inventory-purchase") {
          const linkedStock = inventoryTransactions.filter(tx => String(tx.sourceTreasuryId || "") === String(entry.id));
          const distributed = linkedStock.reduce((sum, tx) => sum + (tx.direction === "out" ? num(tx.quantity) : 0), 0);
          if (distributed > 0) { setMessage("This inventory purchase cannot be deleted because some stock has already been distributed. Reverse the stock distribution first."); return; }
          for (const tx of linkedStock) await deleteDoc(doc(db, "cwInventoryTransactions", tx.id));
          await deleteDoc(doc(db, "treasuryEntries", entry.id));
          await audit({ category: "ITEM", module: "cw-item", title: "INVENTORY PURCHASE DELETED", message: `${entry.description || "Inventory purchase"} was deleted and received stock was removed.`, entityType: "cw-inventory-purchase", entityId: entry.id, details: [`Amount: -₲ ${money(Math.abs(num(entry.amount)))}`, `Reason: ${comment}`] });
          setMessage("Inventory purchase deleted and stock reversed."); return;
        }
        if (linkedAttendance && (entry.type === "cw-salary" || entry.type === "item-purchase")) {
          const isSalary = entry.type === "cw-salary";
          await updateDoc(doc(db, "cwAttendance", linkedAttendance.id), {
            ...(isSalary ? { salaryGold: 0 } : { itemCostGold: 0, receivedItem: "" }),
            updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null, adminComment: comment
          });
          await deleteDoc(doc(db, "treasuryEntries", entry.id));
          await audit({ category: "TREASURY", module: "cw-treasury", title: "LINKED CW TREASURY ENTRY DELETED", message: `${linkedAttendance.ign} ${isSalary ? "salary" : "item cost"} Treasury entry was deleted and the CW attendance record was synchronized.`, entityType: "treasury-entry", entityId: entry.id, playerId: linkedAttendance.playerId, playerName: linkedAttendance.ign, details: [`Deleted amount: -₲ ${money(Math.abs(num(entry.amount)))}`, `CW date: ${linkedAttendance.dateKey}`, `Reason: ${comment}`, `Deleted by: ${actor(user)}`] });
          setMessage("Treasury entry deleted and CW attendance synchronized.");
          return;
        }
        await deleteDoc(doc(db, "treasuryEntries", entry.id));
        await audit({ category: "TREASURY", module: "cw-treasury", title: "TREASURY ENTRY DELETED", message: `${entry.description || "Treasury entry"} was deleted.`, entityType: "treasury-entry", entityId: entry.id, details: [`Deleted amount: ${num(entry.amount) >= 0 ? "+" : "-"}₲ ${money(Math.abs(num(entry.amount)))}`, `Description: ${entry.description || "—"}`, `Reason: ${comment}`, `Deleted by: ${actor(user)}`] });
        setMessage("Treasury entry deleted and logged.");
      } catch (e) { setMessage(e?.message || "Unable to delete treasury entry.") }
    });
  }

  function openTreasuryEdit(entry) {
    if (!isAdmin) return;
    if (entry.type === "inventory-purchase") { setMessage("Inventory purchases are edited from the Inventory Vault so stock and Treasury stay synchronized."); return; }
    const isOverride = entry.type === "balance-override";
    setTreasuryEditOriginal(entry);
    if (isOverride) {
      setTreasuryForm({ type: "balance-override", amount: String(entry.overrideTarget ?? entry.balanceAfter ?? treasuryBalance), description: entry.description || "Available Guild Gold Override", item: "", transactionAt: dateTimeInputValue(entry.transactionAt || entry.createdAt || new Date(), resolvedTimezone), adminComment: "" });
      setTreasuryModal("edit");
      return;
    }
    setTreasuryForm({
      type: (entry.type === "cw-war-income" || entry.type === "guild-income") ? "cw-war-income" : entry.type === "item-purchase" ? "item-purchase" : "expense",
      amount: formatMoneyInput(Math.abs(num(entry.amount))),
      description: entry.description || "",
      item: entry.item || "",
      transactionAt: dateTimeInputValue(entry.transactionAt || entry.createdAt || new Date(), resolvedTimezone),
      adminComment: ""
    });
    setTreasuryModal("edit");
  }

  async function saveTreasuryOverride() {
    if (!isAdmin) return;
    const target = num(treasuryForm.amount);
    const comment = clean(treasuryForm.adminComment);

    if (!comment) { setMessage("A reason is required when overriding Available Guild Gold."); return; }
    const current = treasuryBalance;
    const delta = target - current;
    if (delta === 0) { setMessage("Available Guild Gold is already at that amount."); setTreasuryModal(null); return; }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "treasuryEntries"), {
        type: "balance-override",
        direction: delta >= 0 ? "in" : "out",
        amount: delta,
        description: "Available Guild Gold Override",
        item: "",
        adminComment: comment,
        overrideTarget: target,
        balanceBefore: current,
        balanceAfter: target,
        createdAt: serverTimestamp(),
        createdBy: actor(user),
        createdByUid: user?.uid || null
      });
      await audit({
        category: "TREASURY",
        module: "cw-treasury",
        title: "AVAILABLE GUILD GOLD OVERRIDDEN",
        message: `Available Guild Gold was corrected from ₲ ${money(current)} to ₲ ${money(target)}.`,
        entityType: "treasury-balance-override",
        entityId: ref.id,
        details: [
          `Balance before: ₲ ${money(current)}`,
          `New available balance: ₲ ${money(target)}`,
          `Adjustment recorded: ${delta >= 0 ? "+" : "-"}₲ ${money(Math.abs(delta))}`,
          `Reason: ${comment}`,
          `Overridden by: ${actor(user)}`
        ],
        changes: [{ field: "Available Guild Gold", from: `₲ ${money(current)}`, to: `₲ ${money(target)}` }]
      });
      setTreasuryModal(null);
      setMessage("Available Guild Gold overridden and logged.");
    } catch (e) { setMessage(e?.message || "Unable to override Available Guild Gold.") } finally { setSaving(false) }
  }

  function openScheduleEditor() { setScheduleForm({ days: Array.isArray(schedule.days) && schedule.days.length ? schedule.days : DEFAULT_CW_DAYS, time: schedule.time || "21:00", timezone: PRIMARY_TIMEZONE }); setScheduleModal(true) }
  async function saveSchedule() { if (!user) { setMessage("Sign in to change the Clan War occurrence."); return } if (!scheduleForm.days.length) { setMessage("Select at least one day."); return } setSaving(true); try { const id = schedule.id !== "default" ? schedule.id : "current"; await setDoc(doc(db, "cwSchedules", id), { days: scheduleForm.days.slice().sort((a, b) => a - b), time: scheduleForm.time, timezone: PRIMARY_TIMEZONE, active: true, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }, { merge: true }); await audit({ category: "SCHEDULE", title: "CW SCHEDULE UPDATED", message: `Clan War occurrence changed to ${scheduleForm.days.map(d => CW_DAYS.find(x => x.key === d)?.label).join(", ")} at ${scheduleForm.time} Manila.`, entityType: "cw-schedule", entityId: id, details: [`Days: ${scheduleForm.days.map(d => CW_DAYS.find(x => x.key === d)?.label).join(", ")}`, `Base time: ${scheduleForm.time} ${PRIMARY_TIMEZONE}`, `Changed by: ${actor(user)}`] }); setScheduleModal(false); setMessage("Clan War occurrence updated.") } catch (e) { setMessage(e?.message || "Unable to update schedule.") } finally { setSaving(false) } }
  function toggleDay(day) { setScheduleForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(x => x !== day) : [...f.days, day] })) }

  function openSalaryEditor() {
    const configured = Array.isArray(salarySettings.byClassRole) ? salarySettings.byClassRole : [];
    if (configured.length) {
      setSalaryDraft(configured.map((x, i) => ({ id: x.id || `salary-${i}-${clean(x.className)}-${clean(x.role)}`, className: clean(x.className), role: clean(x.role) || "All Roles", salaryGold: String(num(x.salaryGold, 0) || "") })));
    } else {
      const legacy = Object.entries(salarySettings.byClass || {}).filter(([className]) => clean(className));
      setSalaryDraft(legacy.map(([className, value], i) => ({ id: `legacy-${i}-${className}`, className, role: "All Roles", salaryGold: String(num(value, 0) || "") })));
    }
    setSalaryModal(true);
  }
  function addSalaryProfile() {
    setSalaryDraft(rows => [...rows, { id: `salary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, className: classes[0] || "Swordman", role: roles[0] || DEFAULT_ROLES[0], salaryGold: "" }]);
  }
  function updateSalaryProfile(id, field, value) {
    setSalaryDraft(rows => rows.map(row => row.id === id ? { ...row, [field]: field === "salaryGold" ? formatMoneyInput(value) : value } : row));
  }
  function deleteSalaryProfile(id) {
    setSalaryDraft(rows => rows.filter(row => row.id !== id));
  }
  async function saveSalaries() {
    if (!isAdmin) return;
    const rows = salaryDraft.map(row => ({ id: clean(row.id), className: clean(row.className), role: clean(row.role), salaryGold: num(row.salaryGold, 0) })).filter(row => row.className && row.role);
    const seen = new Set();
    for (const row of rows) {
      const key = `${row.className.toLowerCase()}|||${row.role.toLowerCase()}`;
      if (seen.has(key)) { setMessage(`Duplicate salary classification: ${row.className} • ${row.role}.`); return; }
      seen.add(key);
    }
    setSaving(true);
    try {
      const old = Array.isArray(salarySettings.byClassRole) ? salarySettings.byClassRole : [];
      const changes = [];
      const oldMap = new Map(old.map(x => [`${clean(x.className).toLowerCase()}|||${clean(x.role).toLowerCase()}`, x]));
      rows.forEach(row => {
        const key = `${row.className.toLowerCase()}|||${row.role.toLowerCase()}`;
        const before = oldMap.get(key);
        if (!before || num(before.salaryGold) !== row.salaryGold) changes.push({ field: `${row.className} • ${row.role}`, from: `₲ ${money(before?.salaryGold)}`, to: `₲ ${money(row.salaryGold)}` });
      });
      old.forEach(row => {
        const key = `${clean(row.className).toLowerCase()}|||${clean(row.role).toLowerCase()}`;
        if (!seen.has(key)) changes.push({ field: `${clean(row.className)} • ${clean(row.role)}`, from: `₲ ${money(row.salaryGold)}`, to: "REMOVED" });
      });
      const nextByClass = { ...(salarySettings.byClass || {}) };
      rows.filter(r => r.role.toLowerCase() === "all roles").forEach(r => { nextByClass[r.className] = r.salaryGold; });
      await setDoc(doc(db, "cwSettings", "current"), { salaryByClass: nextByClass, salaryByClassRole: rows, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }, { merge: true });
      if (changes.length) await audit({ category: "SALARY", title: "CW SALARY CLASSIFICATION UPDATED", message: "Clan War salary classifications were added, edited or removed by an administrator.", entityType: "cw-salary-settings", changes, details: ["Each salary is classified by both player class and Clan War role.", "A player receives the exact Class + Role rate first, then an All Roles rate, then the legacy class rate if configured.", `Updated by: ${actor(user)}`] });
      setSalaryModal(false);
      setMessage("CW class + role salary classifications saved.");
    } catch (e) { setMessage(e?.message || "Unable to save salary classifications."); } finally { setSaving(false); }
  }

  function openAllNotifications() {
    setActivePanel("notices");
    setNoticeMode("all");
    setAllNoticePage(1);
    setTimeout(() => document.getElementById("cw-notification-board")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function selectOccurrence(occ) { setSelectedOccurrence(occ); setActivePanel("players"); setTimeout(() => document.getElementById("cw-attendance-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50) }
  function statsFor(p) {
    const rows = attendance.filter(r => String(r.playerId) === String(p.id));
    const assigned = itemAssignments.filter(r => String(r.playerId) === String(p.id));
    const sorted = rows.slice().sort((a, b) => (safeDate(b.updatedAt || b.createdAt)?.getTime() || 0) - (safeDate(a.updatedAt || a.createdAt)?.getTime() || 0));
    const itemRows = assigned.slice().sort((a, b) => (safeDate(b.updatedAt || b.createdAt || b.transactionAt)?.getTime() || 0) - (safeDate(a.updatedAt || a.createdAt || a.transactionAt)?.getTime() || 0));
    const legacyCount = rows.reduce((sum, r) => sum + (clean(r.receivedItem) ? Math.max(1, num(r.itemQuantity, 1)) : 0), 0);
    const assignedCount = assigned.reduce((sum, r) => sum + Math.max(0, Math.floor(num(r.quantity, 0))), 0);
    const lastAssigned = itemRows[0];
    const lastLegacy = sorted.find(r => clean(r.receivedItem));
    const lastItem = lastAssigned ? `${lastAssigned.itemName || lastAssigned.item || "Item"}${num(lastAssigned.quantity, 1) > 1 ? ` × ${num(lastAssigned.quantity, 1)}` : ""}` : lastLegacy?.receivedItem || "—";
    const latestActivity = [sorted[0]?.updatedAt || sorted[0]?.createdAt, lastAssigned?.updatedAt || lastAssigned?.createdAt || lastAssigned?.transactionAt, p.updatedAt || p.createdAt].map(safeDate).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0];
    return { days: rows.length, salary: rows.reduce((sum, r) => sum + num(r.salaryGold), 0), latestSalary: sorted[0]?.salaryGold || 0, items: legacyCount + assignedCount, lastItem, lastUpdated: latestActivity || p.updatedAt || p.createdAt, lastBy: lastAssigned?.updatedBy || lastAssigned?.createdBy || p.updatedBy || sorted[0]?.updatedBy || sorted[0]?.createdBy || p.createdBy || "System" };
  }

  return <div className="cw-page">
    <section className="cw-hero">
      <div>
        <div className="cw-kicker">RAN ONLINE EP7 CLASSIC • CLAN WAR</div>
        <h1>CW Attendance</h1>
        <p>Track Clan War participation, class salaries, items handed out and the connected audit trail that feeds Guild Treasury.</p>
      </div>
      <div className="cw-hero-side">
        <span className="cw-live-dot">● LIVE</span>
        <div className="cw-updated">{loading ? "SYNCING..." : "REALTIME FIREBASE"}</div>
        <div className="cw-timezone-label">DISPLAYING IN {resolvedTimezone}</div>
      </div>
    </section>

    {message && <div className="cw-message">{message}<button onClick={() => setMessage("")}>×</button></div>}

    <nav className="cw-tabs cw-primary-nav" aria-label="Clan War sections">
      <button type="button" className={`cw-tab ${activePanel === "attendance" ? "active" : ""}`} onClick={() => { setActivePanel("attendance") }} aria-selected={activePanel === "attendance"}>
        <span className="cw-tab-icon cw-tab-icon-schedule" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9h17M7 13h3M14 13h3M7 16.5h3" /></svg></span>
        <span className="cw-tab-copy"><strong>CW ATTENDANCE</strong><small>View CW occurrences</small></span>
      </button>
      <button type="button" className={`cw-tab ${activePanel === "players" ? "active" : ""}`} onClick={() => { setActivePanel("players") }} aria-selected={activePanel === "players"}>
        <span className="cw-tab-icon cw-tab-icon-players" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6" /><path d="M15 6.5a3 3 0 0 1 0 5.8M16 14c2.6.3 4.1 2.1 4.5 5.5" /></svg></span>
        <span className="cw-tab-copy"><strong>PLAYERS &amp; HISTORY</strong><small>Roster &amp; attendance</small></span>
      </button>
      <button type="button" className={`cw-tab ${activePanel === "treasury" ? "active" : ""}`} onClick={() => { setActivePanel("treasury") }} aria-selected={activePanel === "treasury"}>
        <span className="cw-tab-icon cw-tab-icon-treasury" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h16v11H4z" /><path d="M3 8h18M6 5h12l2 3H4zM12 8v11" /></svg></span>
        <span className="cw-tab-copy"><strong>TREASURY</strong><small>Claims &amp; ledger</small></span>
      </button>
      <button type="button" className={`cw-tab ${activePanel === "notices" ? "active" : ""}`} onClick={() => { setActivePanel("notices") }} aria-selected={activePanel === "notices"}>
        <span className="cw-tab-icon cw-tab-icon-notices" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" /><path d="M10 21h4" /></svg></span>
        <span className="cw-tab-copy"><strong>ACTIVITY &amp; NOTIFICATIONS</strong><small>CW audit feed</small></span>
      </button>
    </nav>

    {activePanel === "attendance" && <>
      <section className="cw-date-window">
        <div className="cw-date-window-copy"><div className="cw-kicker">LOCAL CALENDAR WINDOW</div><h2>Browse Clan War Occurrences</h2><p>Today is always pinned first. Choose how far back and forward you want to browse.</p></div>
        <div className="cw-date-window-controls">
          <label><span>BACK</span><select value={backDays} onChange={e => { setBackDays(num(e.target.value)); setSelectedOccurrence(null) }}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i} {i === 1 ? "DAY" : "DAYS"} BACK</option>)}</select></label>
          <button className={backDays === 0 ? "active" : ""} onClick={() => { setBackDays(0); setSelectedOccurrence(null) }}>CURRENT / TODAY</button>
          <label><span>FORWARD</span><select value={forwardDays} onChange={e => { setForwardDays(num(e.target.value)); setSelectedOccurrence(null) }}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i} {i === 1 ? "DAY" : "DAYS"} FORWARD</option>)}</select></label>
        </div>
      </section>

      <section className="cw-schedule-panel">
        <div className="cw-section-head">
          <div><div className="cw-kicker">CLAN WAR OCCURRENCE</div><h2>Schedule</h2><p>Base schedule: {schedule.time} Asia/Manila • {schedule.days?.map(d => CW_DAYS.find(x => x.key === d)?.label).join(" • ")}</p></div>
          <button className="cw-btn cw-btn-primary" onClick={openScheduleEditor}>EDIT OCCURRENCE</button>
        </div>
        <div className="cw-occurrence-grid">{windowOccurrences.map(occ => {
          const attended = attendance.filter(r => clean(r.dateKey) === occ.key).length; return <button key={`${occ.key}-${occ.time}`} className={`cw-occurrence-card ${occ.key === todayKey ? "today" : ""}`} onClick={() => selectOccurrence(occ)}>
            <div className="cw-war-art"><img className="cw-war-artwork" src={guildWarArtwork} alt="Guild War — Sacred Gate, Phoenix, Mystical Peaks" /><span className="cw-war-logo"><img src={cwWarIcon} alt="Clan War" /></span><span className="cw-war-badge">CLAN WAR</span><div className="cw-war-lines" /></div>
            <div className="cw-occ-body"><div className="cw-occ-date">{formatDate(occ.at, resolvedTimezone)}</div><strong>{formatTime(occ.at, resolvedTimezone)}</strong><span>{occ.key === todayKey ? "TODAY" : new Intl.DateTimeFormat("en-US", { timeZone: resolvedTimezone, weekday: "long" }).format(occ.at)}</span><div className="cw-occ-foot"><b>{attended} ATTENDED</b><em>{countdownLabel(occ.at, now)}</em></div></div>
          </button>
        })}</div>
      </section>
    </>}

    {activePanel === "players" && <>
      <section className="cw-panel cw-players-history-panel" id="cw-attendance-panel">
        <div className="cw-section-head">
          <div>
            <div className="cw-kicker">CW ROSTER</div>
            <h2>Players & History</h2>
            <p>Use HISTORY for the player's complete CW activity. Daily clock-in: <b>{todayOccurrence ? formatDateTime(todayOccurrence.at, resolvedTimezone) : "No CW today"}</b></p>
          </div>
          <div className="cw-header-actions">
            {isAdmin && <button className="cw-btn" onClick={openSalaryEditor}>SALARY BY CLASS</button>}
            {isAdmin && <button className="cw-btn cw-btn-primary" onClick={openAddPlayer}>＋ ADD NEW PLAYER</button>}
          </div>
        </div>
        <div className="cw-filter-row">
          <input value={playerSearch} onChange={e => { setPlayerSearch(e.target.value); setPlayerPage(1) }} placeholder="Search IGN, class or role..." />
          <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPlayerPage(1) }}><option value="all">ALL CLASSES</option>{classes.map(c => <option key={c}>{c}</option>)}</select>
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPlayerPage(1) }}><option value="all">ALL ROLES</option>{roles.map(r => <option key={r}>{r}</option>)}</select>
        </div>
        <div className="cw-table-scroll">
          <table className="cw-table cw-player-table">
            <thead><tr><th>PLAYER</th><th>CLASS</th><th>ROLE</th><th>CW DAYS</th><th>LATEST SALARY</th><th>LIFETIME SALARY</th><th>ITEMS</th><th>LAST ITEM</th><th>LAST UPDATED / BY</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {visiblePlayers.map(p => {
                const s = statsFor(p);
                const attended = attendance.some(r => String(r.playerId) === String(p.id) && clean(r.dateKey) === todayKey);
                return <tr key={p.id}>
                  <td><strong>{p.ign}</strong><small className={p.active === false ? "cw-player-disabled" : "cw-player-online"}>{p.active === false ? "DISABLED" : "ACTIVE"}</small></td>
                  <td><span className="cw-class"><ClassEmblem name={p.className || p.class} small />{p.className || p.class}</span></td>
                  <td><span className="cw-role">{p.role || "—"}</span></td>
                  <td>{s.days}</td>
                  <td className="cw-gold">₲ {money(s.latestSalary)}</td>
                  <td className="cw-gold">₲ {money(s.salary)}</td>
                  <td>{s.items}</td>
                  <td title={s.lastItem}>{s.lastItem}</td>
                  <td>{formatDateTime(s.lastUpdated, resolvedTimezone)}<small>{s.lastBy}</small></td>
                  <td className="cw-player-actions">
                    {isAdmin && <button className={`cw-btn cw-btn-small ${attended ? "cw-btn-recorded" : ""}`} disabled={!todayOccurrence || p.active === false} onClick={() => openAttendance(p, todayOccurrence)}>{p.active === false ? "DISABLED" : attended ? `✓ ATTENDED • ${formatDateTime(todayOccurrence.at, resolvedTimezone)}` : todayOccurrence ? `MARK CW • ${formatDateTime(todayOccurrence.at, resolvedTimezone)}` : "NO CW TODAY"}</button>}
                    <button className="cw-btn cw-btn-small" onClick={() => { setPlayerHistoryTab("all"); setPlayerHistorySearch(""); setPlayerHistoryPage(1); setSelectedPlayer(p) }}>HISTORY</button>
                    {isAdmin && <button className="cw-btn cw-btn-small cw-btn-item" onClick={() => openItemAssignment(p)}>＋ ITEM</button>}
                    {isAdmin && <button className="cw-btn cw-btn-small" onClick={() => openEditPlayer(p)}>EDIT PROFILE</button>}
                    {isAdmin && <button className="cw-btn cw-btn-small" onClick={() => requestTogglePlayer(p)}>{p.active === false ? "ENABLE" : "DISABLE"}</button>}
                    {isAdmin && <button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => deletePlayer(p)}>DELETE</button>}
                  </td>
                </tr>;
              })}
              {!visiblePlayers.length && <tr><td colSpan="10" className="cw-empty">No players match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="cw-pagination"><button disabled={playerPage <= 1} onClick={() => setPlayerPage(p => p - 1)}>‹</button><span>PAGE {playerPage} OF {playerPageCount} • 10 PLAYERS PER PAGE</span><button disabled={playerPage >= playerPageCount} onClick={() => setPlayerPage(p => p + 1)}>›</button></div>
      </section>
    </>}



    {activePanel === "treasury" && <section className="cw-panel cw-treasury-panel">
      <div className="cw-section-head"><div><div className="cw-kicker">CONNECTED GUILD FINANCE</div><h2>Guild Treasury</h2><p><strong>Available Guild Gold</strong> is the current balance from all signed Treasury activity. CW War receipts add funds; CW salaries, item costs and expenses use funds. If the real vault differs, use <strong>OVERRIDE AVAILABLE GOLD</strong> to record the correction without erasing history.</p></div></div>
      {isAdmin && <div className="cw-finance-hub">
        <div className="cw-finance-hub-row">
          <div className="cw-finance-hub-group cw-hub-receive"><div className="cw-finance-hub-label"><span>CLAN WAR GOLD &amp; REWARDS</span><small>Gold winnings and free Clan War rewards enter the guild</small></div><div className="cw-receive-segment"><button className="cw-btn cw-hub-rewards" onClick={openClanWarRewards}>＋ CLAN WAR GOLD &amp; REWARDS</button></div></div>
          <div className="cw-finance-hub-group cw-hub-spend"><div className="cw-finance-hub-label"><span>CLAN WAR SPENDING &amp; SUPPLIES</span><small>Gold spent is deducted and purchased stock is added to the Inventory Vault</small></div><button className="cw-btn cw-hub-spending" onClick={openCwSpending}>− CLAN WAR SPENDING &amp; SUPPLIES</button></div>
        </div>
        <div className="cw-finance-hub-row cw-finance-hub-row-bottom">
          <div className="cw-finance-hub-group cw-hub-distribute"><div className="cw-finance-hub-label"><span>DISTRIBUTE FROM STOCK</span><small>Choose a player and an item from available Vault stock</small></div><button className="cw-btn cw-btn-primary cw-hub-assign" onClick={openAssignmentFromHub}>＋ ASSIGN ITEM TO PLAYER</button></div>
          <div className="cw-finance-hub-group cw-hub-manage"><div className="cw-finance-hub-label"><span>GUILD BALANCE</span><small>Corrections are permanently logged</small></div><button className="cw-btn" onClick={() => { setTreasuryForm({ type: "override", amount: formatMoneyInput(treasuryBalance), description: "", item: "", transactionAt: "", adminComment: "" }); setTreasuryModal("override") }}>OVERRIDE AVAILABLE GOLD</button></div>
        </div>
      </div>}
      <div className="cw-treasury-equation"><span>ALL SIGNED LEDGER ENTRIES</span><b>Σ ₲ {money(treasuryBalance)}</b><i>=</i><span>AVAILABLE GUILD GOLD</span><b className={treasuryBalance < 0 ? "cw-equation-negative" : "cw-equation-balance"}>₲ {money(treasuryBalance)}</b><span className="cw-equation-note">Overrides are recorded as balance-correction entries and never erase history.</span></div>
      <div className="cw-treasury-stats">
        <div className={`cw-treasury-stat cw-balance-stat ${treasuryBalance < 0 ? "is-negative" : "is-positive"}`}><small>AVAILABLE GUILD GOLD</small><strong>₲ {money(treasuryBalance)}</strong><em>{treasuryBalance < 0 ? "OVERDRAWN — FUNDS BELOW ZERO" : "CURRENT GUILD FUNDS"}</em></div>
        <div className="cw-treasury-stat cw-income-stat"><small>RECEIVED FROM CW WAR</small><strong>₲ {money(treasuryIncome)}</strong><em>{latestTreasuryIncome ? `LAST RECEIVED • ${formatDateTime(latestTreasuryIncome.transactionAt || latestTreasuryIncome.createdAt, resolvedTimezone)}` : "NO CW WAR RECEIPTS YET"}</em></div>
        <div className="cw-treasury-stat cw-salary-stat"><small>CW SALARY PAID</small><strong>₲ {money(treasurySalaryOut)}</strong><em>FUNDS PAID TO CW PLAYERS</em></div>
        <div className="cw-treasury-stat cw-item-cost-stat"><small>ITEM COSTS / FUNDS USED</small><strong>₲ {money(treasuryItemOut)}</strong><em>FUNDS SPENT ON ITEMS HANDED OUT</em></div>

      </div>
      <section className="cw-guild-inventory-card">
        <div className="cw-guild-inventory-copy"><div className="cw-kicker">CONNECTED INVENTORY</div><h3>Guild Inventory</h3><p>Live physical stock available for future player assignments. Rewards and purchases add stock; assignments reduce it.</p></div>
        <div className="cw-guild-inventory-stats"><div><strong>{cwItems.filter(i => stockForItem(i.id).received > 0).length}</strong><span>ITEM TYPES</span></div><div><strong>{cwItems.reduce((n, i) => n + stockForItem(i.id).available, 0)}</strong><span>AVAILABLE PCS</span></div><div><strong>{cwItems.filter(i => { const st = stockForItem(i.id); return st.received > 0 && st.available > 0 && st.available <= st.threshold }).length}</strong><span>LOW STOCK</span></div></div>
        <button className="cw-btn cw-btn-primary cw-guild-inventory-view" onClick={openGuildInventory}>VIEW GUILD INVENTORY</button>
      </section>
      <div className="cw-treasury-filter-row">
        <input value={treasurySearch} onChange={e => setTreasurySearch(e.target.value)} placeholder="Search description, player, item, admin..." />
        <select value={treasuryCategoryFilter} onChange={e => setTreasuryCategoryFilter(e.target.value)}><option value="all">ALL CATEGORIES</option><option value="TREASURY">TREASURY</option><option value="INCOME">INCOME</option><option value="EXPENSE">EXPENSE</option><option value="SALARY">SALARY</option><option value="ITEM">ITEM</option></select>
        <input type="date" value={treasuryDateFilter} onChange={e => setTreasuryDateFilter(e.target.value)} title="Filter exact date" />
        <input type="date" value={treasuryFrom} onChange={e => setTreasuryFrom(e.target.value)} title="Filter from date" />
        <input type="date" value={treasuryTo} onChange={e => setTreasuryTo(e.target.value)} title="Filter to date" />
        <button className="cw-btn cw-btn-small" onClick={() => { setTreasurySearch(""); setTreasuryCategoryFilter("all"); setTreasuryDateFilter(""); setTreasuryFrom(""); setTreasuryTo(""); }}>CLEAR</button>
      </div>
      <div className="cw-unified-results-head"><div><strong>{filteredTreasuryEntries.length}</strong> ledger entries found</div><div>Showing {filteredTreasuryEntries.length} of {treasuryEntries.length}</div></div>
      <div className="cw-table-scroll"><table className="cw-table cw-treasury-table"><thead><tr><th>DATE & TIME</th><th>CATEGORY / TYPE</th><th>DESCRIPTION</th><th>ITEM</th><th>AMOUNT</th><th>RECORDED / UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>{filteredTreasuryEntries.map(e => {
        const linked = Boolean(e.sourceAttendanceId || e.sourceItemAssignmentId);
        const typeLabel = treasuryTypeLabel(e);
        return <tr key={e.id}>
          <td><strong>{formatDateTime(e.createdAt || e.transactionAt || e.updatedAt, resolvedTimezone)}</strong><small>Added</small></td>
          <td><span className={`cw-ledger-type ${num(e.amount) >= 0 ? "is-in" : "is-out"}`}>{typeLabel}</span></td>
          <td><strong>{e.description || "—"}</strong>{e.playerName && <small>Player: {e.playerName}</small>}{e.adminComment && <small>Reason: {e.adminComment}</small>}{e.balanceBefore !== undefined && <small>₲ {money(e.balanceBefore)} → ₲ {money(e.balanceAfter)}</small>}</td>
          <td>{e.item || "—"}</td>
          <td className={num(e.amount) >= 0 ? "cw-in" : "cw-out"}>{num(e.amount) >= 0 ? "+" : "-"}₲ {money(Math.abs(num(e.amount)))}</td>
          <td><strong>{e.updatedBy || e.createdBy || "System"}</strong><small>{e.updatedAt ? `Updated • ${formatDateTime(e.updatedAt, resolvedTimezone)}` : (e.createdAt ? `Added • ${formatDateTime(e.createdAt, resolvedTimezone)}` : "")}</small></td>
          <td className="cw-history-actions">{isAdmin && <><button className="cw-btn cw-btn-small" onClick={() => openTreasuryEdit(e)}>EDIT</button><button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => requestDeleteTreasuryEntry(e)}>DELETE</button></>}</td>
        </tr>;
      })}{!treasuryEntries.length && <tr><td colSpan="7" className="cw-empty">No treasury ledger entries yet.</td></tr>}</tbody></table></div>
    </section>}



    {activePanel === "notices" && <section className="cw-panel cw-unified-notifications-panel" id="cw-notification-board">
      <div className="cw-notification-board-head">
        <div><div className="cw-kicker">GUILD CLAN WAR NOTIFICATIONS</div><h2>CW Activity &amp; Notifications</h2><p>Track every Clan War activity in one unified audit feed. NEW is based on the current local calendar day.</p></div>
        <div className="cw-notification-counts"><div><strong>{newCount}</strong><span>NEW TODAY</span></div><div><strong>{oldCount}</strong><span>OLD</span></div><button className="cw-btn" type="button" onClick={() => { setNoticeSearch(""); setNoticeCategoryFilter("all"); setNoticeAdminFilter("all"); setNoticeTimeFilter("all"); setNoticeDateFilter(""); setNoticeFrom(""); setNoticeTo(""); setAllNoticePage(1) }}>↻ REFRESH</button></div>
      </div>

      <div className="cw-unified-notice-toolbar">
        <input className="notice-search" value={noticeSearch} onChange={e => { setNoticeSearch(e.target.value); setAllNoticePage(1) }} placeholder="Search player, action, salary, item..." />
        <select value={noticeCategoryFilter} onChange={e => { setNoticeCategoryFilter(e.target.value); setAllNoticePage(1) }} aria-label="Filter CW notifications by type">
          <option value="all">ALL TYPES</option>
          <option value="ATTENDANCE">ATTENDANCE</option>
          <option value="SALARY">SALARY</option>
          <option value="ITEM">ITEM</option>
          <option value="PLAYER">PLAYER</option>
          <option value="SCHEDULE">SCHEDULE</option>
          <option value="ADMIN">ADMIN</option>
          <option value="TREASURY">TREASURY</option>
          <option value="SYSTEM">SYSTEM</option>
        </select>
        <select value={noticeAdminFilter} onChange={e => { setNoticeAdminFilter(e.target.value); setAllNoticePage(1) }} aria-label="Filter CW notifications by admin">
          <option value="all">ALL ADMINS</option>
          {noticeAdmins.map(admin => <option key={admin} value={admin}>{admin}</option>)}
        </select>
        <select value={noticeTimeFilter} onChange={e => { setNoticeTimeFilter(e.target.value); setAllNoticePage(1) }} aria-label="Filter CW notifications by time">
          <option value="all">ALL TIME</option>
          <option value="24h">LAST 24 HOURS</option>
          <option value="7d">LAST 7 DAYS</option>
          <option value="30d">LAST 30 DAYS</option>
        </select>
        <label className="cw-notice-date-field"><span>DATE</span><input className="notice-date" type="date" value={noticeDateFilter} onChange={e => { setNoticeDateFilter(e.target.value); setAllNoticePage(1) }} title="Filter exact local date" aria-label="Filter exact date" /></label>
        <label className="cw-notice-date-field"><span>FROM</span><input className="notice-date" type="date" value={noticeFrom} onChange={e => { setNoticeFrom(e.target.value); setAllNoticePage(1) }} title="Filter from local date" aria-label="Filter from date" /></label>
        <label className="cw-notice-date-field"><span>TO</span><input className="notice-date" type="date" value={noticeTo} onChange={e => { setNoticeTo(e.target.value); setAllNoticePage(1) }} title="Filter to local date" aria-label="Filter to date" /></label>
        <button className="cw-btn cw-btn-small notice-clear" type="button" onClick={() => { setNoticeSearch(""); setNoticeCategoryFilter("all"); setNoticeAdminFilter("all"); setNoticeTimeFilter("all"); setNoticeDateFilter(""); setNoticeFrom(""); setNoticeTo(""); setAllNoticePage(1); }}>CLEAR</button>
      </div>

      <div className="cw-unified-results-head"><div><strong>{matchingNotices.length}</strong> notifications found <span>•</span> <b>{newCount}</b> new today</div><div>Showing {matchingNotices.length ? `${(safeAllNoticePage - 1) * PAGE_SIZE + 1}-${Math.min(safeAllNoticePage * PAGE_SIZE, matchingNotices.length)}` : "0"} of {matchingNotices.length}</div></div>

      <div className="cw-unified-notice-table-wrap">
        <table className="cw-unified-notice-table">
          <colgroup><col className="c-num" /><col className="c-status" /><col className="c-icon" /><col className="c-category" /><col className="c-message" /><col className="c-time" /><col className="c-by" /><col className="c-open" /></colgroup>
          <thead><tr><th>#</th><th>STATUS</th><th>ICON</th><th>CATEGORY</th><th>MESSAGE</th><th>TIME</th><th>BY</th><th aria-label="Open"></th></tr></thead>
          <tbody>
            {visibleAllNotices.map((notice, index) => {
              const category = inferNoticeCategory(notice); const isNew = dateKey(notice.createdAt || notice.timestamp, resolvedTimezone) === noticeDateKey; return <tr key={notice.id} className={`cw-unified-notice-row category-${category.toLowerCase()}`} onClick={() => setAuditDetail(notice)} title="Click to view full notification details">
                <td className="notice-number">{(safeAllNoticePage - 1) * PAGE_SIZE + index + 1}</td>
                <td><span className={`cw-notice-status ${isNew ? "new" : "old"}`}>{isNew ? "NEW" : "OLD"}</span></td>
                <td><span className={`cw-unified-icon category-${category.toLowerCase()}`}>{noticeIcon(category)}</span></td>
                <td><span className={`cw-notice-category-badge cw-notice-category-${category.toLowerCase()}`}>{category}</span></td>
                <td><div className="cw-unified-message"><strong>{clean(notice.title) || "CW Activity"}</strong><span>{clean(notice.message) || "Record changed."}</span></div></td>
                <td className="notice-time">{formatDateTime(notice.createdAt || notice.timestamp, resolvedTimezone)}</td>
                <td className="notice-by">{clean(notice.createdBy) || "System"}</td>
                <td className="notice-open">›</td>
              </tr>
            })}
            {!visibleAllNotices.length && <tr><td colSpan="8" className="cw-unified-empty">No CW notifications match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="cw-unified-pagination">
        <button disabled={safeAllNoticePage <= 1} onClick={() => setAllNoticePage(1)}>«</button>
        <button disabled={safeAllNoticePage <= 1} onClick={() => setAllNoticePage(p => Math.max(1, p - 1))}>‹</button>
        {Array.from({ length: Math.min(5, allNoticePageCount) }, (_, i) => { const page = allNoticePageCount <= 5 ? i + 1 : Math.max(1, Math.min(allNoticePageCount - 4, safeAllNoticePage - 2)) + i; return <button key={page} className={safeAllNoticePage === page ? "active" : ""} onClick={() => setAllNoticePage(page)}>{page}</button> })}
        <button disabled={safeAllNoticePage >= allNoticePageCount} onClick={() => setAllNoticePage(p => Math.min(allNoticePageCount, p + 1))}>›</button>
        <button disabled={safeAllNoticePage >= allNoticePageCount} onClick={() => setAllNoticePage(allNoticePageCount)}>»</button>
      </div>
    </section>}
    {playerModal && <Modal title={playerModal.mode === "edit" ? `EDIT PLAYER • ${playerModal.player?.ign || ""}` : "ADD NEW PLAYER"} onClose={() => setPlayerModal(null)}>
      <div className="cw-player-form-head">
        <div className="cw-kicker">CW ROSTER PROFILE</div>
        <p>{playerModal.mode === "edit" ? "Update the player's IGN, class or Clan War role. Profile changes are recorded in the Guild Notice Board." : "Register a new player for Clan War attendance, salary and item tracking."}</p>
      </div>
      <div className="cw-form-grid cw-player-form-grid">
        <label>PLAYER IGN<input autoFocus value={playerForm.ign} onChange={e => setPlayerForm({ ...playerForm, ign: e.target.value })} placeholder="Enter in-game name" onKeyDown={e => { if (e.key === "Enter") savePlayer() }} /></label>
        <label>CLASS<select value={playerForm.className} onChange={e => setPlayerForm({ ...playerForm, className: e.target.value })}>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>ROLE<select value={playerForm.role} onChange={e => setPlayerForm({ ...playerForm, role: e.target.value })}>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
      </div>
      <div className="cw-helper"><b>Player profile:</b> class and role determine the default salary and roster display. Attendance history is never deleted when a player profile is removed.</div>
      <div className="cw-modal-actions">
        <button className="cw-btn" onClick={() => setPlayerModal(null)}>CANCEL</button>
        <button className="cw-btn cw-btn-primary" disabled={saving || !isAdmin} onClick={savePlayer}>{saving ? "SAVING..." : playerModal.mode === "edit" ? "SAVE PLAYER CHANGES" : "ADD PLAYER"}</button>
      </div>
    </Modal>}

    {attendanceModal && <Modal title={`${attendanceModal.mode === "override" ? "OVERRIDE" : "EDIT CW ATTENDANCE"} • ${attendanceModal.player.ign}`} wide onClose={() => setAttendanceModal(null)}><div className="cw-attendance-summary"><strong>{formatDateTime(attendanceModal.occurrence.at, resolvedTimezone)}</strong><span>{attendanceModal.player.className || attendanceModal.player.class} • {attendanceModal.player.role} • Base: {attendanceModal.occurrence.time} {baseTz}</span></div><div className="cw-form-grid"><label>CW CLASS SALARY<input inputMode="decimal" value={attendanceForm.salaryGold} onChange={e => setAttendanceForm({ ...attendanceForm, salaryGold: formatMoneyInput(e.target.value) })} placeholder="0" /><small className="cw-field-help">Default comes from {attendanceModal.player.className || attendanceModal.player.class} salary. Admin can adjust this record.</small></label><label>ITEM COST / GOLD HANDED OUT<input inputMode="decimal" value={attendanceForm.itemCostGold} onChange={e => setAttendanceForm({ ...attendanceForm, itemCostGold: formatMoneyInput(e.target.value) })} placeholder="0" /></label><label className="cw-span-2">WHAT DID THEY RECEIVE?<textarea value={attendanceForm.receivedItem} onChange={e => setAttendanceForm({ ...attendanceForm, receivedItem: e.target.value })} placeholder="Example: PUM BOX • Crazytime Box • Guild consumables" /></label><label className="cw-span-2">NOTES<textarea value={attendanceForm.notes} onChange={e => setAttendanceForm({ ...attendanceForm, notes: e.target.value })} placeholder="Example: Weekly Clan War salary and item distribution." /></label>{attendanceModal.existing && <label className="cw-span-2">ADMIN COMMENT *<textarea value={attendanceForm.adminComment} onChange={e => setAttendanceForm({ ...attendanceForm, adminComment: e.target.value })} placeholder={attendanceModal.mode === "override" ? "Required. Explain what is being overridden and why..." : "Required. Explain why this attendance record is being edited..."} /></label>}</div><div className="cw-helper"><b>How to record:</b> put the salary paid for this CW in the salary field. If an item was handed out, enter its name and its gold cost. Treasury automatically receives the matching minus entries so the Guild Gold Vault stays connected.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setAttendanceModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveAttendance}>{saving ? "SAVING..." : attendanceModal.mode === "override" ? "SAVE OVERRIDE" : attendanceModal.existing ? "SAVE EDIT" : "SAVE CW ATTENDANCE"}</button></div></Modal>}

    {itemModal?.mode === "inventory" && <Modal title="GUILD INVENTORY" wide onClose={() => setItemModal(null)}>
      <div className="cw-section-head"><div><div className="cw-kicker">LIVE GUILD STOCK</div><h2>Guild Inventory</h2><p>Current stock by category, item, cost and quantity. This view updates from the live inventory ledger.</p></div><button className="cw-btn" onClick={() => setItemModal({ mode: "catalog" })}>MANAGE ITEMS</button></div>
      <div className="cw-table-scroll"><table className="cw-table cw-guild-inventory-table"><thead><tr><th>CATEGORY</th><th>ITEM</th><th>UNIT COST</th><th>RECEIVED</th><th>DISTRIBUTED</th><th>AVAILABLE</th><th>STATUS</th></tr></thead><tbody>{cwItems.slice().sort((a, b) => clean(a.name).localeCompare(clean(b.name))).map(item => { const st = stockForItem(item.id); const status = st.received <= 0 || st.available <= 0 ? "OUT" : st.available <= st.threshold ? "LOW" : "IN STOCK"; return <tr key={item.id}><td>{item.category || "Clan War"}</td><td><strong>{item.name}</strong><small>{item.description || "—"}</small></td><td className="cw-gold">₲ {money(item.unitCost)}</td><td>{st.received}</td><td>{st.distributed}</td><td><strong className={status === "OUT" ? "cw-out" : status === "LOW" ? "cw-low" : "cw-in"}>{st.available}</strong></td><td><span className={`cw-ledger-type ${status === "OUT" ? "is-out" : status === "LOW" ? "is-low" : "is-in"}`}>{status}</span></td></tr> })}{!cwItems.length && <tr><td colSpan="7" className="cw-empty">No guild inventory items yet.</td></tr>}</tbody></table></div>
      <div className="cw-helper"><b>LIVE STOCK:</b> Every receive, purchase, edit, delete and player assignment is reflected here through the inventory transactions.</div>
    </Modal>}

    {itemModal?.mode === "catalog" && <Modal title="CW ITEM CATALOG" wide onClose={() => setItemModal(null)}>
      <div className="cw-section-head"><div><div className="cw-kicker">ITEM MANAGEMENT • INVENTORY VAULT</div><h2>Clan War Items</h2><p>Manage item definitions and live stock. Purchases spend Guild Gold; free Clan War rewards add stock at ₲0.</p></div></div>
      {isAdmin && <div className="cw-finance-hub cw-vault-finance-hub">
        <div className="cw-finance-hub-row">
          <div className="cw-finance-hub-group cw-hub-receive"><div className="cw-finance-hub-label"><span>CLAN WAR GOLD &amp; REWARDS</span><small>Gold winnings and free Clan War rewards enter the guild</small></div><div className="cw-receive-segment"><button className="cw-btn cw-hub-rewards" onClick={openClanWarRewards}>＋ CLAN WAR GOLD &amp; REWARDS</button></div></div>
          <div className="cw-finance-hub-group cw-hub-spend"><div className="cw-finance-hub-label"><span>CLAN WAR SPENDING &amp; SUPPLIES</span><small>Gold spent is deducted and purchased stock is added to the Inventory Vault</small></div><button className="cw-btn cw-hub-spending" onClick={openCwSpending}>− CLAN WAR SPENDING &amp; SUPPLIES</button></div>
        </div>
        <div className="cw-finance-hub-row cw-finance-hub-row-bottom">
          <div className="cw-finance-hub-group cw-hub-distribute"><div className="cw-finance-hub-label"><span>DISTRIBUTE FROM STOCK</span><small>Select the actual item stock before assigning it</small></div><button className="cw-btn cw-btn-primary cw-hub-assign" onClick={openAssignmentFromHub}>＋ ASSIGN ITEM TO PLAYER</button></div>
          <div className="cw-finance-hub-group cw-hub-manage"><div className="cw-finance-hub-label"><span>ITEM MANAGEMENT</span><small>Create or maintain the stock catalog</small></div><button className="cw-btn" onClick={() => openItemCatalog("add")}>＋ ADD ITEM</button></div>
        </div>
      </div>}
      <div className="cw-table-scroll"><table className="cw-table"><thead><tr><th>ITEM</th><th>UNIT COST</th><th>IN STOCK</th><th>STATUS</th><th>DESCRIPTION</th><th>ACTIONS</th></tr></thead><tbody>
        {cwItems.slice().sort((a, b) => clean(a.name).localeCompare(clean(b.name))).map(item => { const st = stockForItem(item.id); const status = st.received <= 0 || st.available <= 0 ? "OUT" : st.available <= st.threshold ? "LOW" : "IN STOCK"; return <tr key={item.id}><td><strong>{item.name}</strong></td><td className="cw-gold">₲ {money(item.unitCost)}</td><td><strong className={status === "OUT" ? "cw-out" : status === "LOW" ? "cw-low" : "cw-in"}>{st.available}</strong><small>{st.received} received • {st.distributed} distributed</small></td><td><span className={`cw-ledger-type ${status === "OUT" ? "is-out" : status === "LOW" ? "is-low" : "is-in"}`}>{status}</span></td><td>{item.description || "—"}</td><td className="cw-history-actions"><button className="cw-btn cw-btn-item cw-btn-small" onClick={() => openInventoryAssignment(item)}>ASSIGN</button><button className="cw-btn cw-btn-small" onClick={() => openItemCatalog("edit", item)}>EDIT</button><button className={`cw-btn cw-btn-small ${item.active === false ? "cw-btn-primary" : "cw-btn-danger"}`} onClick={() => requestToggleItem(item)}>{item.active === false ? "ENABLE" : "DISABLE"}</button></td></tr>; })}
        {!cwItems.length && <tr><td colSpan="6" className="cw-empty">No CW items have been created yet.</td></tr>}
      </tbody></table></div>
      <div className="cw-helper">Item definitions are separate from item assignments. Editing an item definition does not rewrite previous player history; past assignments retain their recorded item name, quantity and unit cost.</div>
    </Modal>}

    {itemModal?.mode === "add" || itemModal?.mode === "edit" ? <Modal title={itemModal.mode === "edit" ? `EDIT CW ITEM • ${itemModal.item?.name || ""}` : "ADD CW ITEM"} onClose={() => setItemModal(null)}>
      <div className="cw-form-grid"><label>ITEM NAME<input autoFocus value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Example: PUM BOX" /></label><label>UNIT COST (GOLD)<input inputMode="decimal" value={itemForm.unitCost} onChange={e => setItemForm({ ...itemForm, unitCost: formatMoneyInput(e.target.value) })} placeholder="1000" /></label><label className="cw-span-2">DESCRIPTION<textarea value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Optional item description" /></label></div>
      <div className="cw-helper"><b>Example:</b> PUM BOX • ₲ 1,000 each. When an admin assigns 10, Treasury automatically records -₲ 10,000 and the player history records 10 pcs.</div>
      <div className="cw-modal-actions"><button className="cw-btn" onClick={() => setItemModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveItemCatalog}>{saving ? "SAVING..." : itemModal.mode === "edit" ? "SAVE ITEM CHANGES" : "CREATE ITEM"}</button></div>
    </Modal> : null}

    {cwRewardsModal && <Modal title="CLAN WAR GOLD & REWARDS" wide onClose={() => setCwRewardsModal(false)}><div className="cw-cw-rewards-modal">
      <div className="cw-rewards-modal-subtitle">Record today's Clan War winnings. Gold enters Guild Treasury and every item goes directly into Inventory Vault stock for future player assignments.</div>
      <div className="cw-rewards-layout">
        <div className="cw-rewards-main">
          <section className="cw-reward-step cw-reward-gold-step"><div className="cw-reward-step-head"><span className="cw-reward-icon">₲</span><div><b>1. GOLD EARNED</b><small>Enter the gold amount earned from today's Clan War.</small></div></div><div className="cw-gold-entry-row"><div className="cw-gold-input-wrap"><span>₲</span><input inputMode="decimal" value={cwRewardsGold} onChange={e => setCwRewardsGold(formatMoneyInput(e.target.value))} placeholder="0" /></div><button type="button" className="cw-btn cw-reward-preset" onClick={() => setCwRewardsGold("10000")}>+ 10,000</button><button type="button" className="cw-btn cw-reward-preset" onClick={() => setCwRewardsGold("50000")}>+ 50,000</button><button type="button" className="cw-btn cw-reward-preset" onClick={() => setCwRewardsGold("100000")}>+ 100,000</button></div></section>
          <section className="cw-reward-step"><div className="cw-reward-step-head"><span className="cw-reward-icon">◇</span><div><b>2. ITEMS EARNED</b><small>Add the items won from today's Clan War. These are added to inventory stock automatically.</small></div></div><div className="cw-reward-item-editor">{cwRewardsLines.map((line, index) => <div className="cw-reward-edit-line" key={index}><span>{index + 1}</span><div className="cw-reward-item-name-wrap"><input list="cw-reward-item-options" value={line.itemName || ""} onChange={e => { const value = e.target.value; const match = cwItems.find(i => clean(i.name).toLowerCase() === clean(value).toLowerCase()); setCwRewardsLines(rows => rows.map((r, i) => i === index ? { ...r, itemName: value, itemId: match?.id || "" } : r)); }} placeholder="Select existing item or type a new item..." /><small>Existing catalog items are suggested. New names become inventory items automatically.</small></div><input className="cw-reward-qty" inputMode="numeric" value={line.quantity} onChange={e => setCwRewardsLines(rows => rows.map((r, i) => i === index ? { ...r, quantity: e.target.value.replace(/[^0-9]/g, "") } : r))} placeholder="Qty" />{cwRewardsLines.length > 1 && <button type="button" className="cw-btn cw-btn-danger cw-btn-small" onClick={() => setCwRewardsLines(rows => rows.filter((_, i) => i !== index))}>DELETE</button>}</div>)}<datalist id="cw-reward-item-options">{cwItems.filter(i => i.active !== false).map(i => <option key={i.id} value={i.name}>{`₲ ${money(i.unitCost)} each`}</option>)}</datalist></div><button type="button" className="cw-btn cw-add-reward-item" onClick={() => setCwRewardsLines(rows => [...rows, { itemId: "", itemName: "", quantity: "1" }])}>＋ ADD ITEM</button></section>
          <section className="cw-reward-step"><div className="cw-reward-step-head"><span className="cw-reward-icon">▤</span><div><b>3. NOTES <small>(OPTIONAL)</small></b></div></div><textarea value={cwRewardsNote} onChange={e => setCwRewardsNote(e.target.value)} maxLength={300} placeholder="September 4 CW winnings. Good game everyone!" /><div className="cw-char-count">{cwRewardsNote.length}/300</div></section>
        </div>
        <aside className="cw-rewards-side"><section className="cw-reward-preview"><div className="cw-reward-side-head"><span>▣</span><div><b>TODAY'S REWARD PREVIEW</b><small>{formatDateTime(now, resolvedTimezone)}</small></div><em>TODAY</em></div><div className="cw-reward-totals"><div><small>GOLD EARNED</small><strong>₲ {money(num(cwRewardsGold, 0))}</strong></div><div><small>ITEMS EARNED</small><strong>{cwRewardsLines.reduce((n, l) => n + Math.max(0, Math.floor(num(l.quantity, 0))), 0)} PCS</strong></div></div><div className="cw-preview-items">{cwRewardsLines.filter(l => (l.itemName || l.itemId) && Math.floor(num(l.quantity, 0)) > 0).map((l, i) => { const item = cwItems.find(x => String(x.id) === String(l.itemId)); return <div key={i}><span>{item?.name || l.itemName || "Item"}</span><b>× {Math.floor(num(l.quantity, 0))}</b></div> })}{!cwRewardsLines.some(l => (l.itemName || l.itemId) && Math.floor(num(l.quantity, 0)) > 0) && <div className="cw-empty">No items added yet.</div>}</div></section>
          <section className="cw-reward-impact"><h3>▥ IMPACT & TRACKING</h3><p>This will be automatically recorded across the system.</p><div>✓ Add gold to Guild Treasury</div><div>✓ Add items to Inventory Vault stock</div><div>✓ Update Today's Earnings in Dashboard</div><div>✓ Log in Activity & Notification Feed</div><div>✓ Include in Treasury and Inventory History</div></section>
          <section className="cw-reward-important"><h3>ⓘ IMPORTANT</h3><p>• All items are added to available stock immediately.</p><p>• You can assign these items to players later.</p><p>• This action is recorded in the Activity Log and visible to the guild.</p></section>
        </aside>
      </div>
      <div className="cw-rewards-footer"><div><small>TODAY'S TOTALS</small><strong>GOLD: ₲ {money(num(cwRewardsGold, 0))}</strong><span>ITEMS: {cwRewardsLines.filter(l => clean(l.itemName || "")).length}</span><span>TOTAL QTY: {cwRewardsLines.reduce((n, l) => n + Math.max(0, Math.floor(num(l.quantity, 0))), 0)}</span></div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setCwRewardsModal(false)}>CANCEL</button><button className="cw-btn cw-rewards-save" disabled={saving} onClick={saveClanWarRewards}>{saving ? "SAVING..." : "▣ SAVE REWARDS"}</button></div></div>
    </div></Modal>}

    {cwSpendingModal && <Modal title="CLAN WAR SPENDING & SUPPLIES" wide onClose={() => setCwSpendingModal(false)}><datalist id="cw-spending-item-options">{cwItems.filter(i => i.active !== false).map(i => <option key={i.id} value={i.name}>{`₲ ${money(i.unitCost)} each`}</option>)}</datalist>
      <div className="cw-rewards-intro">Record money spent for Clan War supplies. Gold is deducted from Guild Treasury, while every purchased item is added to Inventory Vault stock for future assignments.</div>
      <div className="cw-rewards-layout cw-spending-layout">
        <div className="cw-rewards-main">
          <section className="cw-reward-step cw-reward-gold-step"><div className="cw-reward-step-head"><span className="cw-reward-icon cw-spending-icon">−</span><div><b>1. GOLD SPENT</b><small>Enter the total amount paid from Guild Gold.</small></div></div><div className="cw-gold-entry-row"><div className="cw-gold-input-wrap cw-spending-gold-input"><span>₲</span><input inputMode="decimal" value={cwSpendingGold} onChange={e => setCwSpendingGold(formatMoneyInput(e.target.value))} placeholder={cwSpendingLines.some(l => l.itemId) ? "Auto from stock" : "0"} /></div><button type="button" className="cw-btn cw-reward-preset cw-spending-preset" onClick={() => setCwSpendingGold(String(Math.max(0, treasuryBalance)))}>AVAILABLE GOLD</button></div></section>
          <section className="cw-reward-step"><div className="cw-reward-step-head"><span className="cw-reward-icon cw-spending-icon">◇</span><div><b>2. STOCK PURCHASED</b><small>Select the supplies bought with today's Clan War spending. These quantities enter stock automatically.</small></div></div><div className="cw-reward-item-editor">{cwSpendingLines.map((line, index) => { const item = cwItems.find(i => String(i.id) === String(line.itemId)); const total = item ? num(item.unitCost) * Math.floor(num(line.quantity, 0)) : 0; return <div className="cw-reward-edit-line cw-spending-edit-line" key={index}><span>{index + 1}</span><div className="cw-reward-item-name-wrap"><input list="cw-spending-item-options" value={line.itemName || item?.name || ""} onChange={e => { const value = e.target.value; const match = cwItems.find(i => clean(i.name).toLowerCase() === clean(value).toLowerCase()); setCwSpendingLines(rows => rows.map((r, i) => i === index ? { ...r, itemId: match?.id || "", itemName: value, unitCost: match ? formatMoneyInput(match.unitCost) : r.unitCost } : r)); }} placeholder="Select an item or type a new item..." /><small>Existing items are suggested. New items can be created here.</small>{!item && line.itemName && <input className="cw-spending-new-cost" inputMode="decimal" value={line.unitCost || ""} onChange={e => setCwSpendingLines(rows => rows.map((r, i) => i === index ? { ...r, unitCost: formatMoneyInput(e.target.value) } : r))} placeholder="New item unit cost" />}</div><input className="cw-reward-qty" inputMode="numeric" value={line.quantity} onChange={e => setCwSpendingLines(rows => rows.map((r, i) => i === index ? { ...r, quantity: e.target.value.replace(/[^0-9]/g, "") } : r))} placeholder="Qty" /><strong className="cw-spending-line-total">₲ {money(total || (!item ? num(line.unitCost, 0) * Math.floor(num(line.quantity, 0)) : 0))}</strong>{cwSpendingLines.length > 1 && <button type="button" className="cw-btn cw-btn-danger cw-btn-small" onClick={() => setCwSpendingLines(rows => rows.filter((_, i) => i !== index))}>DELETE</button>}</div> })}</div><button type="button" className="cw-btn cw-add-reward-item" onClick={() => setCwSpendingLines(rows => [...rows, { itemId: "", quantity: "1" }])}>＋ ADD ITEM</button></section>
          <section className="cw-reward-step"><div className="cw-reward-step-head"><span className="cw-reward-icon">▤</span><div><b>3. NOTES <small>(OPTIONAL)</small></b></div></div><textarea value={cwSpendingNote} onChange={e => setCwSpendingNote(e.target.value)} maxLength={300} placeholder="Example: PUM BOX and CT BOX purchased for this week's Clan War." /><div className="cw-char-count">{cwSpendingNote.length}/300</div></section>
        </div>
        <aside className="cw-rewards-side">
          <section className="cw-current-inventory">
            <div className="cw-current-inventory-head">
              <div className="cw-current-inventory-title">
                <span className="cw-inventory-receipt-icon">▤</span>
                <div><b>CURRENT GUILD INVENTORY</b><small>Quick receipt of live guild stock</small></div>
              </div>
              <button type="button" className="cw-btn cw-inventory-quick-view" onClick={openGuildInventory}>FULL INVENTORY</button>
            </div>
            <div className="cw-current-inventory-tools">
              <input value={spendingInventorySearch} onChange={e => { setSpendingInventorySearch(e.target.value); setSpendingInventoryPage(1) }} placeholder="Search item or category..." />
              <select value={spendingInventoryCategory} onChange={e => { setSpendingInventoryCategory(e.target.value); setSpendingInventoryPage(1) }}>
                {spendingInventoryCategories.map(cat => <option key={cat} value={cat}>{cat === "ALL" ? "ALL CATEGORIES" : cat}</option>)}
              </select>
            </div>
            <div className="cw-current-inventory-receipt">
              <div className="cw-receipt-columns"><span>ITEM</span><span>QTY</span><span>STATUS</span></div>
              {spendingInventoryPageRows.map(({ item, st, status }) => (
                <div className="cw-receipt-row" key={item.id}>
                  <div><strong>{item.name}</strong><small>{item.category || "Clan War"} · ₲ {money(item.unitCost)} each</small></div>
                  <b>{st.available}</b>
                  <span className={`cw-receipt-status ${status === "OUT" ? "is-out" : status === "LOW" ? "is-low" : "is-in"}`}>{status}</span>
                </div>
              ))}
              {!spendingInventoryPageRows.length && <div className="cw-receipt-empty">No matching guild stock.</div>}
            </div>
            <div className="cw-current-inventory-footer">
              <span>{spendingInventoryRows.length} ITEM{spendingInventoryRows.length === 1 ? "" : "S"} · SHOWING 5 PER PAGE</span>
              <div>
                <button type="button" className="cw-btn cw-btn-small" disabled={spendingInventoryPageSafe <= 1} onClick={() => setSpendingInventoryPage(p => Math.max(1, p - 1))}>‹</button>
                <b>{spendingInventoryPageSafe} / {spendingInventoryPageCount}</b>
                <button type="button" className="cw-btn cw-btn-small" disabled={spendingInventoryPageSafe >= spendingInventoryPageCount} onClick={() => setSpendingInventoryPage(p => Math.min(spendingInventoryPageCount, p + 1))}>›</button>
              </div>
            </div>
          </section>
          <section className="cw-reward-impact cw-spending-impact">
            <h3>▥ SPENDING &amp; STOCK</h3>
            <p>This single action keeps Gold and Inventory connected.</p>
            <div>✓ Deduct gold from Guild Treasury</div>
            <div>✓ Add purchased quantities to Inventory Vault</div>
            <div>✓ Make stock available for future assignments</div>
            <div>✓ Record the original Added time</div>
            <div>✓ Log the full transaction in Activity &amp; Notifications</div>
          </section>
          <section className="cw-reward-important">
            <h3>ⓘ IMPORTANT</h3>
            <p>• Gold cannot go below the current Guild Gold balance.</p>
            <p>• Purchased stock is not charged again when assigned to a player.</p>
            <p>• The full receipt remains in Treasury and Inventory history.</p>
          </section>
        </aside>
      </div>
      <div className="cw-rewards-footer"><div><small>TODAY'S TOTALS</small><strong>GOLD: −₲ {money(Math.max(0, num(cwSpendingGold, 0) || cwSpendingLines.reduce((sum, l) => { const i = cwItems.find(x => String(x.id) === String(l.itemId)); return sum + (i ? num(i.unitCost) * Math.floor(num(l.quantity, 0)) : 0) }, 0)))}</strong><span>ITEMS: {cwSpendingLines.filter(l => l.itemId).length}</span><span>TOTAL QTY: {cwSpendingLines.reduce((n, l) => n + Math.max(0, Math.floor(num(l.quantity, 0))), 0)}</span></div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setCwSpendingModal(false)}>CANCEL</button><button className="cw-btn cw-rewards-save cw-spending-save" disabled={saving} onClick={saveCwSpending}>{saving ? "SAVING..." : "▣ SAVE SPENDING & STOCK"}</button></div></div>
    </Modal>}

    {inventoryPurchaseModal && <Modal title={inventoryPurchaseModal === "free" ? "RECEIVE FREE CW STOCK" : "PURCHASE INVENTORY STOCK"} wide onClose={() => setInventoryPurchaseModal(false)}><div className="cw-form-grid"><label>TYPE<input value={inventoryPurchaseModal === "free" ? "CLAN WAR REWARD — ₲0" : "INVENTORY PURCHASE — GUILD EXPENSE"} readOnly /></label><label>DATE & TIME ADDED<input value={formatDateTime(now, resolvedTimezone)} readOnly /><small className="cw-field-help">Recorded automatically when this stock receipt is saved. Display follows the global timezone.</small></label><label className="cw-span-2">NOTE<textarea value={inventoryPurchaseNote} onChange={e => setInventoryPurchaseNote(e.target.value)} placeholder="Example: Guild Leader expense / Clan War reward" /></label></div><div className="cw-inventory-line-editor">{inventoryPurchaseLines.map((line, index) => { const item = cwItems.find(i => String(i.id) === String(line.itemId)); const total = item ? num(item.unitCost) * Math.floor(num(line.quantity, 0)) : 0; return <div className="cw-inventory-line" key={index}><select value={line.itemId} onChange={e => setInventoryPurchaseLines(rows => rows.map((r, i) => i === index ? { ...r, itemId: e.target.value } : r))}><option value="">SELECT ITEM...</option>{cwItems.filter(i => i.active !== false).map(i => <option key={i.id} value={i.id}>{i.name} • ₲ {money(i.unitCost)} each</option>)}</select><input inputMode="numeric" value={line.quantity} onChange={e => setInventoryPurchaseLines(rows => rows.map((r, i) => i === index ? { ...r, quantity: e.target.value.replace(/[^0-9]/g, "") } : r))} placeholder="Quantity" /><strong>{inventoryPurchaseModal === "free" ? "₲ 0" : `₲ ${money(total)}`}</strong>{inventoryPurchaseLines.length > 1 && <button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => setInventoryPurchaseLines(rows => rows.filter((_, i) => i !== index))}>REMOVE</button>}</div> })}</div><button className="cw-btn" onClick={() => setInventoryPurchaseLines(rows => [...rows, { itemId: "", quantity: "1" }])}>＋ ADD ITEM LINE</button><div className="cw-helper"><b>{inventoryPurchaseModal === "free" ? "TREASURY IMPACT: ₲0" : `TREASURY IMPACT: -₲ ${money(inventoryPurchaseLines.reduce((sum, l) => { const i = cwItems.find(x => String(x.id) === String(l.itemId)); return sum + (i ? num(i.unitCost) * Math.floor(num(l.quantity, 0)) : 0) }, 0))}`}</b><br />Received quantities are added to the Inventory Vault and can later be distributed without another Treasury charge.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setInventoryPurchaseModal(false)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={inventoryPurchaseModal === "free" ? saveFreeInventory : saveInventoryPurchase}>{saving ? "SAVING..." : inventoryPurchaseModal === "free" ? "RECEIVE STOCK — ₲0" : "PURCHASE & ADD TO VAULT"}</button></div></Modal>}

    {itemAssignmentModal && <Modal title={`${itemAssignmentModal.assignment ? "EDIT ITEM ASSIGNMENT" : "ASSIGN ITEM TO PLAYER"} • ${itemAssignmentModal.player?.ign || itemAssignmentModal.inventoryItem?.name || "INVENTORY ITEM"}`} wide onClose={() => setItemAssignmentModal(null)}>
      <div className="cw-attendance-summary"><strong>{itemAssignmentModal.player?.ign || "Inventory Stock Distribution"}</strong><span>{itemAssignmentModal.player ? `${itemAssignmentModal.player.className || itemAssignmentModal.player.class} • ${itemAssignmentModal.player.role || "Role not set"}` : "Select a player and an item from the available Inventory Vault stock."}</span></div>
      <div className="cw-form-grid">
        {!itemAssignmentModal.player && <label>PLAYER<select value={itemAssignmentForm.playerId} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, playerId: e.target.value })}><option value="">SELECT PLAYER...</option>{activePlayers.map(p => <option key={p.id} value={p.id}>{p.ign} • {p.className || p.class}</option>)}</select></label>}
        <label>ITEM FROM AVAILABLE STOCK<select value={itemAssignmentForm.itemId} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, itemId: e.target.value })}><option value="">SELECT STOCK ITEM...</option>{cwItems.filter(i => (i.active !== false && stockForItem(i.id).available > 0) || i.id === itemAssignmentForm.itemId).map(item => <option key={item.id} value={item.id}>{item.name} • {stockForItem(item.id).available} AVAILABLE • ₲ {money(item.unitCost)} each</option>)}</select></label>
        <label>QUANTITY<input inputMode="numeric" value={itemAssignmentForm.quantity} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, quantity: e.target.value.replace(/[^0-9]/g, "") })} min="1" /></label>
        <label className="cw-span-2">CLAN WAR DATE<select value={itemAssignmentForm.occurrenceKey} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, occurrenceKey: e.target.value })}>{itemAssignmentModal.treasuryEntry && !windowOccurrences.some(o => o.key === itemAssignmentForm.occurrenceKey) && itemAssignmentForm.occurrenceKey && <option value={itemAssignmentForm.occurrenceKey}>{itemAssignmentForm.occurrenceKey} • TREASURY DATE</option>}{windowOccurrences.map(o => <option key={o.key} value={o.key}>{formatDateTime(o.at, resolvedTimezone)}{o.key === todayKey ? " • TODAY" : ""}</option>)}</select></label>
        <label className="cw-span-2">NOTES<textarea value={itemAssignmentForm.notes} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, notes: e.target.value })} placeholder="Optional note about the item distribution" /></label>
        {itemAssignmentModal.assignment && <label className="cw-span-2">ADMIN COMMENT *<textarea value={itemAssignmentForm.adminComment} onChange={e => setItemAssignmentForm({ ...itemAssignmentForm, adminComment: e.target.value })} placeholder="Required when editing this item assignment." /></label>}
      </div>
      {(() => { const item = cwItems.find(i => String(i.id) === String(itemAssignmentForm.itemId)); const stock = item ? stockForItem(item.id) : null; const qty = Math.floor(num(itemAssignmentForm.quantity, 0)); const remaining = stock ? stock.available - qty : 0; const status = !stock || stock.available <= 0 ? "is-out" : stock.available <= stock.threshold ? "is-low" : ""; return item ? <div className={`cw-stock-inline ${status}`}><span><strong>{money(stock.available)}</strong> available</span><span>{money(stock.received)} received</span><span>{money(stock.distributed)} distributed</span><span>{qty > 0 ? `${money(Math.max(0, remaining))} after` : "Select quantity"}</span></div> : null; })()}
      {(() => { const item = cwItems.find(i => String(i.id) === String(itemAssignmentForm.itemId)); const qty = Math.floor(num(itemAssignmentForm.quantity, 0)); const total = item ? num(item.unitCost) * qty : 0; return <div className="cw-helper"><b>TREASURY:</b> {item ? `${qty} × ₲ ${money(item.unitCost)} = -₲ ${money(total)}` : "Select an item."}. {itemAssignmentModal.treasuryEntry ? "This will link the existing Treasury expense to the player and CW item history without creating a duplicate expense." : "Distribution uses existing inventory stock only. Treasury impact: ₲0. Player History and Inventory are recorded."}</div> })()}
      <div className="cw-modal-actions"><button className="cw-btn" onClick={() => setItemAssignmentModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving || !itemAssignmentForm.playerId || !itemAssignmentForm.itemId} onClick={saveItemAssignment}>{saving ? "SAVING..." : itemAssignmentModal.assignment ? "SAVE ITEM ASSIGNMENT" : itemAssignmentModal.treasuryEntry ? "LINK ITEM TO PLAYER" : "ASSIGN FROM INVENTORY"}</button></div>
    </Modal>}

    {scheduleModal && <Modal title="EDIT CLAN WAR OCCURRENCE" onClose={() => setScheduleModal(false)}><div className="cw-label">CW DAYS</div><div className="cw-day-picks">{CW_DAYS.map(d => <button key={d.key} className={scheduleForm.days.includes(d.key) ? "selected" : ""} onClick={() => toggleDay(d.key)}>{d.label}</button>)}</div><div className="cw-form-grid"><label>BASE TIME<input type="time" value={scheduleForm.time} onChange={e => setScheduleForm({ ...scheduleForm, time: e.target.value })} /></label><label>BASE TIMEZONE<input value="Philippines — Manila (Asia/Manila)" readOnly /></label></div><div className="cw-helper">Clan War is stored in Manila time. The global DISPLAY TIMEZONE selector only changes how the schedule is displayed to each viewer. Example: 9:00 PM Manila automatically converts to the viewer's browser/custom timezone.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setScheduleModal(false)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveSchedule}>SAVE OCCURRENCE</button></div></Modal>}

    {salaryModal && <Modal title="CW SALARY BY CLASS + ROLE" wide onClose={() => setSalaryModal(false)}>
      <div className="cw-salary-intro">Create the exact salary classification used by your guild. The same class can have different salaries by role — for example <b>Extreme • Hitter</b> and <b>Extreme • Taichi Stream</b> can be paid differently.</div>
      <div className="cw-salary-toolbar"><div><span className="cw-kicker">SALARY CLASSIFICATIONS</span><strong>{salaryDraft.length} CONFIGURED</strong></div><button className="cw-btn cw-btn-primary" onClick={addSalaryProfile}>＋ ADD CLASS + ROLE</button></div>
      <div className="cw-salary-grid cw-salary-grid-role">
        {salaryDraft.length ? salaryDraft.map(row => <div className="cw-salary-row" key={row.id}>
          <label><span>CLASS</span><select value={row.className} onChange={e => updateSalaryProfile(row.id, "className", e.target.value)}>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label><span>ROLE</span><select value={row.role} onChange={e => updateSalaryProfile(row.id, "role", e.target.value)}>{roles.map(r => <option key={r} value={r}>{r}</option>)}<option value="All Roles">All Roles</option></select></label>
          <label className="cw-salary-amount"><span>SALARY / CW</span><div><input inputMode="decimal" value={row.salaryGold ?? ""} onChange={e => updateSalaryProfile(row.id, "salaryGold", e.target.value)} placeholder="0" /><em>GOLD</em></div></label>
          <button type="button" className="cw-btn cw-btn-danger cw-btn-small cw-salary-delete" onClick={() => deleteSalaryProfile(row.id)} aria-label={`Delete ${row.className} ${row.role} salary`}>DELETE</button>
        </div>) : <div className="cw-salary-empty">No salary classifications configured. Add one for each Class + Role combination you use.</div>}
      </div>
      <div className="cw-helper"><b>How it works:</b> attendance checks the player's exact <b>CLASS + ROLE</b> first. If no exact rate exists, it checks <b>All Roles</b> for that class, then the existing class salary as a legacy fallback. You can add, edit or delete classifications here. Every change is written to the CW Activity / Notice Board.</div>
      <div className="cw-modal-actions"><button className="cw-btn" onClick={() => setSalaryModal(false)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveSalaries}>{saving ? "SAVING..." : "SAVE SALARY CLASSIFICATIONS"}</button></div>
    </Modal>}

    {roleModal && <Modal title="MANAGE CW ROLES" onClose={() => setRoleModal(false)}><div className="cw-helper">Add future roles without changing the code. Existing default roles are protected from removal.</div><div className="cw-role-manager">{roles.map(r => <div className="cw-role-manager-row" key={r}><span>{r}</span>{isAdmin && !DEFAULT_ROLES.includes(r) && <button className="cw-btn cw-btn-danger cw-btn-small" onClick={async () => { const next = roles.filter(x => x !== r); await setDoc(doc(db, "cwSettings", "current"), { roles: next, updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }, { merge: true }); await audit({ category: "PLAYER", title: "CW ROLE REMOVED", message: `${r} was removed from Clan War roles.`, entityType: "cw-role", details: [`Role: ${r}`] }) }}>REMOVE</button>}</div>)}</div><div className="cw-role-add"><input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Example: Debuffer / Scout / Coordinator" /><button className="cw-btn cw-btn-primary" onClick={async () => { const v = clean(newRole); if (!v || roles.some(x => x.toLowerCase() === v.toLowerCase())) return; await setDoc(doc(db, "cwSettings", "current"), { roles: [...roles, v], updatedAt: serverTimestamp(), updatedBy: actor(user), updatedByUid: user?.uid || null }, { merge: true }); await audit({ category: "PLAYER", title: "CW ROLE ADDED", message: `${v} was added to Clan War roles.`, entityType: "cw-role", details: [`Role: ${v}`] }); setNewRole("") }}>＋ ADD ROLE</button></div></Modal>}

    {selectedPlayer && <Modal title="PLAYER HISTORY" wide onClose={() => setSelectedPlayer(null)}>
      {(() => {
        const playerAttendanceRows = attendance.filter(r => String(r.playerId) === String(selectedPlayer.id)).sort((a, b) => (safeDate(b.scheduledAt || b.updatedAt || b.createdAt)?.getTime() || 0) - (safeDate(a.scheduledAt || a.updatedAt || a.createdAt)?.getTime() || 0));
        const playerItemRows = itemAssignments.filter(r => String(r.playerId) === String(selectedPlayer.id)).sort((a, b) => (safeDate(b.scheduledAt || b.updatedAt || b.createdAt)?.getTime() || 0) - (safeDate(a.scheduledAt || a.updatedAt || a.createdAt)?.getTime() || 0));
        const q = playerHistorySearch.toLowerCase().trim();
        const filteredAttendance = playerAttendanceRows.filter(r => !q || [r.ign, r.className, r.role, r.receivedItem, r.notes, r.dateKey, r.updatedBy, r.createdBy].some(v => clean(v).toLowerCase().includes(q)));
        const filteredItems = playerItemRows.filter(r => !q || [r.playerName, r.itemName, r.notes, r.dateKey, r.updatedBy, r.createdBy].some(v => clean(v).toLowerCase().includes(q)));
        const attendanceRows = filteredAttendance;
        const salaryRows = filteredAttendance.filter(r => num(r.salaryGold) > 0);
        const legacyItemRows = filteredAttendance.filter(r => clean(r.receivedItem));
        const itemRows = filteredItems;
        const legacyItemDisplayRows = legacyItemRows.map(r => ({ ...r, __legacyItem: true, itemName: r.receivedItem, quantity: Math.max(1, num(r.itemQuantity, 1)), totalCost: num(r.itemCostGold) }));
        const itemDisplayRows = [...itemRows, ...legacyItemDisplayRows].sort((a, b) => (safeDate(b.scheduledAt || b.updatedAt || b.createdAt)?.getTime() || 0) - (safeDate(a.scheduledAt || a.updatedAt || a.createdAt)?.getTime() || 0));
        const allActivityRows = [...filteredAttendance.map(r => ({ ...r, __activityType: "attendance" })), ...itemDisplayRows.map(r => ({ ...r, __activityType: "item" }))].sort((a, b) => (safeDate(b.scheduledAt || b.updatedAt || b.createdAt)?.getTime() || 0) - (safeDate(a.scheduledAt || a.updatedAt || a.createdAt)?.getTime() || 0));
        const rows = playerHistoryTab === "salary" ? salaryRows : playerHistoryTab === "items" ? itemDisplayRows : allActivityRows;
        const totalLogEntries = filteredAttendance.length + filteredItems.length;
        const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        const pageRows = rows.slice((playerHistoryPage - 1) * PAGE_SIZE, playerHistoryPage * PAGE_SIZE);
        const stats = statsFor(selectedPlayer);
        const totalItemCost = legacyItemRows.reduce((sum, r) => sum + num(r.itemCostGold), 0) + itemRows.reduce((sum, r) => sum + num(r.totalCost), 0);
        return <>
          <div className="cw-history-player-head">
            <div className="cw-history-avatar"><ClassEmblem name={selectedPlayer.className || selectedPlayer.class} /></div>
            <div><div className="cw-kicker">PLAYER HISTORY</div><h3>{selectedPlayer.ign}</h3><p>{selectedPlayer.className || selectedPlayer.class} • {selectedPlayer.role || "Role not set"}</p></div>
          </div>
          <div className="cw-history-stats">
            <div><span className="cw-history-stat-icon">✦</span><div><small>CW DAYS ATTENDED</small><strong>{count(stats.days)}</strong><em>All-time participation</em></div></div>
            <div><span className="cw-history-stat-icon gold">₲</span><div><small>TOTAL SALARY</small><strong className="cw-gold">₲ {money(stats.salary)}</strong><em>Lifetime CW salary</em></div></div>
            <div><span className="cw-history-stat-icon item">◇</span><div><small>ITEMS RECEIVED</small><strong>{count(stats.items)}</strong><em>Recorded item distributions</em></div></div>
            <div><span className="cw-history-stat-icon log">▤</span><div><small>TOTAL LOG ENTRIES</small><strong>{count(totalLogEntries)}</strong><em>CW attendance + item history</em></div></div>
          </div>
          <div className="cw-history-toolbar"><input value={playerHistorySearch} onChange={e => { setPlayerHistorySearch(e.target.value); setPlayerHistoryPage(1) }} placeholder="Search date, role, salary, item, notes..." /><div><small>ACTIVITY LOG</small><b>{count(totalLogEntries)} ENTRIES</b></div></div>
          <div className="cw-history-tabs">
            <button className={playerHistoryTab === "all" ? "active" : ""} onClick={() => { setPlayerHistoryTab("all"); setPlayerHistoryPage(1) }}>ALL ACTIVITY</button>
            <button className={playerHistoryTab === "salary" ? "active" : ""} onClick={() => { setPlayerHistoryTab("salary"); setPlayerHistoryPage(1) }}>SALARY HISTORY</button>
            <button className={playerHistoryTab === "items" ? "active" : ""} onClick={() => { setPlayerHistoryTab("items"); setPlayerHistoryPage(1) }}>ITEM RECEIVED HISTORY</button>
          </div>
          <div className="cw-history-summary-strip">
            <div><small>ATTENDANCE RECORDS</small><b>{count(attendanceRows.length)}</b></div>
            <div><small>SALARY RECORDS</small><b>₲ {money(salaryRows.reduce((sum, r) => sum + num(r.salaryGold), 0))}</b></div>
            <div><small>ITEM DISTRIBUTIONS</small><b>{count(legacyItemRows.length + itemRows.length)}</b></div>
            <div><small>ITEM COST</small><b>₲ {money(totalItemCost)}</b></div>
          </div>
          {playerHistoryTab === "all" && <div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>DATE / TIME</th><th>ACTIVITY</th><th>CLASS</th><th>ROLE</th><th>SALARY</th><th>ITEM</th><th>QTY / COST</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r => r.__activityType === "item" ? <tr key={`item-${r.id}`}><td><strong>{formatDate(r.scheduledAt || r.dateKey, resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt || r.dateKey, resolvedTimezone)}</small></td><td><span className="cw-notice-category-badge cw-notice-category-item">ITEM</span></td><td><span className="cw-class"><ClassEmblem name={r.className} small />{r.className || selectedPlayer.className || selectedPlayer.class}</span></td><td>{r.role || selectedPlayer.role || "—"}</td><td>—</td><td><strong>{r.itemName || r.receivedItem || "—"}</strong></td><td>{r.quantity ? `${count(r.quantity)} pcs • ₲ ${money(r.totalCost ?? r.itemCostGold)}` : `₲ ${money(r.totalCost ?? r.itemCostGold)}`}</td><td>{r.updatedBy || r.createdBy || "System"}<small>{formatDateTime(r.updatedAt || r.createdAt, resolvedTimezone)}</small></td><td className="cw-history-actions">{isAdmin && (r.__legacyItem ? <button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openAttendanceRecord(r, "edit") }}>EDIT</button> : <><button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openItemAssignment(selectedPlayer, r) }}>EDIT</button><button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => requestDeleteItemAssignment(r)}>DELETE</button></>)}</td></tr> : <tr key={`attendance-${r.id}`}><td><strong>{formatDate(r.scheduledAt || r.dateKey, resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt || r.dateKey, resolvedTimezone)}</small></td><td><span className="cw-notice-category-badge cw-notice-category-attendance">ATTENDANCE</span></td><td><span className="cw-class"><ClassEmblem name={r.className} small />{r.className}</span></td><td><span className="cw-role">{r.role || "—"}</span></td><td className="cw-gold">₲ {money(r.salaryGold)}</td><td>{r.receivedItem || "—"}</td><td>₲ {money(r.itemCostGold)}</td><td>{r.updatedBy || r.createdBy || "System"}<small>{formatDateTime(r.updatedAt || r.createdAt, resolvedTimezone)}</small></td><td className="cw-history-actions">{isAdmin && <><button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openAttendanceRecord(r, "edit") }}>EDIT</button><button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => requestDeleteAttendance(r)}>DELETE</button></>}</td></tr>)}
            {!pageRows.length && <tr><td colSpan="9" className="cw-empty">No CW activity history found for this player.</td></tr>}
          </tbody></table></div>}
          {playerHistoryTab === "salary" && <div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>CW DATE / TIME</th><th>CLASS</th><th>ROLE</th><th>SALARY PAID</th><th>UPDATED</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r => <tr key={r.id}><td><strong>{formatDate(r.scheduledAt || r.dateKey, resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt || r.dateKey, resolvedTimezone)}</small></td><td><span className="cw-class"><ClassEmblem name={r.className} small />{r.className}</span></td><td>{r.role || "—"}</td><td className="cw-gold"><strong>₲ {money(r.salaryGold)}</strong></td><td>{formatDateTime(r.updatedAt || r.createdAt, resolvedTimezone)}</td><td>{r.updatedBy || r.createdBy || "System"}</td><td>{isAdmin && <button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openAttendanceRecord(r, "edit") }}>EDIT</button>}</td></tr>)}
            {!pageRows.length && <tr><td colSpan="7" className="cw-empty">No salary history found.</td></tr>}
          </tbody></table></div>}
          {playerHistoryTab === "items" && <div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>CW DATE / TIME</th><th>ITEM RECEIVED</th><th>QTY</th><th>ITEM COST</th><th>ROLE</th><th>NOTES</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r => <tr key={r.id}><td><strong>{formatDate(r.scheduledAt || r.dateKey, resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt || r.dateKey, resolvedTimezone)}</small></td><td><strong>{r.itemName || r.receivedItem}</strong></td><td>{r.quantity ? `${count(r.quantity)} pcs` : "—"}</td><td className="cw-gold">₲ {money(r.totalCost ?? r.itemCostGold)}</td><td>{r.role || selectedPlayer.role || "—"}</td><td title={r.notes || ""}>{r.notes || "—"}</td><td>{r.updatedBy || r.createdBy || "System"}<small>{formatDateTime(r.updatedAt || r.createdAt, resolvedTimezone)}</small></td><td>{isAdmin && (r.itemName ? <><button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openItemAssignment(selectedPlayer, r) }}>EDIT</button><button className="cw-btn cw-btn-danger cw-btn-small" onClick={() => requestDeleteItemAssignment(r)}>DELETE</button></> : <button className="cw-btn cw-btn-small" onClick={() => { setSelectedPlayer(null); openAttendanceRecord(r, "edit") }}>EDIT</button>)}</td></tr>)}
            {!pageRows.length && <tr><td colSpan="8" className="cw-empty">No item distribution history found.</td></tr>}
          </tbody></table></div>}
          <div className="cw-history-footer"><span>Showing {rows.length ? count((playerHistoryPage - 1) * PAGE_SIZE + 1) : 0}-{count(Math.min(playerHistoryPage * PAGE_SIZE, rows.length))} of {count(rows.length)} entries</span><div className="cw-pagination"><button disabled={playerHistoryPage <= 1} onClick={() => setPlayerHistoryPage(p => p - 1)}>‹</button><span>{playerHistoryPage} / {pageCount}</span><button disabled={playerHistoryPage >= pageCount} onClick={() => setPlayerHistoryPage(p => p + 1)}>›</button></div></div>
        </>;
      })()}
    </Modal>}

    {selectedAttendance && <Modal title="CW ATTENDANCE DETAILS" wide onClose={() => setSelectedAttendance(null)}><div className="cw-detail-grid"><div><small>PLAYER</small><strong>{selectedAttendance.ign}</strong></div><div><small>CLASS</small><strong><ClassEmblem name={selectedAttendance.className} small />{selectedAttendance.className}</strong></div><div><small>ROLE</small><strong>{selectedAttendance.role}</strong></div><div><small>CW DATE & TIME</small><strong>{formatDateTime(selectedAttendance.scheduledAt || selectedAttendance.dateKey, resolvedTimezone)}</strong></div><div><small>SALARY PAID</small><strong className="cw-gold">₲ {money(selectedAttendance.salaryGold)}</strong></div><div><small>ITEM COST</small><strong className="cw-gold">₲ {money(selectedAttendance.itemCostGold)}</strong></div><div><small>ITEM RECEIVED</small><strong>{selectedAttendance.receivedItem || "—"}</strong></div><div><small>RECORDED BY</small><strong>{selectedAttendance.updatedBy || selectedAttendance.createdBy || "System"}</strong></div><div><small>LAST UPDATED</small><strong>{formatDateTime(selectedAttendance.updatedAt || selectedAttendance.createdAt, resolvedTimezone)}</strong></div></div><div className="cw-detail-block"><small>NOTES</small><p>{selectedAttendance.notes || "No additional notes."}</p></div>{isAdmin && <div className="cw-modal-actions"><button className="cw-btn" onClick={() => { const row = selectedAttendance; setSelectedAttendance(null); openAttendanceRecord(row, "edit") }}>EDIT</button><button className="cw-btn cw-btn-primary" onClick={() => { const row = selectedAttendance; setSelectedAttendance(null); openAttendanceRecord(row, "override") }}>OVERRIDE</button><button className="cw-btn cw-btn-danger" onClick={() => requestDeleteAttendance(selectedAttendance)}>DELETE RECORD</button></div>}</Modal>}

    {(treasuryModal === "income" || treasuryModal === "expense") && <Modal title={treasuryModal === "income" ? "ADD GOLD RECEIVED" : "ADD GUILD EXPENSE"} wide onClose={() => setTreasuryModal(null)}><div className="cw-form-grid"><label>TYPE<input value={treasuryModal === "income" ? "RECEIVED FROM CW WAR (+)" : "GUILD EXPENSE (-)"} readOnly /></label><label>AMOUNT (GOLD)<input inputMode="decimal" value={treasuryForm.amount} onChange={e => setTreasuryForm({ ...treasuryForm, amount: formatMoneyInput(e.target.value) })} placeholder="0" /></label><label>DATE & TIME ADDED<input value={formatDateTime(now, resolvedTimezone)} readOnly /><small className="cw-field-help">Recorded automatically when this entry is saved. The same timestamp is converted by the global display timezone.</small></label><label className="cw-span-2">DESCRIPTION<input value={treasuryForm.description} onChange={e => setTreasuryForm({ ...treasuryForm, description: e.target.value })} placeholder="Example: CW War winnings / Guild expense" /></label><label className="cw-span-2">ITEM / WHAT WAS PURCHASED<textarea value={treasuryForm.item} onChange={e => setTreasuryForm({ ...treasuryForm, item: e.target.value })} placeholder="Optional: PUM BOX • Crazytime Box • Guild supplies" /></label><label className="cw-span-2">ADMIN COMMENT<textarea value={treasuryForm.adminComment} onChange={e => setTreasuryForm({ ...treasuryForm, adminComment: e.target.value })} placeholder="Explain what this money was for..." /></label></div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setTreasuryModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryEntry}>{saving ? "SAVING..." : "SAVE TREASURY ENTRY"}</button></div></Modal>}

    {treasuryModal === "edit" && <Modal title={treasuryEditOriginal?.type === "balance-override" ? "EDIT BALANCE OVERRIDE" : "EDIT TREASURY ENTRY"} wide onClose={() => { setTreasuryModal(null); setTreasuryEditOriginal(null) }}>
      {treasuryEditOriginal?.type === "balance-override" ? <div className="cw-form-grid"><label>CURRENT AVAILABLE<strong className={`cw-modal-value ${treasuryBalance < 0 ? "cw-negative-text" : "cw-gold"}`}>₲ {money(treasuryBalance)}</strong></label><label>NEW AVAILABLE GOLD<input inputMode="decimal" value={treasuryForm.amount} onChange={e => setTreasuryForm({ ...treasuryForm, amount: formatMoneyInput(e.target.value) })} placeholder="0.00" /></label><label className="cw-span-2">WHY IS THIS BEING EDITED? *<textarea value={treasuryForm.adminComment} onChange={e => setTreasuryForm({ ...treasuryForm, adminComment: e.target.value })} placeholder="Required. Explain the correction..." /></label></div> :
        <div className="cw-form-grid"><label>TYPE<select value={treasuryForm.type} disabled={Boolean(treasuryEditOriginal?.sourceAttendanceId)} onChange={e => setTreasuryForm({ ...treasuryForm, type: e.target.value })}><option value="cw-war-income">RECEIVED FROM CW WAR (+)</option><option value="expense">EXPENSE (-)</option></select></label><label>AMOUNT (GOLD)<input inputMode="decimal" value={treasuryForm.amount} onChange={e => setTreasuryForm({ ...treasuryForm, amount: formatMoneyInput(e.target.value) })} placeholder="0" /></label><label>DATE & TIME ADDED<input value={formatDateTime(treasuryEditOriginal?.createdAt || now, resolvedTimezone)} readOnly /><small className="cw-field-help">Original creation time. Editing this Treasury entry does not change the Added timestamp.</small></label><label className="cw-span-2">DESCRIPTION<input value={treasuryForm.description} onChange={e => setTreasuryForm({ ...treasuryForm, description: e.target.value })} /></label><label className="cw-span-2">ITEM / WHAT WAS PURCHASED<textarea value={treasuryForm.item} onChange={e => setTreasuryForm({ ...treasuryForm, item: e.target.value })} /></label><label className="cw-span-2">WHY WAS THIS EDITED? *<textarea value={treasuryForm.adminComment} onChange={e => setTreasuryForm({ ...treasuryForm, adminComment: e.target.value })} placeholder="Required. Explain exactly why the amount, description or item was corrected..." /></label></div>}
      <div className="cw-helper">{treasuryEditOriginal?.sourceAttendanceId ? "This Treasury row is linked to CW attendance. Editing the salary/item amount here updates the CW attendance record and the Treasury ledger together." : treasuryEditOriginal?.type === "balance-override" ? "The new balance is stored as a correction delta. The previous balance and reason remain in the audit trail." : "The original value is kept in the Guild Notice Board. Editing changes the current Guild Gold balance, so a reason is required."}</div>
      <div className="cw-modal-actions"><button className="cw-btn" onClick={() => { setTreasuryModal(null); setTreasuryEditOriginal(null) }}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryEdit}>{saving ? "SAVING..." : "SAVE EDIT & LOG REASON"}</button></div>
    </Modal>}

    {treasuryModal === "override" && <Modal title="OVERRIDE AVAILABLE GUILD GOLD" wide onClose={() => setTreasuryModal(null)}><div className="cw-form-grid"><label>CURRENT AVAILABLE<strong className={`cw-modal-value ${treasuryBalance < 0 ? "cw-negative-text" : "cw-gold"}`}>₲ {money(treasuryBalance)}</strong></label><label>NEW AVAILABLE GOLD<input inputMode="decimal" value={treasuryForm.amount} onChange={e => setTreasuryForm({ ...treasuryForm, amount: formatMoneyInput(e.target.value) })} placeholder="0.00" /></label><label className="cw-span-2">WHY IS THE BALANCE BEING OVERRIDDEN? *<textarea value={treasuryForm.adminComment} onChange={e => setTreasuryForm({ ...treasuryForm, adminComment: e.target.value })} placeholder="Required. Example: Guild vault was counted manually and does not match the ledger." /></label></div><div className="cw-helper"><b>This does not erase history.</b> The system records only the difference between the current ledger balance and the new balance, along with your reason, date and account. Future Treasury activity continues from the corrected balance.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setTreasuryModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryOverride}>{saving ? "SAVING..." : "OVERRIDE & LOG BALANCE"}</button></div></Modal>}

    {adminConfirm && <Modal title={adminConfirm.title} wide onClose={() => setAdminConfirm(null)}><div className="cw-confirm-warning"><strong>ADMIN ACTION WILL BE LOGGED</strong><p>{adminConfirm.message}</p></div><label>ADMIN COMMENT *<textarea autoFocus value={adminConfirm.comment} onChange={e => setAdminConfirm({ ...adminConfirm, comment: e.target.value })} placeholder="Explain why you are making this change..." /></label><div className="cw-helper">This comment is stored in the Guild Notice Board with the action, changed record and administrator.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={() => setAdminConfirm(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={runAdminAction}>CONFIRM & LOG</button></div></Modal>}

    {auditDetail && <Modal title="ACTIVITY DETAILS" wide onClose={() => setAuditDetail(null)}><div className="cw-detail-grid"><div><small>ACTION</small><strong>{auditDetail.title || "Activity"}</strong></div><div><small>CREATED BY</small><strong>{auditDetail.createdBy || "System"}</strong></div><div><small>DATE & TIME</small><strong>{formatDateTime(auditDetail.createdAt || auditDetail.timestamp, resolvedTimezone)}</strong></div><div><small>MODULE</small><strong>{auditDetail.module === "treasury" ? "TREASURY" : "CLAN WAR"}</strong></div></div><div className="cw-detail-block"><small>DETAILS</small><p>{auditDetail.message || "—"}</p></div>{Array.isArray(auditDetail.details) && auditDetail.details.length > 0 && <div className="cw-detail-block"><small>RECORD</small><ul>{auditDetail.details.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}{Array.isArray(auditDetail.changes) && auditDetail.changes.length > 0 && <div className="cw-detail-block"><small>CHANGES</small><div className="cw-change-list">{auditDetail.changes.map((x, i) => <div key={i}><b>{x.field}</b><span>{x.from || "—"} → {x.to || "—"}</span></div>)}</div></div>}</Modal>}

  </div>;
}