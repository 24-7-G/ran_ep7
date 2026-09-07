import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  setDoc,
  writeBatch,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

import {
  PRIMARY_TIMEZONE,
  TIMEZONES,
  GUILD_CLASSES,
  CLASSES,
  BH_BOSSES,
  BH_CLAIM_THRESHOLD,
  DEFAULT_RAIDS,
} from "../lib/constants";

import {
  browserTimezone,
  zonedDateToUtc,
} from "../lib/time";

import "./BHPage.css";
import "./LIVE_ATTENDANCE_STATUS_PATCH.css";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";
import { buildAuditPayload } from "../lib/guildAudit";

import sonyaImage from "../bosses/sonya.png";
import geomancerImage from "../bosses/geomancer.png";
import giantHawkImage from "../bosses/giant-hawk.png";
import reflectorImage from "../bosses/reflector.png";
import duckRaceIcon from "../icons/duck-race.svg";

import swordmanIcon from "../icons/swordman.svg";
import archerIcon from "../icons/archer.svg";
import gunnerIcon from "../icons/gunner.svg";
import shamanIcon from "../icons/shaman.svg";
import extremeIcon from "../icons/extreme.svg";
import brawlerIcon from "../icons/brawler.svg";

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 10;
const PLAYER_PICKER_PAGE_SIZE = 5;

// Display numeric form fields with thousands separators while keeping the
// stored value safe for the existing numeric save/validation logic.
function formatNumericInput(value, allowDecimal = true) {
  if (value == null || value === "") return "";
  let raw = String(value).replace(/,/g, "").replace(/[^0-9.]/g, "");
  if (!allowDecimal) raw = raw.replace(/\./g, "");
  const firstDot = raw.indexOf(".");
  if (allowDecimal && firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
  }
  if (!raw) return "";
  const [whole, decimal = ""] = raw.split(".");
  const formattedWhole = whole ? Number(whole).toLocaleString("en-US") : "0";
  return allowDecimal && firstDot !== -1 ? `${formattedWhole}.${decimal}` : formattedWhole;
}
const SONYA_REWARD_COST = 6.0;

const DEFAULT_BOSS_LIST = BH_BOSSES?.length
  ? BH_BOSSES
  : [
    { id: "sonya", name: "Sonya", points: 1.0 },
    { id: "geomancer", name: "Geomancer", points: 0.2 },
    { id: "reflector", name: "Reflector", points: 0.2 },
    { id: "giant-hawk", name: "Giant Hawk", points: 0.2 },
  ];

const CLASS_OPTIONS =
  GUILD_CLASSES?.length
    ? GUILD_CLASSES
    : CLASSES?.length
      ? CLASSES
      : [
        "Swordman",
        "Archer",
        "Gunner",
        "Shaman",
        "Extreme",
        "Brawler",
      ];



/* =========================================================
   TYPE + SELECT COMBOBOX
   - Existing values are suggestions, not hard restrictions.
   - Users may type a brand-new value and keep it.
========================================================= */
function TypeSelect({
  value,
  onChange,
  options = [],
  id,
  placeholder = "Type or select...",
  className = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const current = String(value ?? "");
  const normalized = Array.from(new Map(
    options
      .map((option) => typeof option === "string" ? { value: option, label: option } : option)
      .filter((option) => option && String(option.value ?? "").trim())
      .map((option) => [String(option.value).trim().toLowerCase(), { value: String(option.value).trim(), label: String(option.label ?? option.value).trim() }])
  ).values());
  const query = current.toLowerCase().trim();
  const filtered = normalized.filter((option) => !query || option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query));

  useEffect(() => {
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const choose = (option) => {
    onChange(option.value);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className="ran-type-select" style={{ position: "relative", width: "100%" }}>
      <input
        id={id}
        className={className}
        value={current}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled && (
        <div
          className="ran-type-select-menu"
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 10000,
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            maxHeight: 230,
            overflowY: "auto",
            padding: 5,
            border: "1px solid rgba(0,183,255,.45)",
            borderRadius: 8,
            background: "#061923",
            boxShadow: "0 14px 35px rgba(0,0,0,.55)",
          }}
        >
          {filtered.length ? filtered.map((option, index) => (
            <button
              type="button"
              key={`${option.value}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              style={{
                display: "block",
                width: "100%",
                padding: "9px 10px",
                border: 0,
                borderRadius: 5,
                background: activeIndex === index ? "rgba(0,183,255,.16)" : "transparent",
                color: "#e9f7ff",
                textAlign: "left",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {option.label}
            </button>
          )) : (
            <div style={{ padding: "9px 10px", color: "#7899a8", fontSize: 11 }}>
              NEW VALUE — press Enter or keep typing
            </div>
          )}
          {current.trim() && !normalized.some((option) => option.value.toLowerCase() === current.trim().toLowerCase()) && (
            <div style={{ padding: "7px 10px", marginTop: 3, borderTop: "1px solid rgba(74,138,162,.18)", color: "#62e6ff", fontSize: 10, fontWeight: 800 }}>
              ✓ NEW VALUE: {current.trim()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function safeToDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return isValidDate(d) ? d : null;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isValidDate(d) ? d : null;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return isValidDate(d) ? d : null;
  }

  if (value?.seconds != null) {
    const d = new Date(
      Number(value.seconds) * 1000 +
      Math.floor(Number(value.nanoseconds || 0) / 1000000)
    );

    return isValidDate(d) ? d : null;
  }

  return null;
}

function partsInTimezone(date, timezone) {
  const d = safeToDate(date);
  if (!d) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || browserTimezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);

    const result = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
    }

    return result;
  } catch {
    return null;
  }
}

function dateKeyFromDate(date, timezone = PRIMARY_TIMEZONE) {
  const p = partsInTimezone(date, timezone);
  if (!p) return "";

  return `${p.year}-${p.month}-${p.day}`;
}

function timeKeyFromDate(date, timezone = PRIMARY_TIMEZONE) {
  const p = partsInTimezone(date, timezone);
  if (!p) return "";

  return `${p.hour}:${p.minute}`;
}

function formatDate(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "—";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

function formatLongDate(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "—";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

function timezoneAbbreviation(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "";

  if (timezone === "Asia/Manila") return "PHT";
  if (timezone === "UTC") return "UTC";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || PRIMARY_TIMEZONE,
      timeZoneName: "short",
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(d);

    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function formatTime(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "—";

  try {
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    const zone = timezoneAbbreviation(d, timezone);
    return zone ? `${time} ${zone}` : time;
  } catch {
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

function formatDateTime(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "—";

  return `${formatDate(d, timezone)} ${formatTime(d, timezone)}`;
}

function shiftDateKey(dateKey, amount) {
  if (!dateKey) return "";

  const [year, month, day] = dateKey.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return "";
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + amount);

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function zonedLocalToDate(dateKey, timeKey, timezone) {
  if (!dateKey || !timeKey) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  try {
    return zonedDateToUtc(
      dateKey,
      hour,
      minute,
      timezone || PRIMARY_TIMEZONE
    );
  } catch {
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute, 0, 0)
    );
  }
}

/* =========================================================
   BOSS HELPERS
========================================================= */

function bossSlug(value) {
  return lower(value)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getBossAliases(value) {
  const raw = clean(value);
  const slug = bossSlug(raw);

  const aliases = new Set([
    raw,
    lower(raw),
    slug,
  ]);

  if (slug === "giant-hawk") {
    aliases.add("gianthawk");
    aliases.add("giant_hawk");
  }

  if (slug === "geo-mancer") {
    aliases.add("geomancer");
  }

  return Array.from(aliases);
}

function findDefaultBoss(value) {
  const aliases = getBossAliases(value);

  return (
    DEFAULT_BOSS_LIST.find((boss) =>
      getBossAliases(boss.id).some((x) => aliases.includes(x))
    ) ||
    DEFAULT_BOSS_LIST.find((boss) =>
      getBossAliases(boss.name).some((x) => aliases.includes(x))
    ) ||
    null
  );
}

function bossLabel(value) {
  const found = findDefaultBoss(value);
  if (found) return found.name;

  return clean(value) || "Unknown Boss";
}

function normalizeBossId(value) {
  const found = findDefaultBoss(value);
  if (found) return found.id;

  return bossSlug(value);
}

function defaultBossPoints(value) {
  const found = findDefaultBoss(value);
  return found ? safeNumber(found.points, 0) : 0;
}

function bossPointsFromScoring(scoring, bossId) {
  const id = normalizeBossId(bossId);

  if (scoring?.bosses?.[id] != null) {
    return safeNumber(
      scoring.bosses[id],
      defaultBossPoints(id)
    );
  }

  if (scoring?.[id] != null) {
    return safeNumber(
      scoring[id],
      defaultBossPoints(id)
    );
  }

  return defaultBossPoints(id);
}

/* =========================================================
   RAID HELPERS
========================================================= */

function canonicalRaidId(raid) {
  return normalizeBossId(
    raid?.id ??
    raid?.raidId ??
    raid?.bossId ??
    raid?.name
  );
}

function normalizeRaidSource(raid) {
  if (!raid) return null;

  const id = canonicalRaidId(raid);
  if (!id) return null;

  const hour = Math.min(
    23,
    Math.max(0, safeNumber(raid.hour, 0))
  );

  const minute = Math.min(
    59,
    Math.max(0, safeNumber(raid.minute, 0))
  );

  const intervalRaw = safeNumber(
    raid.intervalHours,
    NaN
  );

  const intervalHours =
    Number.isFinite(intervalRaw) && intervalRaw > 0
      ? intervalRaw
      : null;

  const anchorHour = Math.min(
    23,
    Math.max(
      0,
      safeNumber(raid.anchorHour, hour)
    )
  );

  const anchorMinute = Math.min(
    59,
    Math.max(
      0,
      safeNumber(raid.anchorMinute, minute)
    )
  );

  const rawScheduleType = lower(
    raid.scheduleType
  );

  const scheduleType = [
    "daily",
    "weekly",
    "interval",
  ].includes(rawScheduleType)
    ? rawScheduleType
    : intervalHours
      ? "interval"
      : "daily";

  const days = Array.isArray(raid.days)
    ? raid.days.map(clean).filter(Boolean)
    : [];

  return {
    ...raid,
    id,
    name:
      clean(
        raid.name ??
        raid.bossName ??
        raid.title
      ) || bossLabel(id),
    type:
      clean(raid.type) ||
      "BOSS RAID",
    scheduleType,
    days,
    hour,
    minute,
    intervalHours,
    anchorDate:
      clean(raid.anchorDate) || null,
    anchorHour,
    anchorMinute,
    timezone:
      clean(raid.timezone) ||
      PRIMARY_TIMEZONE,
    active:
      raid.active !== false,
  };
}

function deduplicateRaids(raids) {
  const map = new Map();

  for (const raid of raids || []) {
    const normalized =
      normalizeRaidSource(raid);

    if (!normalized) continue;

    map.set(normalized.id, normalized);
  }

  return Array.from(map.values());
}

/* =========================================================
   CANONICAL SCHEDULE ENGINE
========================================================= */

function generateScheduleOccurrences(
  schedules,
  displayDateKeys,
  displayTimezone,
  scoring
) {
  const visibleKeys = new Set(displayDateKeys || []);
  if (!visibleKeys.size) return [];

  const sortedVisible = Array.from(visibleKeys).sort();
  const firstDisplayKey = sortedVisible[0];
  const lastDisplayKey = sortedVisible[sortedVisible.length - 1];

  /*
   * A display date is NOT necessarily the same calendar date in the
   * schedule's source timezone. For example, 12:00 AM Pacific can be
   * a different Philippines calendar day. Build the schedule in its
   * own configured timezone first, then convert the resulting instant
   * into the selected DISPLAY TIMEZONE.
   */
  const displayStart = zonedLocalToDate(
    shiftDateKey(firstDisplayKey, -1),
    "00:00",
    displayTimezone
  );
  const displayEnd = zonedLocalToDate(
    shiftDateKey(lastDisplayKey, 1),
    "23:59",
    displayTimezone
  );

  if (!displayStart || !displayEnd) return [];

  const result = [];

  const normalizeWeekday = (value) => {
    const raw = lower(value);
    if (raw === "0" || raw === "sun" || raw === "sunday") return 0;
    if (raw === "1" || raw === "mon" || raw === "monday") return 1;
    if (raw === "2" || raw === "tue" || raw === "tuesday") return 2;
    if (raw === "3" || raw === "wed" || raw === "wednesday") return 3;
    if (raw === "4" || raw === "thu" || raw === "thursday") return 4;
    if (raw === "5" || raw === "fri" || raw === "friday") return 5;
    if (raw === "6" || raw === "sat" || raw === "saturday") return 6;
    return -1;
  };

  const parseTime = (raid) => {
    let hour = safeNumber(raid?.hour, NaN);
    let minute = safeNumber(raid?.minute, NaN);

    const raw = clean(raid?.time ?? raid?.spawnTime ?? raid?.startTime);
    if (raw) {
      const match = raw.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (match) {
        hour = Number(match[1]);
        minute = Number(match[2]);
        const ap = lower(match[3]);
        if (ap === "pm" && hour < 12) hour += 12;
        if (ap === "am" && hour === 12) hour = 0;
      }
    }

    if (!Number.isFinite(hour)) hour = 0;
    if (!Number.isFinite(minute)) minute = 0;

    return {
      hour: Math.min(23, Math.max(0, Math.trunc(hour))),
      minute: Math.min(59, Math.max(0, Math.trunc(minute))),
    };
  };

  const addOccurrence = (sourceRaid, spawnAt) => {
    if (!(spawnAt instanceof Date) || Number.isNaN(spawnAt.getTime())) return;
    if (spawnAt < displayStart || spawnAt > displayEnd) return;

    const dateKey = dateKeyFromDate(spawnAt, displayTimezone);
    if (!visibleKeys.has(dateKey)) return;

    const raidId = canonicalRaidId(sourceRaid);
    const bossId = normalizeBossId(
      sourceRaid?.id ?? sourceRaid?.bossId ?? sourceRaid?.name
    );
    if (!raidId || !bossId) return;

    result.push({
      id: `${raidId}-${spawnAt.getTime()}`,
      occurrenceKey: `${raidId}-${spawnAt.getTime()}`,
      scheduleId: raidId,
      bossId,
      bossName:
        clean(sourceRaid?.name ?? sourceRaid?.bossName ?? sourceRaid?.title) ||
        bossLabel(bossId),
      points: bossPointsFromScoring(scoring, bossId),
      spawnAt,
      dateKey,
      timeKey: timeKeyFromDate(spawnAt, displayTimezone),
      primaryDateKey: dateKeyFromDate(spawnAt, PRIMARY_TIMEZONE),
      primaryTimeKey: timeKeyFromDate(spawnAt, PRIMARY_TIMEZONE),
      active: sourceRaid?.active !== false,
      raid: sourceRaid,
    });
  };

  for (const sourceRaid of schedules || []) {
    if (!sourceRaid) continue;

    const raid = normalizeRaidSource(sourceRaid);
    if (!raid) continue;

    const sourceTimezone = clean(raid.timezone) || PRIMARY_TIMEZONE;
    const { hour, minute } = parseTime(raid);
    const type = lower(raid.scheduleType);

    if (type === "interval") {
      const anchorDateKey = clean(raid.anchorDate);
      const intervalHours = Number(raid.intervalHours);
      if (!anchorDateKey || !Number.isFinite(intervalHours) || intervalHours <= 0) continue;

      const base = zonedLocalToDate(
        anchorDateKey,
        `${String(raid.anchorHour).padStart(2, "0")}:${String(raid.anchorMinute).padStart(2, "0")}`,
        sourceTimezone
      );
      if (!base) continue;

      const intervalMs = intervalHours * 60 * 60 * 1000;
      const startMs = displayStart.getTime();
      const endMs = displayEnd.getTime();
      const baseMs = base.getTime();

      let index = Math.ceil((startMs - baseMs) / intervalMs - 1e-10);
      if (!Number.isFinite(index)) continue;
      index = Math.max(0, index);

      for (let i = 0; i < 1000; i += 1) {
        const occurrenceMs = baseMs + index * intervalMs;
        if (occurrenceMs > endMs) break;
        if (occurrenceMs >= startMs) {
          addOccurrence(raid, new Date(occurrenceMs));
        }
        index += 1;
      }
      continue;
    }

    /* Daily and weekly schedules are generated using SOURCE calendar dates. */
    const sourceStartKey = dateKeyFromDate(displayStart, sourceTimezone);
    const sourceEndKey = dateKeyFromDate(displayEnd, sourceTimezone);

    let sourceKey = shiftDateKey(sourceStartKey, -1);
    const lastSourceKey = shiftDateKey(sourceEndKey, 1);

    for (let i = 0; i < 20 && sourceKey <= lastSourceKey; i += 1) {
      const localSpawn = zonedLocalToDate(
        sourceKey,
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        sourceTimezone
      );

      if (localSpawn) {
        let shouldAdd = true;

        if (type === "weekly") {
          const weekdayDate = zonedLocalToDate(sourceKey, "12:00", sourceTimezone);
          const weekday = weekdayDate ? weekdayDate.getUTCDay() : -1;
          const days = Array.isArray(raid.days) ? raid.days : [];
          shouldAdd = days.length > 0 && days.some((day) => normalizeWeekday(day) === weekday);
        }

        if (shouldAdd) addOccurrence(raid, localSpawn);
      }

      sourceKey = shiftDateKey(sourceKey, 1);
    }
  }

  const unique = new Map();
  for (const occurrence of result) {
    const key = `${occurrence.bossId}|${occurrence.spawnAt.getTime()}`;
    if (!unique.has(key)) unique.set(key, occurrence);
  }

  return Array.from(unique.values()).sort(
    (a, b) => a.spawnAt.getTime() - b.spawnAt.getTime()
  );
}
/* =========================================================
   NORMALIZERS
========================================================= */

function attendanceDate(
  row,
  timezone = PRIMARY_TIMEZONE
) {
  const spawnAt =
    safeToDate(row?.spawnAt);

  /*
   * IMPORTANT:
   * When spawnAt exists, calculate the calendar
   * date from the actual timestamp and current
   * display timezone.
   */
  if (spawnAt) {
    return dateKeyFromDate(
      spawnAt,
      timezone
    );
  }

  return (
    clean(row?.dateKey) ||
    clean(row?.localDate) ||
    clean(row?.primaryDateKey) ||
    ""
  );
}

function attendanceBossId(row) {
  return normalizeBossId(
    row?.bossId ??
    row?.boss ??
    row?.bossName
  );
}

function attendanceMatchesPlayer(
  row,
  playerId
) {
  return (
    clean(row?.playerId) ===
    clean(playerId)
  );
}

function occurrenceMatchesRow(
  row,
  occurrence
) {
  if (!row || !occurrence) {
    return false;
  }

  if (
    clean(row.occurrenceKey) &&
    clean(row.occurrenceKey) ===
    clean(
      occurrence.occurrenceKey
    )
  ) {
    return true;
  }

  const rowSchedule =
    clean(row.scheduleId);

  const occurrenceSchedule =
    clean(
      occurrence.scheduleId
    );

  const rowSpawn =
    safeToDate(row.spawnAt);

  const occurrenceSpawn =
    safeToDate(
      occurrence.spawnAt
    );

  if (
    rowSchedule &&
    occurrenceSchedule &&
    rowSchedule ===
    occurrenceSchedule &&
    rowSpawn &&
    occurrenceSpawn
  ) {
    return (
      rowSpawn.getTime() ===
      occurrenceSpawn.getTime()
    );
  }

  return false;
}

function normalizePlayer(
  snapshot
) {
  const data =
    snapshot.data() || {};
  const inferred = inferNoticeAuditFields(data);

  return {
    id: String(snapshot.id),
    ...data,
    ...inferred,
    ign:
      clean(
        data.ign ??
        data.name ??
        data.username
      ) || "Unknown",
    class: clean(data.class),
    weapon: clean(data.weapon),
    active:
      data.active !== false,
    createdAt:
      data.createdAt || null,
    updatedAt:
      data.updatedAt || null,
  };
}

function normalizeAttendance(
  snapshot
) {
  const data =
    snapshot.data() || {};

  const spawnAt =
    safeToDate(
      data.spawnAt
    ) ||
    safeToDate(
      data.createdAt
    );

  return {
    id: String(snapshot.id),
    ...data,
    playerId: clean(
      data.playerId
    ),
    playerName: clean(
      data.playerName ??
      data.ign
    ),
    bossId:
      attendanceBossId(data),
    bossName:
      clean(
        data.bossName ??
        data.boss
      ) ||
      bossLabel(
        data.bossId ??
        data.boss
      ),
    points:
      safeNumber(
        data.points,
        0
      ),
    dateKey:
      clean(data.dateKey) ||
      clean(data.localDate) ||
      (
        spawnAt
          ? dateKeyFromDate(
            spawnAt,
            PRIMARY_TIMEZONE
          )
          : ""
      ),
    timeKey:
      clean(data.timeKey) ||
      clean(data.localTime) ||
      (
        spawnAt
          ? timeKeyFromDate(
            spawnAt,
            PRIMARY_TIMEZONE
          )
          : ""
      ),
    primaryDateKey:
      clean(
        data.primaryDateKey
      ),
    primaryTimeKey:
      clean(
        data.primaryTimeKey
      ),
    spawnAt,
    scheduleId:
      clean(data.scheduleId) ||
      null,
    occurrenceKey:
      clean(
        data.occurrenceKey
      ) || null,
    status:
      clean(data.status) ||
      "recorded",
    manualOverride:
      data.manualOverride ===
      true,
    comment: clean(
      data.comment
    ),
    updatedAt:
      data.updatedAt || null,
    updatedBy:
      clean(
        data.updatedBy
      ),
    createdAt:
      data.createdAt || null,
  };
}

function normalizeReward(
  snapshot
) {
  const data =
    snapshot.data() || {};

  return {
    id: String(snapshot.id),
    ...data,
    name:
      clean(
        data.name ??
        data.rewardName ??
        data.title
      ) ||
      "Unnamed Reward",
    bossId:
      normalizeBossId(
        data.bossId ??
        data.boss ??
        data.bossName
      ),
    bossName:
      clean(
        data.bossName ??
        data.boss
      ) ||
      bossLabel(
        data.bossId ??
        data.boss
      ),
    cost:
      safeNumber(
        data.cost,
        0
      ),
    playerId:
      clean(data.playerId) ||
      null,
    playerName:
      clean(
        data.playerName ??
        data.ign
      ),
    status:
      clean(data.status) ||
      "available",
    spawnAt:
      safeToDate(
        data.spawnAt
      ),
    notes: clean(
      data.notes
    ),
    weaponClass: clean(
      data.weaponClass ?? data.class ?? data.weaponClassName
    ),
    createdAt:
      data.createdAt || null,
    createdBy: clean(data.createdBy),
    updatedAt:
      data.updatedAt || null,
    updatedBy: clean(data.updatedBy),
  };
}

function displayAuditText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\s*\((?:[A-Za-z0-9_-]{15,})\)/g, "")
    .replace(/\b(?:UID|User ID|Player ID|Reward ID|Claim ID|Schedule ID|Item ID|Treasury ID)\s*[:#-]?\s*[A-Za-z0-9_-]{8,}/gi, "")
    .replace(/\s*\/\s*[A-Za-z0-9_-]{15,}\b/g, "")
    .trim();
}

function normalizeDuckRaceStatus(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: String(snapshot.id),
    ...data,
    bossId: normalizeBossId(data.bossId ?? data.boss),
    dateKey: clean(data.dateKey),
    status: clean(data.status) || "not-yet",
    updatedAt: data.updatedAt || null,
    updatedBy: clean(data.updatedBy),
  };
}

function normalizeClaim(
  snapshot
) {
  const data =
    snapshot.data() || {};

  return {
    id: String(snapshot.id),
    ...data,
    playerId: clean(
      data.playerId
    ),
    playerName: clean(
      data.playerName ??
      data.ign
    ),
    rewardId: clean(
      data.rewardId
    ),
    rewardName: clean(
      data.rewardName
    ),
    bossId:
      normalizeBossId(
        data.bossId ??
        data.bossName
      ),
    bossName:
      clean(
        data.bossName
      ) ||
      bossLabel(
        data.bossId
      ),
    points:
      safeNumber(
        data.points ??
        data.cost,
        0
      ),
    claimedAt:
      safeToDate(
        data.claimedAt
      ) ||
      safeToDate(
        data.createdAt
      ),
    claimedBy:
      clean(
        data.claimedBy ??
        data.updatedBy
      ),
    status:
      clean(data.status) ||
      "claimed",
    notes: clean(
      data.notes
    ),
  };
}

function noticeDayKey(date, timezone) {
  const d = safeToDate(date);
  if (!d) return "";

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || PRIMARY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function isBossHuntNotice(notice) {
  const scope = lower(notice?.scope || notice?.area || notice?.source);
  const module = lower(notice?.module);
  const entityType = lower(notice?.entityType);
  const text = `${lower(notice?.title)} ${lower(notice?.message)} ${lower(notice?.action)} ${lower(notice?.bossName)} ${entityType}`;

  // HARD MODULE ISOLATION: Castle War, treasury, guild-bank/gold and other
  // independent systems must never enter the Boss Hunt notification board.
  if (
    module.startsWith("cw-") ||
    module === "castle-war" ||
    module === "treasury" ||
    module.startsWith("treasury-") ||
    module.startsWith("guild-treasury") ||
    module.startsWith("guild-bank") ||
    module.startsWith("cw_") ||
    module === "cw"
  ) return false;

  if (scope && ["castle-war", "castle_war", "cw", "cw-attendance", "treasury", "guild-treasury", "guild-bank"].includes(scope)) {
    return false;
  }

  // Explicit BH scopes/modules are accepted, but only after the independent
  // module rejection above. This prevents a wrongly tagged CW record from
  // leaking into the BH feed.
  if (scope) {
    // Raid Schedule is the master source for BH spawns. Its schedule audit
    // records belong on the BH unified Activity & Notifications board too.
    return [
      "boss-hunt",
      "boss_hunt",
      "bh",
      "bh-attendance",
      "bh-rewards",
      "bh-scoring",
      "bh-players",
      "bh-schedule",
      "raid-schedule"
    ].includes(scope);
  }

  if (module) {
    if (module === "raid-schedule") {
      return /(sonya|geomancer|giant hawk|reflector|boss hunt|boss spawn|duck race)/.test(text);
    }
    return module === "bh" || module === "boss-hunt" || module === "boss-hunt-attendance" || module.startsWith("bh-");
  }

  // Legacy records without scope/module must contain an unmistakable BH
  // identifier. Generic words such as "attendance", "item", "gold", or
  // "reward" alone are NOT enough to classify a record as Boss Hunt.
  return /(boss hunt|sonya|geomancer|giant hawk|reflector|duck race|bh attendance|boss spawn)/.test(text);
}

function resolveBossHuntNoticeModule(module, entityType, title, action) {
  const explicit = clean(module);
  if (explicit && explicit !== "bh-attendance") return explicit;
  const text = `${lower(entityType)} ${lower(title)} ${lower(action)}`;
  if (/attendance|present|absent/.test(text)) return "bh-attendance";
  if (/reward|claim|duck race/.test(text)) return "bh-rewards";
  if (/point|scoring|score/.test(text)) return "bh-scoring";
  if (/player|roster|character|ign/.test(text)) return "bh-players";
  if (/schedule|spawn/.test(text)) return "bh-schedule";
  return "bh-attendance";
}

function noticeCategoryKey(notice) {
  const title = lower(notice?.title);
  const message = lower(notice?.message);
  const module = lower(notice?.module);
  const action = lower(notice?.action);
  const entityType = lower(notice?.entityType);

  // IMPORTANT: legacy BH records may have been stored with an incorrect
  // category (for example, everything marked ATTENDANCE). Never trust that
  // persisted category. Derive the category from the actual BH event/action.
  // Boss names such as Sonya/Geomancer are data, NOT notification categories.
  const eventText = `${title} ${action} ${module} ${entityType}`;
  const fullText = `${eventText} ${message}`;

  // REWARD comes first because reward messages can mention attendance points,
  // players, or a boss. Claims, reward inventory changes and Duck Race events
  // are all reward activity.
  if (
    /reward|rewards|rewarded|claim|claimed|unclaimed|duck\s*race|weapon\s+reward|new\s+boss\s+hunt\s+reward/.test(eventText) ||
    /new\s+boss\s+hunt\s+reward/.test(fullText)
  ) {
    return "reward";
  }

  // ATTENDANCE is reserved for actual presence/attendance records.
  if (/attendance|present|absent|marked\s+(present|absent)/.test(eventText)) {
    return "attendance";
  }

  // POINTS covers explicit scoring/point-balance changes, separate from the
  // attendance event that may have caused the points to be earned.
  if (/point|points|scoring|score|balance\s+adjust|adjusted\s+.*point|deducted\s+.*point|awarded\s+.*point/.test(eventText)) {
    return "points";
  }

  // PLAYER covers roster/profile/class and player lifecycle changes.
  if (/player|roster|character|\bign\b|registered\s+player|player\s+profile|disabled\s+player|deleted\s+player/.test(eventText)) {
    return "player";
  }

  // SCHEDULE covers Boss Hunt spawn/schedule configuration.
  if (/schedule|spawn|raid\s+schedule|boss\s+spawn|occurrence|raid\s+time/.test(eventText)) {
    return "schedule";
  }

  // ADMIN is for administrative/configuration activity that is not a more
  // specific BH business event above.
  if (/admin|permission|settings|configuration|override|administrator/.test(eventText)) {
    return "admin";
  }

  return "system";
}

const NOTICE_CATEGORY_META = {
  reward: { label: "REWARD", colorClass: "reward" },
  attendance: { label: "ATTENDANCE", colorClass: "attendance" },
  points: { label: "POINTS", colorClass: "points" },
  player: { label: "PLAYER", colorClass: "player" },
  schedule: { label: "SCHEDULE", colorClass: "schedule" },
  admin: { label: "ADMIN", colorClass: "admin" },
  system: { label: "SYSTEM", colorClass: "system" },
};

function noticeTypeLabel(noticeOrType) {
  const key = typeof noticeOrType === "object"
    ? noticeCategoryKey(noticeOrType)
    : String(noticeOrType || "system").toLowerCase();
  return NOTICE_CATEGORY_META[key]?.label || "SYSTEM";
}

function NoticeCategoryIcon({ category }) {
  const key = category || "system";
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (key === "reward") return <svg {...common}><path d="M4 8h16v12H4z" /><path d="M3 8h18V5H3z" /><path d="M12 5v15" /><path d="M12 5c-3 0-4.5-1.1-4.5-2.5A2 2 0 0 1 9.4.8c1.7 0 2.8 2 2.6 4.2Z" /><path d="M12 5c3 0 4.5-1.1 4.5-2.5A2 2 0 0 0 14.6.8c-1.7 0-2.8 2-2.6 4.2Z" /></svg>;
  if (key === "attendance") return <svg {...common}><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M7 2.5v4M17 2.5v4M3.5 9h17" /><path d="m8 14 2.2 2.2L16.5 10" /></svg>;
  if (key === "points") return <svg {...common}><ellipse cx="8" cy="7" rx="4.5" ry="2.2" /><path d="M3.5 7v4c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V7" /><path d="M12.5 10.5c.8-.4 1.9-.6 3-.6 2.5 0 4.5 1 4.5 2.2v4c0 1.2-2 2.2-4.5 2.2s-4.5-1-4.5-2.2" /><path d="M3.5 11c0 1.2 2 2.2 4.5 2.2" /></svg>;
  if (key === "player") return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" /><path d="M4 20h16" /></svg>;
  if (key === "admin") return <svg {...common}><path d="M12 3 20 6v5c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6z" /><path d="M9 12h6M12 9v6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 10v5" /><path d="M12 7.2h.01" /></svg>;
}

function noticeCategoryClass(notice) {
  return NOTICE_CATEGORY_META[noticeCategoryKey(notice)]?.colorClass || "system";
}

function noticeSortNewestFirst(a, b) {
  const ad = safeToDate(a?.updatedAt || a?.createdAt || a?.timestamp)?.getTime() || 0;
  const bd = safeToDate(b?.updatedAt || b?.createdAt || b?.timestamp)?.getTime() || 0;
  return bd - ad;
}

function updatedTimeMs(row, ...fallbacks) {
  const values = [row?.updatedAt, ...fallbacks.map((key) => row?.[key])];
  for (const value of values) {
    const time = safeToDate(value)?.getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function inferNoticeAuditFields(data) {
  const title = clean(data?.title);
  const message = clean(data?.message);
  const text = `${title} ${message}`;
  const inferred = {};

  if (!data?.action) inferred.action = title;
  if (!data?.playerName) {
    const m = message.match(/^(.*?)\s+(?:was|received|claimed|attendance|\'s|only has)/i);
    if (m?.[1] && !/^(a player|player)$/i.test(m[1].trim())) inferred.playerName = clean(m[1]);
  }
  if (!data?.bossName) {
    const bosses = DEFAULT_BOSS_LIST.map((b) => b.name).sort((a, b) => b.length - a.length);
    const found = bosses.find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    if (found) inferred.bossName = found;
  }
  if (!data?.points) {
    const m = text.match(/(?:received|for|cost|points?|→)\s*(-?\d+(?:\.\d+)?)/i);
    if (m) inferred.points = safeNumber(m[1], 0);
  }
  if (!data?.status) {
    if (/deleted|removed/i.test(title)) inferred.status = "deleted";
    else if (/claimed/i.test(title)) inferred.status = "claimed";
    else if (/disabled/i.test(title)) inferred.status = "disabled";
    else if (/enabled/i.test(title)) inferred.status = "active";
    else if (/recorded|added/i.test(title)) inferred.status = "recorded";
  }
  inferred.details = Array.isArray(data?.details) ? data.details.filter(Boolean) : [];
  inferred.changes = Array.isArray(data?.changes) ? data.changes.filter(Boolean) : [];
  if (!inferred.details.length && message) inferred.details = [message];
  return inferred;
}

function normalizeNotice(
  snapshot
) {
  const data =
    snapshot.data() || {};
  const inferred = inferNoticeAuditFields(data);

  return {
    id: String(snapshot.id),
    ...data,
    ...inferred,
    scope:
      clean(data.scope),
    module:
      clean(data.module),
    title:
      clean(data.title) ||
      "Guild Notice",
    message: clean(
      data.message
    ),
    type:
      clean(data.type) ||
      "info",
    active:
      data.active !== false,
    createdAt:
      safeToDate(
        data.createdAt
      ),
    updatedAt:
      safeToDate(
        data.updatedAt
      ),
    createdBy:
      clean(
        data.createdBy
      ),
    createdByUid:
      clean(
        data.createdByUid
      ),
    timestamp: safeToDate(data.timestamp) || safeToDate(data.createdAt),
    action: clean(data.action) || inferred.action,
    entityType: clean(data.entityType) || inferred.entityType,
    entityId: clean(data.entityId),
    playerId: clean(data.playerId),
    playerName: clean(data.playerName) || inferred.playerName,
    bossId: clean(data.bossId),
    bossName: clean(data.bossName) || inferred.bossName,
    rewardId: clean(data.rewardId),
    rewardName: clean(data.rewardName),
    points: data.points == null ? (inferred.points ?? null) : safeNumber(data.points, 0),
    status: clean(data.status) || inferred.status,
    reason: clean(data.reason),
    notes: clean(data.notes),
    details: inferred.details,
    changes: inferred.changes,
    recipientPlayerId: clean(data.recipientPlayerId || data.playerId),
    recipientPlayerName: clean(data.recipientPlayerName || data.playerName),
    claimId: clean(data.claimId),
    itemId: clean(data.itemId),
    itemName: clean(data.itemName || data.item),
    treasuryId: clean(data.treasuryId),
    scheduleId: clean(data.scheduleId),
    connections: data.connections || null,
    connectionMap: Array.isArray(data.connectionMap) ? data.connectionMap : [],
  };
}

/* =========================================================
   SCORING
========================================================= */

function buildScoringDraft(
  scoring,
  raids
) {
  const draft = {};

  for (const boss of DEFAULT_BOSS_LIST) {
    draft[boss.id] =
      bossPointsFromScoring(
        scoring,
        boss.id
      );
  }

  for (const raid of raids || []) {
    const id =
      normalizeBossId(
        raid.id ??
        raid.name
      );

    if (!id) continue;

    if (draft[id] == null) {
      draft[id] =
        bossPointsFromScoring(
          scoring,
          id
        );
    }
  }

  return draft;
}

/* =========================================================
   UI HELPERS
========================================================= */

function TableScroller({
  children,
}) {
  return (
    <div className="bh-table-scroller">
      {children}
    </div>
  );
}

function formatRosterSince(value, timezone) {
  const date = safeToDate(value);
  if (!date) return "—";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || browserTimezone(),
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
}

/* =========================================================
   FIXED PLAYER PICKER
========================================================= */

function AttendancePlayerFilter({
  players,
  value,
  onChange,
  scheduleOccurrences = [],
  attendanceRows = [],
  todayKey,
  selectedScheduledSpawns = [],
  toggleScheduledSpawn,
  showTodaySchedule = true,
  onAddNewPlayer,
}) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  // This component has its own React scope, so use the global display timezone
  // directly instead of referencing BHPage's local effectiveTimezone variable.
  const { resolvedTimezone: attendanceDisplayTimezone } = useGlobalDisplayTimezone();

  const activePlayers = useMemo(
    () =>
      players
        .filter((player) => player.active)
        .slice()
        .sort((a, b) =>
          clean(a.ign).localeCompare(clean(b.ign), undefined, {
            sensitivity: "base",
            numeric: true,
          })
        ),
    [players]
  );

  const selected =
    activePlayers.find((player) => String(player.id) === String(value)) || null;

  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(activePlayers.map((player) => clean(player.class)).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [activePlayers]
  );

  const todayBosses = useMemo(
    () =>
      scheduleOccurrences
        .filter((occurrence) => occurrence.dateKey === todayKey)
        .slice()
        .sort((a, b) => String(a.timeKey).localeCompare(String(b.timeKey))),
    [scheduleOccurrences, todayKey]
  );

  const bossImage = (bossId) => {
    const id = normalizeBossId(bossId);
    if (id === "sonya") return sonyaImage;
    if (id === "geomancer") return geomancerImage;
    if (id === "reflector") return reflectorImage;
    if (id === "giant-hawk") return giantHawkImage;
    return null;
  };

  const classIcon = (className) => ({
    Swordman: swordmanIcon,
    Archer: archerIcon,
    Gunner: gunnerIcon,
    Shaman: shamanIcon,
    Extreme: extremeIcon,
    Brawler: brawlerIcon,
  }[className] || extremeIcon);

  const filteredPlayers = useMemo(() => {
    const q = lower(query.trim());
    return activePlayers.filter((player) => {
      const classMatches = classFilter === "all" || clean(player.class) === classFilter;
      if (!classMatches) return false;
      if (!q) return true;
      return [player.ign, player.class, player.weapon].some((field) =>
        lower(field).includes(q)
      );
    });
  }, [activePlayers, query, classFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PLAYER_PICKER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visiblePlayers = filteredPlayers.slice(
    (safePage - 1) * PLAYER_PICKER_PAGE_SIZE,
    safePage * PLAYER_PICKER_PAGE_SIZE
  );

  useEffect(() => setPage(1), [query, classFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
        setClassFilter("all");
        setPage(1);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const openRoster = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setOpen(true);
    setPage(1);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const closeRoster = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setOpen(false);
    setQuery("");
    setClassFilter("all");
    setPage(1);
  };

  const choosePlayer = (player) => {
    onChange(String(player.id));
    setOpen(false);
    setQuery("");
    setClassFilter("all");
    setPage(1);
  };

  const initials = selected
    ? clean(selected.ign)
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
    : "?";

  return (
    <section
      ref={rootRef}
      className="bh-form-group bh-attendance-player-field bh-player-picker-v6"
    >
      <div className="bh-picker-v6-section-head">
        <div className="bh-picker-v6-title-wrap">
          <span className="bh-picker-v6-title-icon">♙</span>
          <div>
            <span className="bh-picker-v6-kicker">PLAYER SELECTION</span>
            <h3>Choose a player</h3>
            <p>Choose a player from the active roster.</p>
          </div>
        </div>
        <div className="bh-picker-v6-active">
          <strong>{activePlayers.length}</strong>
          <span>ACTIVE</span>
        </div>
      </div>

      <div className="bh-picker-v6-controls">
        <div className="bh-picker-v6-search">
          <span>⌕</span>
          <input
            ref={searchRef}
            value={query}
            placeholder="Search player (IGN)..."
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeRoster(event);
            }}
          />
          {query && (
            <button type="button" onClick={() => {
              setQuery("");
              setPage(1);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}>×</button>
          )}
        </div>

        <select
          className="bh-picker-v6-class-filter"
          value={classFilter}
          onChange={(event) => {
            setClassFilter(event.target.value);
            setOpen(true);
          }}
          aria-label="Filter by class"
        >
          <option value="all">All Classes</option>
          {classOptions.map((className) => (
            <option key={className} value={className}>{className}</option>
          ))}
        </select>

        <button
          type="button"
          className="bh-picker-v6-browse"
          onClick={open ? closeRoster : openRoster}
          aria-expanded={open}
        >
          <span>☷</span>
          <b>{open ? "CLOSE ROSTER" : "BROWSE ROSTER"}</b>
        </button>

        {onAddNewPlayer && (
          <button
            type="button"
            className="bh-picker-v6-add-player"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              onAddNewPlayer();
            }}
          >
            <span>＋</span>
            <b>ADD NEW PLAYER</b>
          </button>
        )}

        {selected && (
          <button
            type="button"
            className="bh-picker-v6-clear"
            onClick={() => {
              onChange("");
              setQuery("");
              setClassFilter("all");
              setPage(1);
              setOpen(false);
            }}
          >
            <span>×</span>
            CLEAR
          </button>
        )}
      </div>

      <div className={`bh-picker-v6-selected-card ${selected ? "has-player" : "empty"}`}>
        <div className="bh-picker-v6-avatar">{initials}</div>
        <div className="bh-picker-v6-player-copy">
          <small>SELECTED PLAYER</small>
          <strong>{selected?.ign || "No player selected"}</strong>
          <span>
            {selected
              ? `${selected.class || "Unknown class"}${selected.weapon ? ` • ${selected.weapon}` : ""}`
              : "Select a player from the roster above."}
          </span>
          {selected && <i>● ONLINE</i>}
        </div>
        {selected && (
          <>
            <div className="bh-picker-v6-detail">
              <img src={classIcon(selected.class)} alt="" />
              <div><b>{selected.class || "UNKNOWN"}</b><small>CLASS</small></div>
            </div>
            <div className="bh-picker-v6-detail">
              <span className="bh-picker-v6-detail-glyph">⚔</span>
              <div><b>{selected.weapon || "—"}</b><small>WEAPON</small></div>
            </div>
            <div className="bh-picker-v6-detail bh-picker-v6-roster-since">
              <span className="bh-picker-v6-detail-glyph">♙</span>
              <div>
                <b>{formatRosterSince(selected.createdAt, attendanceDisplayTimezone)}</b>
                <small>ROSTER SINCE</small>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && showTodaySchedule && (
        <div className="bh-picker-v6-boss-section">
          <div className="bh-picker-v6-boss-head">
            <div>
              <span className="bh-picker-v6-title-icon">▣</span>
              <div><b>TODAY'S SCHEDULED BOSSES</b><small>Select a boss from the current day's schedule.</small></div>
            </div>
            <strong>{todayBosses.length} SPAWN{todayBosses.length === 1 ? "" : "S"}</strong>
          </div>

          {todayBosses.length ? (
            <div className="bh-picker-v6-boss-grid">
              {todayBosses.map((occurrence) => {
                const recordedRowsForOccurrence = attendanceRows.filter(
                  (row) => attendanceMatchesPlayer(row, value) && occurrenceMatchesRow(row, occurrence)
                );
                const alreadyRecorded = recordedRowsForOccurrence.length > 0;
                const checked = selectedScheduledSpawns.includes(occurrence.occurrenceKey);
                const recordedRow = recordedRowsForOccurrence[0] || null;
                const image = bossImage(occurrence.bossId);
                return (
                  <button
                    type="button"
                    key={occurrence.occurrenceKey}
                    className={`bh-picker-v6-boss-card ${checked ? "selected" : ""} ${alreadyRecorded ? "already" : ""}`}
                    disabled={alreadyRecorded}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleScheduledSpawn?.(occurrence.occurrenceKey);
                    }}
                  >
                    {image ? <img src={image} alt="" /> : <span className="bh-picker-v6-boss-fallback">◆</span>}
                    <span className="bh-picker-v6-boss-info">
                      <small>
                        {formatTime(
                          occurrence.spawnAt,
                          attendanceDisplayTimezone
                        )}
                      </small>
                      <b>{occurrence.bossName}</b>
                      <strong>+{safeNumber(occurrence.points, 0).toFixed(2)} pts</strong>
                      {alreadyRecorded && (
                        <em className="bh-picker-v6-boss-status">ALREADY ATTENDED</em>
                      )}
                      {alreadyRecorded && recordedRow && (
                        <span className="bh-picker-v6-boss-recorded-note">RECORDED — NOT AVAILABLE</span>
                      )}
                    </span>
                    <span className={`bh-picker-v6-boss-check ${alreadyRecorded ? "recorded" : ""}`}>{alreadyRecorded ? "✓" : checked ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bh-picker-v6-no-bosses">No boss spawns scheduled for today.</div>
          )}
        </div>
      )}

      {open && (
        <div id="bh-attendance-player-roster" className="bh-picker-v6-roster" onMouseDown={(event) => event.stopPropagation()}>
          <div className="bh-picker-v6-roster-head">
            <div><b>ACTIVE ROSTER</b><small>{query || classFilter !== "all" ? "FILTERED RESULTS" : "A–Z BY IGN"}</small></div>
            <span>{filteredPlayers.length} PLAYERS</span>
          </div>
          <div className="bh-picker-v6-table" role="table">
            <div className="bh-picker-v6-table-head"><span>#</span><span>IGN</span><span>CLASS</span><span>WEAPON</span></div>
            {visiblePlayers.length ? visiblePlayers.map((player, index) => {
              const number = (safePage - 1) * PLAYER_PICKER_PAGE_SIZE + index + 1;
              const isSelected = String(player.id) === String(value);
              return (
                <button type="button" key={String(player.id)} className={`bh-picker-v6-player-row ${isSelected ? "selected" : ""}`} onClick={() => choosePlayer(player)}>
                  <span>{number}</span>
                  <strong>{player.ign || "Unknown"}</strong>
                  <span>{player.class || "—"}</span>
                  <span>{player.weapon || "—"}</span>
                </button>
              );
            }) : <div className="bh-picker-v6-empty">NO PLAYERS FOUND</div>}
          </div>
          <div className="bh-picker-v6-footer">
            <span>{filteredPlayers.length ? `${(safePage - 1) * PLAYER_PICKER_PAGE_SIZE + 1}–${Math.min(safePage * PLAYER_PICKER_PAGE_SIZE, filteredPlayers.length)} of ${filteredPlayers.length}` : "0 players"}</span>
            {filteredPlayers.length > PLAYER_PICKER_PAGE_SIZE && (
              <div className="bh-picker-v6-pagination">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                <b>{safePage}</b><span>/ {totalPages}</span>
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>›</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function BHPage({ user: appUser, isAdmin: appIsAdmin }) {
  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    isAdmin,
    setIsAdmin,
  ] = useState(false);

  const [
    players,
    setPlayers,
  ] = useState([]);

  const [
    attendanceRows,
    setAttendanceRows,
  ] = useState([]);

  const [
    schedules,
    setSchedules,
  ] = useState(() =>
    deduplicateRaids(DEFAULT_RAIDS || [])
  );

  const [
    rewards,
    setRewards,
  ] = useState([]);

  const [
    rewardClaims,
    setRewardClaims,
  ] = useState([]);

  const [
    duckRaceStatuses,
    setDuckRaceStatuses,
  ] = useState([]);

  const [
    duckRaceSaving,
    setDuckRaceSaving,
  ] = useState(false);

  const [
    guildNotices,
    setGuildNotices,
  ] = useState([]);

  const [
    scoring,
    setScoring,
  ] = useState(null);

  const [
    scoringHistory,
    setScoringHistory,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    activeTab,
    setActiveTab,
  ] = useState(() => {
    try {
      const saved = localStorage.getItem("bh-active-tab");
      return ["schedule", "players", "rewards"].includes(saved)
        ? saved
        : "schedule";
    } catch {
      return "schedule";
    }
  });

  // Activity & Notifications is intentionally page-local. When the user
  // switches between Boss Hunt and Clan War, the previous page's drawer
  // must always start closed.
  const [noticePanelOpen, setNoticePanelOpen] = useState(false);

  /* Exactly three primary navigation views. Activity & Notifications is an independent slide-down audit panel. */
  const switchActiveTab = (nextTab) => {
    if (!["schedule", "players", "rewards"].includes(nextTab)) return;

    // IMPORTANT: Top BH navigation is completely normal for every user.
    // Guests and regular users are NOT redirected when they click the
    // Schedule, Players & History, or Rewards navigation tabs.
    // The guest/regular-user redirect exists ONLY on individual spawn cards
    // in the Actual Schedule table below.
    setActiveTab(nextTab);

    try {
      localStorage.setItem("bh-active-tab", nextTab);
    } catch {
      // Navigation still works if localStorage is unavailable.
    }
  };

  const toggleNoticePanel = () => {
    // IMPORTANT: Activity & Notifications navigation is also left alone.
    // Do not redirect guests/regular users from the top navigation. Any
    // existing read/write restrictions inside the panel remain independent.
    setNoticePanelOpen((open) => !open);
  };

  const [noticeNewPage, setNoticeNewPage] = useState(1);
  const [noticeOldPage, setNoticeOldPage] = useState(1);
  const [noticeAllPage, setNoticeAllPage] = useState(1);
  const [noticeSearch, setNoticeSearch] = useState("");
  const [noticeTypeFilter, setNoticeTypeFilter] = useState("all");
  const [noticeTimeFilter, setNoticeTimeFilter] = useState("all");
  const [noticeAdminFilter, setNoticeAdminFilter] = useState("all");
  const [noticeDateFilter, setNoticeDateFilter] = useState("");
  const [noticeFromTime, setNoticeFromTime] = useState("11:00");
  const [noticeToTime, setNoticeToTime] = useState("03:00");
  const [selectedNotice, setSelectedNotice] = useState(null);

  /*
   * Match Raid Schedule behavior:
   * - Automatic uses the visitor's browser timezone.
   * - A selected timezone is used only for display.
   * - Stored attendance/schedule timestamps are NOT changed.
   */
  const { displayTimezone, resolvedTimezone } = useGlobalDisplayTimezone();

  const [
    clockTick,
    setClockTick,
  ] = useState(Date.now());

  const [
    scheduleBackDays,
    setScheduleBackDays,
  ] = useState(0);

  const [
    scheduleForwardDays,
    setScheduleForwardDays,
  ] = useState(0);

  const [
    scheduleBossFilter,
    setScheduleBossFilter,
  ] = useState("all");

  const [
    scheduleStatusFilter,
    setScheduleStatusFilter,
  ] = useState("all");

  const [
    selectedScheduleDate,
    setSelectedScheduleDate,
  ] = useState("");

  const [
    attendanceModalOpen,
    setAttendanceModalOpen,
  ] = useState(false);

  const [
    attendanceMode,
    setAttendanceMode,
  ] = useState("scheduled");

  const [
    attendancePlayerId,
    setAttendancePlayerId,
  ] = useState("");

  const [
    selectedScheduledSpawns,
    setSelectedScheduledSpawns,
  ] = useState([]);

  const [
    attendanceComment,
    setAttendanceComment,
  ] = useState("");

  const [
    attendanceSaving,
    setAttendanceSaving,
  ] = useState(false);

  /* Bulk scheduled attendance: multiple EXISTING roster players against
     multiple EXISTING scheduled spawn occurrences. No arbitrary date can
     create a new scheduled record. */
  const [bulkAttendanceOpen, setBulkAttendanceOpen] = useState(false);
  const [bulkAttendanceDate, setBulkAttendanceDate] = useState("");
  const [bulkAttendanceSpawns, setBulkAttendanceSpawns] = useState([]);
  const [bulkAttendancePlayers, setBulkAttendancePlayers] = useState([]);
  const [bulkAttendanceSearch, setBulkAttendanceSearch] = useState("");
  const [bulkAttendanceClassFilter, setBulkAttendanceClassFilter] = useState("all");
  const [bulkAttendanceStatusFilter, setBulkAttendanceStatusFilter] = useState("all");
  const [bulkAttendancePage, setBulkAttendancePage] = useState(1);
  const [bulkAttendanceComment, setBulkAttendanceComment] = useState("");
  const [bulkAttendanceError, setBulkAttendanceError] = useState("");
  const [bulkAttendanceSaving, setBulkAttendanceSaving] = useState(false);

  const [
    addPlayerModalOpen,
    setAddPlayerModalOpen,
  ] = useState(false);

  const [bulkToolsModal, setBulkToolsModal] = useState(null);
  const [bulkToolsMode, setBulkToolsMode] = useState("menu");
  const [bulkToolsSelected, setBulkToolsSelected] = useState([]);
  const [bulkToolsSearch, setBulkToolsSearch] = useState("");
  const [bulkToolsFrom, setBulkToolsFrom] = useState("");
  const [bulkToolsTo, setBulkToolsTo] = useState("");
  const [bulkToolsPage, setBulkToolsPage] = useState(1);
  const [bulkToolsComment, setBulkToolsComment] = useState("");
  const [bulkToolsSaving, setBulkToolsSaving] = useState(false);
  const [bulkToolsError, setBulkToolsError] = useState("");
  const [bulkToolsPoints, setBulkToolsPoints] = useState("");
  const [bulkToolsClass, setBulkToolsClass] = useState("");
  const [bulkToolsWeapon, setBulkToolsWeapon] = useState("");
  const [bulkToolsStatus, setBulkToolsStatus] = useState("available");
  const [bulkToolsNotes, setBulkToolsNotes] = useState("");
  const [bulkToolsPin, setBulkToolsPin] = useState("");
  const [bulkPlayerGroups, setBulkPlayerGroups] = useState([{ id: 1, igns: "", className: CLASS_OPTIONS[0] || "Swordman", weapon: "" }]);
  const [bulkPlayerSaving, setBulkPlayerSaving] = useState(false);
  const [bulkPlayerError, setBulkPlayerError] = useState("");

  const [
    attendanceSelectedDate,
    setAttendanceSelectedDate,
  ] = useState("");

  const [
    overrideDate,
    setOverrideDate,
  ] = useState("");

  const [
    overrideTime,
    setOverrideTime,
  ] = useState("12:00");

  const [
    overrideBoss,
    setOverrideBoss,
  ] = useState(
    DEFAULT_BOSS_LIST[0]?.id ||
    "sonya"
  );

  const [
    overridePoints,
    setOverridePoints,
  ] = useState(1);

  const [
    overrideComment,
    setOverrideComment,
  ] = useState("");

  const [
    historyPlayer,
    setHistoryPlayer,
  ] = useState(null);

  const [
    historyPage,
    setHistoryPage,
  ] = useState(1);

  const [
    historySearch,
    setHistorySearch,
  ] = useState("");

  const [
    historyTab,
    setHistoryTab,
  ] = useState("all");

  const [
    playerSearch,
    setPlayerSearch,
  ] = useState("");

  const [
    playerClassFilter,
    setPlayerClassFilter,
  ] = useState("all");

  const [
    playerPage,
    setPlayerPage,
  ] = useState(1);

  const [
    rewardSearch,
    setRewardSearch,
  ] = useState("");

  const [
    rewardBossFilter,
    setRewardBossFilter,
  ] = useState("all");

  const [
    rewardStatusFilter,
    setRewardStatusFilter,
  ] = useState("all");

  const [
    rewardPage,
    setRewardPage,
  ] = useState(1);

  const [
    newPlayerIgn,
    setNewPlayerIgn,
  ] = useState("");

  const [
    newPlayerClass,
    setNewPlayerClass,
  ] = useState(
    CLASS_OPTIONS[0] || ""
  );

  const [
    newPlayerWeapon,
    setNewPlayerWeapon,
  ] = useState("");

  const [
    scoringDraft,
    setScoringDraft,
  ] = useState({});

  const [
    scoringComment,
    setScoringComment,
  ] = useState("");

  const [
    scoringSaving,
    setScoringSaving,
  ] = useState(false);

  const [
    rewardForm,
    setRewardForm,
  ] = useState({
    name: "",
    bossId:
      DEFAULT_BOSS_LIST[0]?.id ||
      "sonya",
    cost: 6,
    weaponClass: CLASS_OPTIONS[0] || "",
    playerId: "",
    status: "available",
    spawnAt: "",
    notes: "",
  });

  const [
    rewardSaving,
    setRewardSaving,
  ] = useState(false);

  // Busy state for claiming a reward from the inventory table.
  // Kept separate from rewardSaving so reward form actions cannot interfere
  // with an in-progress claim.
  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    editingReward,
    setEditingReward,
  ] = useState(null);

  const [
    selectedRewardInventory,
    setSelectedRewardInventory,
  ] = useState(null);

  const [
    editingRewardClaim,
    setEditingRewardClaim,
  ] = useState(null);

  const [
    editingPlayer,
    setEditingPlayer,
  ] = useState(null);

  const [
    deletePlayerTarget,
    setDeletePlayerTarget,
  ] = useState(null);

  const [
    deletePlayerPin,
    setDeletePlayerPin,
  ] = useState("");

  const [
    deletePlayerBusy,
    setDeletePlayerBusy,
  ] = useState(false);

  const [
    editingAttendance,
    setEditingAttendance,
  ] = useState(null);

  const [
    editAttendanceBoss,
    setEditAttendanceBoss,
  ] = useState("");

  const [
    editAttendanceDate,
    setEditAttendanceDate,
  ] = useState("");

  const [
    editAttendanceTime,
    setEditAttendanceTime,
  ] = useState("");

  const [
    editAttendancePoints,
    setEditAttendancePoints,
  ] = useState(0);

  const [
    editAttendanceComment,
    setEditAttendanceComment,
  ] = useState("");

  const loadStartedRef =
    useRef(false);

  /* =========================================================
     AUTH
  ========================================================= */

  useEffect(() => {
    // App.jsx is the single source of truth for administrator authorization.
    // BH previously performed its own bootstrap-UID-only check, which caused
    // newly registered administrators to see VIEW ONLY even while the header
    // correctly showed ADMIN. Keep the local state for existing BH logic, but
    // mirror the authoritative App-level user/admin state.
    setCurrentUser(appUser || null);
    setIsAdmin(Boolean(appUser && appIsAdmin));
  }, [appUser, appIsAdmin]);

  // IMPORTANT: do not force guests/regular users onto Players & History on
  // mount or on every auth-state update. They may still view an existing
  // read-only BH screen. The restriction is action-based: only when they
  // click a protected BH tab do we redirect that navigation to Players &
  // History. This keeps normal navigation and back/forward behavior intact.

  /* =========================================================
     CLOCK
  ========================================================= */

  useEffect(() => {
    const timer =
      setInterval(() => {
        setClockTick(
          Date.now()
        );
      }, 30000);

    return () =>
      clearInterval(timer);
  }, []);

  /* =========================================================
     TIMEZONE
  ========================================================= */

  /*
   * This is the single timezone used by the BH UI.
   * Keep the schedule's configured/server timezone separate from
   * the display timezone.  Changing the selector must never rewrite
   * the underlying Firebase timestamps.
   */
  const effectiveTimezone = resolvedTimezone;

  const todayKey = useMemo(
    () =>
      dateKeyFromDate(
        new Date(clockTick),
        effectiveTimezone
      ),
    [
      clockTick,
      effectiveTimezone,
    ]
  );

  const sortedGuildNotices = useMemo(
    () => [...guildNotices].sort(noticeSortNewestFirst),
    [guildNotices]
  );

  const boardNotices = useMemo(() => {
    const search = noticeSearch.trim().toLowerCase();
    return sortedGuildNotices.filter((notice) => {
      if (noticeTypeFilter !== "all" && noticeCategoryKey(notice) !== noticeTypeFilter) {
        return false;
      }
      if (!search) return true;
      const haystack = [
        notice.title,
        notice.message,
        notice.createdBy,
        notice.module,
        notice.type,
        notice.playerName,
        notice.rewardName,
        notice.bossName,
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [sortedGuildNotices, noticeSearch, noticeTypeFilter]);

  const newNotices = useMemo(
    () =>
      boardNotices.filter(
        (notice) => noticeDayKey(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone) === todayKey
      ),
    [boardNotices, effectiveTimezone, todayKey]
  );

  const oldNotices = useMemo(
    () =>
      boardNotices.filter(
        (notice) => {
          const day = noticeDayKey(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone);
          return Boolean(day) && day !== todayKey;
        }
      ),
    [boardNotices, effectiveTimezone, todayKey]
  );

  const filteredAllNotices = useMemo(() => {
    const now = new Date(clockTick).getTime();
    const search = noticeSearch.trim().toLowerCase();

    return sortedGuildNotices.filter((notice) => {
      if (noticeTypeFilter !== "all" && noticeCategoryKey(notice) !== noticeTypeFilter) {
        return false;
      }

      if (noticeAdminFilter !== "all" && String(notice.createdBy || "System") !== noticeAdminFilter) {
        return false;
      }

      if (noticeTimeFilter !== "all") {
        const created = safeToDate(notice.updatedAt || notice.createdAt || notice.timestamp)?.getTime();
        if (!created) return false;
        const ageDays = (now - created) / 86400000;
        if (noticeTimeFilter === "today" && noticeDayKey(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone) !== todayKey) return false;
        if (noticeTimeFilter === "7" && ageDays > 7) return false;
        if (noticeTimeFilter === "30" && ageDays > 30) return false;
      }

      // Exact local-calendar date/time filter. If the end time is earlier than
      // the start time, the range intentionally crosses midnight (e.g. 11:00 AM → 3:00 AM).
      if (noticeDateFilter) {
        const day = noticeDayKey(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone);
        const from = noticeFromTime || "00:00";
        const to = noticeToTime || "23:59";
        const [fh, fm] = from.split(":").map(Number);
        const [th, tm] = to.split(":").map(Number);
        const fromMinutes = (fh || 0) * 60 + (fm || 0);
        const toMinutes = (th || 0) * 60 + (tm || 0);
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: effectiveTimezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        }).formatToParts(safeToDate(notice.createdAt));
        const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
        const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
        const localMinutes = hour * 60 + minute;
        if (fromMinutes <= toMinutes) {
          if (day !== noticeDateFilter || localMinutes < fromMinutes || localMinutes > toMinutes) return false;
        } else {
          const nextDay = new Date(`${noticeDateFilter}T12:00:00Z`);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          const nextDateKey = nextDay.toISOString().slice(0, 10);
          const inRange = (day === noticeDateFilter && localMinutes >= fromMinutes) ||
            (day === nextDateKey && localMinutes <= toMinutes);
          if (!inRange) return false;
        }
      }

      if (search) {
        const haystack = [
          notice.title,
          notice.message,
          notice.createdBy,
          notice.module,
          notice.type,
        ].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [
    sortedGuildNotices,
    noticeSearch,
    noticeTypeFilter,
    noticeTimeFilter,
    noticeAdminFilter,
    noticeDateFilter,
    noticeFromTime,
    noticeToTime,
    clockTick,
    effectiveTimezone,
    todayKey,
  ]);

  const noticeAdmins = useMemo(
    () => Array.from(new Set(sortedGuildNotices.map((n) => n.createdBy || "System"))).sort((a, b) => a.localeCompare(b)),
    [sortedGuildNotices]
  );

  const NOTICE_PAGE_SIZE = 10;
  const newNoticePageCount = Math.max(1, Math.ceil(newNotices.length / NOTICE_PAGE_SIZE));
  const oldNoticePageCount = Math.max(1, Math.ceil(oldNotices.length / NOTICE_PAGE_SIZE));
  const allNoticePageCount = Math.max(1, Math.ceil(filteredAllNotices.length / NOTICE_PAGE_SIZE));

  const safeNewPage = Math.min(noticeNewPage, newNoticePageCount);
  const safeOldPage = Math.min(noticeOldPage, oldNoticePageCount);
  const safeAllPage = Math.min(noticeAllPage, allNoticePageCount);

  const pagedNewNotices = newNotices.slice(
    (safeNewPage - 1) * NOTICE_PAGE_SIZE,
    safeNewPage * NOTICE_PAGE_SIZE
  );
  const pagedOldNotices = oldNotices.slice(
    (safeOldPage - 1) * NOTICE_PAGE_SIZE,
    safeOldPage * NOTICE_PAGE_SIZE
  );
  const pagedAllNotices = filteredAllNotices.slice(
    (safeAllPage - 1) * NOTICE_PAGE_SIZE,
    safeAllPage * NOTICE_PAGE_SIZE
  );

  const openAllNotifications = () => {
    setNoticePanelOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("bh-notifications-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  /* =========================================================
     LOAD ALL DATA
  ========================================================= */

  const loadAllData =
    async () => {
      setLoading(true);

      try {
        setError("");

        const [
          playersSnap,
          attendanceSnap,
          raidsSnap,
          rewardsSnap,
          claimsSnap,
          duckRaceSnap,
          scoringSnap,
          scoringHistorySnap,
          noticesSnap,
        ] = await Promise.all([
          getDocs(
            collection(
              db,
              "players"
            )
          ),

          getDocs(
            collection(
              db,
              "bhAttendance"
            )
          ),

          getDocs(
            collection(
              db,
              "raids"
            )
          ),

          getDocs(
            collection(
              db,
              "bhRewards"
            )
          ),

          getDocs(
            collection(
              db,
              "bhRewardClaims"
            )
          ),

          getDocs(
            collection(
              db,
              "bhDuckRaceStatus"
            )
          ),

          getDoc(
            doc(
              db,
              "bhScoring",
              "current"
            )
          ),

          getDocs(
            collection(
              db,
              "bhScoringHistory"
            )
          ),

          getDocs(
            collection(
              db,
              "guildNotices"
            )
          ),
        ]);

        const loadedPlayers =
          playersSnap.docs
            .map(
              normalizePlayer
            )
            .sort(
              (a, b) =>
                lower(
                  a.ign
                ).localeCompare(
                  lower(
                    b.ign
                  )
                )
            );

        const loadedAttendance =
          attendanceSnap.docs
            .map(
              normalizeAttendance
            )
            .sort(
              (a, b) => {
                const ad =
                  safeToDate(
                    a.spawnAt
                  )?.getTime() ||
                  0;

                const bd =
                  safeToDate(
                    b.spawnAt
                  )?.getTime() ||
                  0;

                return bd - ad;
              }
            );

        const loadedFirebaseRaids =
          raidsSnap.docs.map(
            (snap) => ({
              id: snap.id,
              ...snap.data(),
            })
          );

        /*
         * DEFAULT_RAIDS are only fallback/default
         * definitions. Firestore raids override
         * matching IDs.
         */
        const loadedRaids =
          deduplicateRaids([
            ...DEFAULT_RAIDS,
            ...loadedFirebaseRaids,
          ]);

        const loadedRewards =
          rewardsSnap.docs
            .map(
              normalizeReward
            )
            .sort(
              (a, b) =>
                lower(
                  a.name
                ).localeCompare(
                  lower(
                    b.name
                  )
                )
            );

        const loadedDuckRaceStatuses =
          duckRaceSnap.docs.map(normalizeDuckRaceStatus);

        const loadedClaims =
          claimsSnap.docs
            .map(
              normalizeClaim
            )
            .sort(
              (a, b) => {
                const ad =
                  safeToDate(
                    a.claimedAt
                  )?.getTime() ||
                  0;

                const bd =
                  safeToDate(
                    b.claimedAt
                  )?.getTime() ||
                  0;

                return bd - ad;
              }
            );

        const loadedScoring =
          scoringSnap.exists()
            ? scoringSnap.data()
            : {
              bosses: {},
            };

        const loadedScoringHistory =
          scoringHistorySnap.docs
            .map((snap) => ({
              id: String(
                snap.id
              ),
              ...snap.data(),
              createdAt:
                safeToDate(
                  snap.data()
                    ?.createdAt
                ),
            }))
            .sort(
              (a, b) => {
                const ad =
                  a.createdAt?.getTime() ||
                  0;

                const bd =
                  b.createdAt?.getTime() ||
                  0;

                return bd - ad;
              }
            );

        const loadedNotices =
          noticesSnap.docs
            .map(
              normalizeNotice
            )
            .filter(
              (notice) =>
                notice.active !==
                false &&
                isBossHuntNotice(notice)
            )
            .sort(
              (a, b) => {
                const ad =
                  a.createdAt?.getTime() ||
                  0;

                const bd =
                  b.createdAt?.getTime() ||
                  0;

                return bd - ad;
              }
            );

        setPlayers(
          loadedPlayers
        );

        setAttendanceRows(
          loadedAttendance
        );

        setSchedules(
          loadedRaids
        );

        setRewards(
          loadedRewards
        );

        setRewardClaims(
          loadedClaims
        );

        setDuckRaceStatuses(loadedDuckRaceStatuses);

        setScoring(
          loadedScoring
        );

        setScoringHistory(
          loadedScoringHistory
        );

        setGuildNotices(
          loadedNotices
        );

        setScoringDraft(
          buildScoringDraft(
            loadedScoring,
            loadedRaids
          )
        );
      } catch (
      primaryError
      ) {
        console.error(
          "BH load error:",
          primaryError
        );

        try {
          const [
            playersSnap,
            attendanceSnap,
            raidsSnap,
            rewardsSnap,
            claimsSnap,
            duckRaceSnap,
            scoringSnap,
            scoringHistorySnap,
          ] =
            await Promise.all([
              getDocs(
                collection(
                  db,
                  "players"
                )
              ),

              getDocs(
                collection(
                  db,
                  "bhAttendance"
                )
              ),

              getDocs(
                collection(
                  db,
                  "raids"
                )
              ),

              getDocs(
                collection(
                  db,
                  "bhRewards"
                )
              ),

              getDocs(
                collection(
                  db,
                  "bhRewardClaims"
                )
              ),

              getDocs(
                collection(
                  db,
                  "bhDuckRaceStatus"
                )
              ),

              getDoc(
                doc(
                  db,
                  "bhScoring",
                  "current"
                )
              ),

              getDocs(
                collection(
                  db,
                  "bhScoringHistory"
                )
              ),
            ]);

          const loadedPlayers =
            playersSnap.docs
              .map(
                normalizePlayer
              )
              .sort(
                (a, b) =>
                  lower(
                    a.ign
                  ).localeCompare(
                    lower(
                      b.ign
                    )
                  )
              );

          const loadedAttendance =
            attendanceSnap.docs
              .map(
                normalizeAttendance
              )
              .sort(
                (a, b) => {
                  const ad =
                    safeToDate(
                      a.spawnAt
                    )?.getTime() ||
                    0;

                  const bd =
                    safeToDate(
                      b.spawnAt
                    )?.getTime() ||
                    0;

                  return bd - ad;
                }
              );

          const loadedFirebaseRaids =
            raidsSnap.docs.map(
              (snap) => ({
                id: snap.id,
                ...snap.data(),
              })
            );

          const loadedRaids =
            deduplicateRaids([
              ...DEFAULT_RAIDS,
              ...loadedFirebaseRaids,
            ]);

          const loadedRewards =
            rewardsSnap.docs.map(
              normalizeReward
            );

          const loadedDuckRaceStatuses =
            duckRaceSnap.docs.map(normalizeDuckRaceStatus);

          const loadedClaims =
            claimsSnap.docs.map(
              normalizeClaim
            );

          const loadedScoring =
            scoringSnap.exists()
              ? scoringSnap.data()
              : {
                bosses: {},
              };

          const loadedScoringHistory =
            scoringHistorySnap.docs
              .map((snap) => ({
                id: String(
                  snap.id
                ),
                ...snap.data(),
                createdAt:
                  safeToDate(
                    snap.data()
                      ?.createdAt
                  ),
              }))
              .sort(
                (a, b) => {
                  const ad =
                    a.createdAt?.getTime() ||
                    0;

                  const bd =
                    b.createdAt?.getTime() ||
                    0;

                  return bd - ad;
                }
              );

          setPlayers(
            loadedPlayers
          );

          setAttendanceRows(
            loadedAttendance
          );

          setSchedules(
            loadedRaids
          );

          setRewards(
            loadedRewards
          );

          setRewardClaims(
            loadedClaims
          );

          setDuckRaceStatuses(loadedDuckRaceStatuses);

          setScoring(
            loadedScoring
          );

          setScoringHistory(
            loadedScoringHistory
          );

          setGuildNotices([]);

          setScoringDraft(
            buildScoringDraft(
              loadedScoring,
              loadedRaids
            )
          );

          setError(
            "Boss Hunt loaded. Guild notifications could not be loaded."
          );
        } catch (
        fallbackError
        ) {
          console.error(
            "BH fallback load error:",
            fallbackError
          );

          setError(
            fallbackError?.message ||
            primaryError?.message ||
            "Unable to load Boss Hunt data."
          );
        }
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (
      !loadStartedRef.current
    ) {
      loadStartedRef.current =
        true;

      loadAllData();
    }
  }, []);

  /* =========================================================
     LIVE FIRESTORE DATA
     Keep the dashboard current without manual refresh.
     Long-lived listeners receive changed documents instead of
     repeatedly re-reading every collection on a timer.
  ========================================================= */
  useEffect(() => {
    const unsubs = [];
    let disposed = false;

    const sortByTimeDesc = (a, b, field) => {
      const ad = safeToDate(a?.[field])?.getTime() || 0;
      const bd = safeToDate(b?.[field])?.getTime() || 0;
      return bd - ad;
    };

    const listen = (ref, onData) => {
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!disposed) onData(snap);
        },
        (err) => {
          console.error("BH realtime listener error:", err);
        }
      );
      unsubs.push(unsub);
    };

    listen(collection(db, "players"), (snap) => {
      const next = snap.docs
        .map(normalizePlayer)
        .sort((a, b) =>
          lower(a.ign).localeCompare(lower(b.ign))
        );
      setPlayers(next);
    });

    listen(collection(db, "bhAttendance"), (snap) => {
      const next = snap.docs
        .map(normalizeAttendance)
        .sort((a, b) => sortByTimeDesc(a, b, "spawnAt"));
      setAttendanceRows(next);
    });

    listen(collection(db, "raids"), (snap) => {
      const firebaseRaids = snap.docs.map((s) => ({
        id: s.id,
        ...s.data(),
      }));
      setSchedules(
        deduplicateRaids([
          ...(DEFAULT_RAIDS || []),
          ...firebaseRaids,
        ])
      );
    });

    listen(collection(db, "bhRewards"), (snap) => {
      const next = snap.docs
        .map(normalizeReward)
        .sort((a, b) => updatedTimeMs(b, "createdAt") - updatedTimeMs(a, "createdAt") || lower(a.name).localeCompare(lower(b.name)));
      setRewards(next);
    });

    listen(collection(db, "bhRewardClaims"), (snap) => {
      const next = snap.docs
        .map(normalizeClaim)
        .sort((a, b) => updatedTimeMs(b, "claimedAt", "createdAt") - updatedTimeMs(a, "claimedAt", "createdAt"));
      setRewardClaims(next);
    });

    listen(collection(db, "bhDuckRaceStatus"), (snap) => {
      setDuckRaceStatuses(
        snap.docs.map(normalizeDuckRaceStatus)
      );
    });

    listen(doc(db, "bhScoring", "current"), (snap) => {
      const next = snap.exists()
        ? snap.data()
        : { bosses: {} };

      setScoring(next);
      setScoringDraft(
        buildScoringDraft(next, DEFAULT_RAIDS || [])
      );
    });

    listen(collection(db, "bhScoringHistory"), (snap) => {
      const next = snap.docs
        .map((s) => ({
          id: String(s.id),
          ...s.data(),
          createdAt: safeToDate(s.data()?.createdAt),
        }))
        .sort((a, b) => updatedTimeMs(b, "createdAt") - updatedTimeMs(a, "createdAt"));
      setScoringHistory(next);
    });

    listen(collection(db, "guildNotices"), (snap) => {
      const next = snap.docs
        .map(normalizeNotice)
        .filter((notice) => notice.active !== false && isBossHuntNotice(notice))
        .sort((a, b) => noticeSortNewestFirst(a, b));
      setGuildNotices(next);
    });

    return () => {
      disposed = true;
      unsubs.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // Ignore already-closed listeners.
        }
      });
    };
  }, []);
  /* =========================================================
     DATE WINDOW
  ========================================================= */

  const orderedScheduleDateKeys =
    useMemo(() => {
      if (!todayKey) return [];

      const back =
        Math.min(
          7,
          Math.max(
            0,
            Number(
              scheduleBackDays
            ) || 0
          )
        );

      const forward =
        Math.min(
          7,
          Math.max(
            0,
            Number(
              scheduleForwardDays
            ) || 0
          )
        );

      const previous = [];

      for (
        let i = 1;
        i <= back;
        i += 1
      ) {
        previous.push(
          shiftDateKey(
            todayKey,
            -i
          )
        );
      }

      const future = [];

      for (
        let i = 1;
        i <= forward;
        i += 1
      ) {
        future.push(
          shiftDateKey(
            todayKey,
            i
          )
        );
      }

      /*
       * TODAY ALWAYS FIRST.
       */
      return [
        todayKey,
        ...previous,
        ...future,
      ];
    }, [
      todayKey,
      scheduleBackDays,
      scheduleForwardDays,
    ]);

  useEffect(() => {
    if (!todayKey) return;

    setSelectedScheduleDate(
      (current) => {
        if (
          current &&
          orderedScheduleDateKeys.includes(
            current
          )
        ) {
          return current;
        }

        return todayKey;
      }
    );
  }, [
    todayKey,
    orderedScheduleDateKeys,
  ]);

  /* =========================================================
     CANONICAL RAID SCHEDULE SOURCE

     Always keep the built-in schedule available. Firebase records
     override matching IDs, exactly like RaidPage, but a temporary
     empty/failed raid state can never make BH show zero spawns.
  ========================================================= */

  const effectiveSchedules = useMemo(
    () =>
      deduplicateRaids([
        ...(DEFAULT_RAIDS || []),
        ...(schedules || []),
      ]),
    [schedules]
  );

  /* =========================================================
     BOSS OPTIONS
  ========================================================= */

  const bossOptions =
    useMemo(() => {
      const map = new Map();

      /*
       * ALWAYS include default bosses.
       */
      for (const boss of DEFAULT_BOSS_LIST) {
        map.set(
          boss.id,
          {
            id: boss.id,
            name: boss.name,
            points:
              bossPointsFromScoring(
                scoring,
                boss.id
              ),
          }
        );
      }

      for (const raid of effectiveSchedules) {
        const id =
          normalizeBossId(
            raid.id ??
            raid.name
          );

        if (!id) continue;

        map.set(
          id,
          {
            id,
            name:
              raid.name ||
              bossLabel(id),
            points:
              bossPointsFromScoring(
                scoring,
                id
              ),
          }
        );
      }

      return Array.from(
        map.values()
      );
    }, [
      effectiveSchedules,
      scoring,
    ]);

  /* =========================================================
     SCHEDULE OCCURRENCES
  ========================================================= */

  const scheduleOccurrences =
    useMemo(
      () =>
        generateScheduleOccurrences(
          effectiveSchedules,
          orderedScheduleDateKeys,
          effectiveTimezone,
          scoring
        ),
      [
        effectiveSchedules,
        orderedScheduleDateKeys,
        effectiveTimezone,
        scoring,
      ]
    );

  /* =========================================================
     LIVE BH ATTENDANCE STATUS — additive only

     The latest scheduled spawn that has already started is the live
     checkpoint. An exact attendance record means ATTENDED; no record
     means DID NOT ATTEND. Before the first spawn, status is UPCOMING.
     This does not modify historical attendance or player totals.
  ========================================================= */
  const bhLiveStatusByPlayer = useMemo(() => {
    const nowDate = new Date(clockTick);
    const today = scheduleOccurrences
      .filter((occurrence) => occurrence.dateKey === todayKey && occurrence.active !== false)
      .sort((a, b) => (safeToDate(a.spawnAt)?.getTime() || 0) - (safeToDate(b.spawnAt)?.getTime() || 0));

    const completed = today.filter((occurrence) => (safeToDate(occurrence.spawnAt)?.getTime() || Infinity) <= nowDate.getTime());
    const latest = completed[completed.length - 1] || null;
    const upcoming = today.find((occurrence) => (safeToDate(occurrence.spawnAt)?.getTime() || Infinity) > nowDate.getTime()) || null;
    const result = {};

    players.forEach((player) => {
      if (!today.length) {
        result[String(player.id)] = { state: "none", label: "NO SPAWN TODAY", occurrence: null };
        return;
      }
      if (!latest && upcoming) {
        result[String(player.id)] = { state: "upcoming", label: "UPCOMING", occurrence: upcoming };
        return;
      }
      const attended = attendanceRows.some((row) =>
        attendanceMatchesPlayer(row, player.id) && occurrenceMatchesRow(row, latest)
      );
      result[String(player.id)] = {
        state: attended ? "attended" : "missed",
        label: attended ? "ATTENDED" : "DID NOT ATTEND",
        occurrence: latest,
      };
    });
    return result;
  }, [scheduleOccurrences, todayKey, clockTick, players, attendanceRows]);

  const filteredScheduleOccurrences =
    useMemo(() => {
      return scheduleOccurrences.filter(
        (occurrence) => {
          if (
            scheduleBossFilter !==
            "all" &&
            occurrence.bossId !==
            scheduleBossFilter
          ) {
            return false;
          }

          if (
            scheduleStatusFilter ===
            "active" &&
            occurrence.active ===
            false
          ) {
            return false;
          }

          if (
            scheduleStatusFilter ===
            "inactive" &&
            occurrence.active !==
            false
          ) {
            return false;
          }

          return true;
        }
      ).sort((a, b) => updatedTimeMs(b, "createdAt") - updatedTimeMs(a, "createdAt") || lower(a.name).localeCompare(lower(b.name)));
    }, [
      scheduleOccurrences,
      scheduleBossFilter,
      scheduleStatusFilter,
    ]);

  const selectedDateOccurrences =
    useMemo(
      () =>
        filteredScheduleOccurrences.filter(
          (occurrence) =>
            occurrence.dateKey ===
            selectedScheduleDate
        ),
      [
        filteredScheduleOccurrences,
        selectedScheduleDate,
      ]
    );

  /* =========================================================
     EXACT SCHEDULED SPAWN COUNT

     This is the number of actual scheduled boss occurrences on
     the currently selected calendar date. It comes directly from
     the same canonical schedule engine used by the BH calendar.
  ========================================================= */

  const selectedScheduleSpawnCount =
    useMemo(
      () =>
        scheduleOccurrences.filter(
          (occurrence) =>
            occurrence.dateKey ===
            selectedScheduleDate &&
            occurrence.active !== false
        ).length,
      [
        scheduleOccurrences,
        selectedScheduleDate,
      ]
    );

  /* =========================================================
     ATTENDANCE FOR SELECTED DATE
  ========================================================= */

  const selectedDateAttendance =
    useMemo(
      () =>
        attendanceRows.filter(
          (row) =>
            attendanceDate(
              row,
              effectiveTimezone
            ) ===
            selectedScheduleDate
        ),
      [
        attendanceRows,
        selectedScheduleDate,
        effectiveTimezone,
      ]
    );

  /* =========================================================
     TODAY ATTENDANCE
  ========================================================= */

  const todayAttendance =
    useMemo(
      () =>
        attendanceRows.filter(
          (row) =>
            attendanceDate(
              row,
              effectiveTimezone
            ) === todayKey
        ),
      [
        attendanceRows,
        todayKey,
        effectiveTimezone,
      ]
    );

  /* =========================================================
     PLAYER STATS
     Attendance is lifetime by boss.
     Reward balance is lifetime attendance minus Sonya claims only.
     One Sonya weapon consumes BH_CLAIM_THRESHOLD points.
  ========================================================= */

  const playerStats =
    useMemo(() => {
      /*
       * Sonya is always a 6-point reward.  Do not derive the deduction
       * from the reward cost because an admin may override/edit a reward
       * record.  The business rule is always: 1 Sonya claim = -6 points.
       */
      const sonyaCost = SONYA_REWARD_COST;

      return players.map((player) => {
        const playerId = String(player.id);

        const playerAttendance = attendanceRows.filter((row) =>
          attendanceMatchesPlayer(row, playerId)
        );

        const attendanceByBoss = {};
        DEFAULT_BOSS_LIST.forEach((boss) => {
          attendanceByBoss[boss.id] = 0;
        });

        playerAttendance.forEach((row) => {
          const bossId = normalizeBossId(
            row?.bossId ?? row?.boss ?? row?.bossName
          );

          if (!Object.prototype.hasOwnProperty.call(attendanceByBoss, bossId)) {
            attendanceByBoss[bossId] = 0;
          }

          attendanceByBoss[bossId] += safeNumber(row.points, 0);
        });

        const earned = Object.values(attendanceByBoss).reduce(
          (sum, points) => sum + safeNumber(points, 0),
          0
        );

        const rewardById = new Map(
          rewards.map((reward) => [String(reward.id), reward])
        );

        const sonyaRewardIds = new Set(
          rewards
            .filter((reward) =>
              normalizeBossId(
                reward?.bossId ?? reward?.boss ?? reward?.bossName
              ) === "sonya"
            )
            .map((reward) => String(reward.id))
        );

        const sonyaRewardNames = new Set(
          rewards
            .filter((reward) =>
              normalizeBossId(
                reward?.bossId ?? reward?.boss ?? reward?.bossName
              ) === "sonya"
            )
            .flatMap((reward) => [
              clean(reward?.name).toLowerCase(),
              clean(reward?.rewardName).toLowerCase(),
            ])
            .filter(Boolean)
        );

        /*
         * Build one de-duplicated Sonya claim ledger.
         *
         * Source A: bhRewardClaims documents.
         * Source B: bhRewards records whose status is claimed.
         *
         * This makes the roster stay synchronized even if an older/override
         * workflow changed the reward record but did not create a fresh claim
         * document.  A reward is counted only once by rewardId.
         */
        const sonyaClaimKeys = new Set();
        const sonyaClaims = [];

        const addSonyaClaim = (claim, fallbackKey) => {
          const rewardId = clean(claim?.rewardId);
          const key = rewardId
            ? `reward:${rewardId}`
            : fallbackKey ||
            `claim:${clean(claim?.id) || sonyaClaims.length}`;

          if (sonyaClaimKeys.has(key)) return;
          sonyaClaimKeys.add(key);
          sonyaClaims.push(claim);
        };

        rewardClaims.forEach((claim) => {
          if (String(claim?.playerId ?? "") !== playerId) return;
          if (lower(claim?.status) === "cancelled") return;

          const linkedReward = rewardById.get(String(claim?.rewardId ?? ""));
          const claimBossId = normalizeBossId(
            claim?.bossId ?? claim?.boss ?? claim?.bossName
          );
          const linkedBossId = normalizeBossId(
            linkedReward?.bossId ??
            linkedReward?.boss ??
            linkedReward?.bossName
          );
          const claimRewardName = clean(
            claim?.rewardName ?? claim?.name
          ).toLowerCase();

          const isSonya =
            claimBossId === "sonya" ||
            linkedBossId === "sonya" ||
            sonyaRewardIds.has(String(claim?.rewardId ?? "")) ||
            sonyaRewardNames.has(claimRewardName);

          if (isSonya) {
            addSonyaClaim(claim);
          }
        });

        rewards.forEach((reward) => {
          if (String(reward?.playerId ?? "") !== playerId) return;
          if (lower(reward?.status) !== "claimed") return;

          const rewardBossId = normalizeBossId(
            reward?.bossId ?? reward?.boss ?? reward?.bossName
          );

          if (rewardBossId !== "sonya") return;

          addSonyaClaim(
            {
              id: `reward-${reward.id}`,
              rewardId: String(reward.id),
              rewardName: reward.name,
              bossId: "sonya",
              bossName: "Sonya",
              playerId,
              claimedAt: reward.updatedAt || reward.createdAt,
              claimedBy: reward.updatedBy || reward.createdBy,
              status: "claimed",
            },
            `reward:${String(reward.id)}`
          );
        });

        const sonyaClaimsCount = sonyaClaims.length;
        const sonyaDeducted = sonyaClaimsCount * sonyaCost;
        const available = earned - sonyaDeducted;

        const updateEvents = [
          {
            at: safeToDate(player.updatedAt),
            by: clean(player.updatedBy),
          },
          ...playerAttendance.map((row) => ({
            at: safeToDate(row.updatedAt) || safeToDate(row.createdAt),
            by: clean(row.updatedBy),
          })),
          ...sonyaClaims.map((claim) => ({
            at:
              safeToDate(claim.updatedAt) ||
              safeToDate(claim.claimedAt) ||
              safeToDate(claim.createdAt),
            by: clean(
              claim.updatedBy ||
              claim.claimedBy ||
              claim.createdBy
            ),
          })),
        ].filter((event) => event.at);

        updateEvents.sort((a, b) => b.at.getTime() - a.at.getTime());

        return {
          ...player,
          points: earned,
          claimed: sonyaDeducted,
          sonyaClaimsCount,
          sonyaDeducted,
          attendanceByBoss,
          available,
          latestUpdatedAt:
            updateEvents[0]?.at || safeToDate(player.updatedAt) || null,
          latestUpdatedBy:
            updateEvents[0]?.by || clean(player.updatedBy) || "SYSTEM",
        };
      });
    }, [players, attendanceRows, rewardClaims, rewards]);

  const eligiblePlayers =
    useMemo(
      () =>
        playerStats.filter(
          (player) => player.available >= BH_CLAIM_THRESHOLD
        ),
      [playerStats]
    );

  const totalSonyaClaims =
    useMemo(
      () =>
        playerStats.reduce(
          (sum, player) => sum + safeNumber(player.sonyaClaimsCount, 0),
          0
        ),
      [playerStats]
    );

  const totalSonyaDeducted =
    useMemo(
      () =>
        playerStats.reduce(
          (sum, player) => sum + safeNumber(player.sonyaDeducted, 0),
          0
        ),
      [playerStats]
    );

  /* =========================================================
     REWARDS
  ========================================================= */


  const filteredRewards =
    useMemo(() => {
      return rewards
        .filter(
          (reward) => {
            const search =
              lower(
                rewardSearch
              );

            if (
              search &&
              !lower(
                reward.name
              ).includes(search) &&
              !lower(
                reward.playerName
              ).includes(search) &&
              !lower(
                reward.bossName
              ).includes(search)
            ) {
              return false;
            }

            if (
              rewardBossFilter !==
              "all" &&
              reward.bossId !==
              rewardBossFilter
            ) {
              return false;
            }

            if (
              rewardStatusFilter !==
              "all" &&
              reward.status !==
              rewardStatusFilter
            ) {
              return false;
            }

            return true;
          }
        )
        .sort((a, b) => {
          const aTime = safeToDate(a.updatedAt || a.createdAt)?.getTime() || 0;
          const bTime = safeToDate(b.updatedAt || b.createdAt)?.getTime() || 0;
          return bTime - aTime;
        });
    }, [
      rewards,
      rewardSearch,
      rewardBossFilter,
      rewardStatusFilter,
    ]);

  const rewardPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredRewards.length /
        PAGE_SIZE
      )
    );

  const visibleRewards =
    filteredRewards.slice(
      (rewardPage - 1) *
      PAGE_SIZE,
      rewardPage *
      PAGE_SIZE
    );

  /* =========================================================
     PLAYER FILTER
  ========================================================= */

  const filteredPlayers =
    useMemo(() => {
      return playerStats.filter(
        (player) => {
          if (
            playerSearch &&
            !lower(
              player.ign
            ).includes(
              lower(
                playerSearch
              )
            )
          ) {
            return false;
          }

          if (
            playerClassFilter !==
            "all" &&
            player.class !==
            playerClassFilter
          ) {
            return false;
          }

          return true;
        }
      ).sort((a, b) => (safeToDate(b.latestUpdatedAt)?.getTime() || 0) - (safeToDate(a.latestUpdatedAt)?.getTime() || 0) || lower(a.ign).localeCompare(lower(b.ign)));
    }, [
      playerStats,
      playerSearch,
      playerClassFilter,
    ]);

  const playerPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredPlayers.length /
        PAGE_SIZE
      )
    );

  const visiblePlayers =
    filteredPlayers.slice(
      (playerPage - 1) *
      PAGE_SIZE,
      playerPage *
      PAGE_SIZE
    );

  /* =========================================================
     NOTICE HELPERS
  ========================================================= */

  const getCurrentUpdaterName =
    () => {
      if (
        currentUser?.displayName
      ) {
        return currentUser.displayName;
      }

      if (currentUser?.email) {
        return currentUser.email;
      }

      return (
        currentUser?.uid ||
        "Unknown"
      );
    };

  const createGuildNotice =
    async ({
      title,
      message,
      type = "info",
      module = "bh-attendance",
      scope = "boss-hunt",
      action = "",
      entityType = "",
      entityId = "",
      playerId = "",
      playerName = "",
      bossId = "",
      bossName = "",
      rewardId = "",
      rewardName = "",
      points = null,
      status = "",
      reason = "",
      notes = "",
      details = [],
      changes = [],
    }) => {
      try {
        await addDoc(
          collection(
            db,
            "guildNotices"
          ),
          buildAuditPayload({
            scope: clean(scope) || "boss-hunt",

            module: resolveBossHuntNoticeModule(module, entityType, title, action),

            title,
            message,
            type,
            active: true,
            createdAt:
              serverTimestamp(),
            updatedAt:
              serverTimestamp(),
            createdBy:
              getCurrentUpdaterName(),
            createdByUid:
              currentUser?.uid ||
              null,

            // Structured audit fields.  The UI renders these as human-readable
            // activity details instead of exposing raw Firestore JSON.
            timestamp:
              serverTimestamp(),
            action: clean(action) || clean(title),
            entityType: clean(entityType),
            entityId: clean(entityId),
            playerId: playerId ? String(playerId) : null,
            playerName: clean(playerName),
            bossId: clean(bossId),
            bossName: clean(bossName),
            rewardId: rewardId ? String(rewardId) : null,
            rewardName: clean(rewardName),
            points: points == null || points === "" ? null : safeNumber(points, 0),
            status: clean(status),
            reason: clean(reason),
            notes: clean(notes),
            details: Array.isArray(details) ? details.filter(Boolean) : [],
            changes: Array.isArray(changes) ? changes.filter(Boolean) : [],
          }, { actor: getCurrentUpdaterName(), uid: currentUser?.uid, scope: clean(scope) || "boss-hunt" }));

      } catch (err) {
        console.warn(
          "Guild notice failed:",
          err
        );
      }
    };

  const reloadGuildNotices =
    async () => {
      try {
        const snap =
          await getDocs(
            collection(
              db,
              "guildNotices"
            )
          );

        setGuildNotices(
          snap.docs
            .map(
              normalizeNotice
            )
            .filter(
              (notice) =>
                notice.active !==
                false &&
                isBossHuntNotice(notice)
            )
            .sort(
              (a, b) =>
                (
                  b.createdAt?.getTime() ||
                  0
                ) -
                (
                  a.createdAt?.getTime() ||
                  0
                )
            )
        );
      } catch (err) {
        console.warn(
          "Could not reload guild notices:",
          err
        );
      }
    };

  /* =========================================================
     OPEN ATTENDANCE MODAL
  ========================================================= */

  const openAttendanceModal =
    (
      forcedDate =
        selectedScheduleDate,
      forcedOccurrence = null
    ) => {
      if (!isAdmin) return;

      const date =
        forcedDate ||
        todayKey;

      const occurrences =
        scheduleOccurrences.filter(
          (occurrence) =>
            occurrence.dateKey ===
            date
        );

      const first =
        forcedOccurrence ||
        occurrences[0] ||
        null;

      setAttendanceSelectedDate(
        date
      );

      setAttendancePlayerId(
        ""
      );

      setSelectedScheduledSpawns(
        first
          ? [
            first.occurrenceKey,
          ]
          : []
      );

      setAttendanceComment(
        ""
      );

      setAttendanceMode(
        "scheduled"
      );

      setOverrideDate(
        date
      );

      setOverrideTime(
        first?.timeKey ||
        "12:00"
      );

      setOverrideBoss(
        first?.bossId ||
        DEFAULT_BOSS_LIST[0]
          ?.id ||
        "sonya"
      );

      setOverridePoints(
        first?.points ||
        0
      );

      setOverrideComment(
        ""
      );

      setAttendanceModalOpen(
        true
      );
    };

  /* =========================================================
     BULK SCHEDULED ATTENDANCE
     Multiple players + multiple existing scheduled spawns.
     Existing player/spawn records are never duplicated.
  ========================================================= */

  const bulkAttendanceDateOptions = useMemo(() => {
    return Array.from(new Set(
      scheduleOccurrences
        .map(o => o.dateKey)
        .filter(Boolean)
    )).sort((a, b) => b.localeCompare(a));
  }, [scheduleOccurrences]);

  const bulkAttendanceDateOccurrences = useMemo(() => {
    return scheduleOccurrences
      .filter(o => o.dateKey === bulkAttendanceDate)
      .slice()
      .sort((a, b) => String(a.spawnAt || "").localeCompare(String(b.spawnAt || "")));
  }, [scheduleOccurrences, bulkAttendanceDate]);

  const bulkAttendanceVisiblePlayers = useMemo(() => {
    const q = clean(bulkAttendanceSearch).toLowerCase();
    return players
      .filter(p => p.active !== false)
      .filter(p => bulkAttendanceClassFilter === "all" || clean(p.class || p.className) === bulkAttendanceClassFilter)
      .filter(p => {
        if (bulkAttendanceStatusFilter === "all") return true;
        const selectedOccurrences = bulkAttendanceDateOccurrences.filter(o => bulkAttendanceSpawns.includes(o.occurrenceKey));
        const complete = selectedOccurrences.length > 0 && selectedOccurrences.every(o => attendanceRows.some(row => attendanceMatchesPlayer(row, p.id) && occurrenceMatchesRow(row, o)));
        const anyAttended = selectedOccurrences.some(o => attendanceRows.some(row => attendanceMatchesPlayer(row, p.id) && occurrenceMatchesRow(row, o)));
        if (bulkAttendanceStatusFilter === "attended") return complete;
        if (bulkAttendanceStatusFilter === "not-attended") return !complete;
        if (bulkAttendanceStatusFilter === "partial") return anyAttended && !complete;
        return true;
      })
      .filter(p => !q || [p.ign, p.class, p.className, p.weapon].some(v => clean(v).toLowerCase().includes(q)))
      .sort((a, b) => clean(a.ign).localeCompare(clean(b.ign), undefined, { sensitivity: "base", numeric: true }));
  }, [players, attendanceRows, bulkAttendanceSearch, bulkAttendanceClassFilter, bulkAttendanceStatusFilter, bulkAttendanceDateOccurrences, bulkAttendanceSpawns]);

  const bulkAttendancePageCount = Math.max(1, Math.ceil(bulkAttendanceVisiblePlayers.length / 5));
  const bulkAttendanceSafePage = Math.min(Math.max(1, bulkAttendancePage), bulkAttendancePageCount);
  const bulkAttendancePageRows = bulkAttendanceVisiblePlayers.slice((bulkAttendanceSafePage - 1) * 5, bulkAttendanceSafePage * 5);

  const hasBHAttendanceForOccurrence = (playerId, occurrence) => attendanceRows.some(row =>
    attendanceMatchesPlayer(row, playerId) && occurrenceMatchesRow(row, occurrence)
  );

  const openBHBulkAttendance = () => {
    if (!isAdmin) return;
    // Bulk attendance is a child workflow of Bulk Tools; never leave the
    // menu backdrop mounted underneath it.
    setBulkToolsModal(null);
    setAddPlayerModalOpen(false);
    const preferredDate = bulkAttendanceDateOptions.includes(todayKey) ? todayKey : (bulkAttendanceDateOptions[0] || todayKey);
    const occurrences = scheduleOccurrences.filter(o => o.dateKey === preferredDate);
    setBulkAttendanceDate(preferredDate);
    setBulkAttendanceSpawns(occurrences.map(o => o.occurrenceKey));
    setBulkAttendancePlayers([]);
    setBulkAttendanceSearch("");
    setBulkAttendanceClassFilter("all");
    setBulkAttendanceStatusFilter("all");
    setBulkAttendancePage(1);
    setBulkAttendanceComment("");
    setBulkAttendanceError("");
    setBulkAttendanceSaving(false);
    setBulkAttendanceOpen(true);
  };

  const toggleBHBulkPlayer = (playerId) => {
    const id = String(playerId);
    setBulkAttendancePlayers(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };

  const toggleBHBulkPlayerPage = () => {
    const ids = bulkAttendancePageRows.map(p => String(p.id));
    setBulkAttendancePlayers(cur => ids.length && ids.every(id => cur.includes(id))
      ? cur.filter(id => !ids.includes(id))
      : Array.from(new Set([...cur, ...ids]))
    );
  };

  const saveBHBulkAttendance = async () => {
    if (!isAdmin || bulkAttendanceSaving) return;
    if (!bulkAttendanceSpawns.length) { setBulkAttendanceError("Select at least one scheduled boss spawn."); return; }
    if (!bulkAttendancePlayers.length) { setBulkAttendanceError("Select at least one player."); return; }
    if (!clean(bulkAttendanceComment)) { setBulkAttendanceError("Admin comment is required for bulk attendance."); return; }

    const selectedOccurrences = bulkAttendanceDateOccurrences.filter(o => bulkAttendanceSpawns.includes(o.occurrenceKey));
    const selectedPlayers = players.filter(p => bulkAttendancePlayers.includes(String(p.id)) && p.active !== false);
    if (!selectedOccurrences.length) { setBulkAttendanceError("The selected scheduled spawns no longer exist. Refresh and select saved spawns again."); return; }
    if (!selectedPlayers.length) { setBulkAttendanceError("No active roster players are selected."); return; }

    const pending = [];
    const skipped = [];
    selectedPlayers.forEach(player => selectedOccurrences.forEach(occurrence => {
      if (hasBHAttendanceForOccurrence(player.id, occurrence)) skipped.push({ player, occurrence });
      else pending.push({ player, occurrence });
    }));

    if (!pending.length) {
      setBulkAttendanceError("All selected player/boss combinations are already recorded. Nothing new was created.");
      return;
    }

    setBulkAttendanceSaving(true);
    setBulkAttendanceError("");
    try {
      for (let start = 0; start < pending.length; start += 400) {
        const batch = writeBatch(db);
        pending.slice(start, start + 400).forEach(({ player, occurrence }) => {
          const ref = doc(collection(db, "bhAttendance"));
          batch.set(ref, {
            playerId: String(player.id),
            playerName: player.ign,
            bossId: occurrence.bossId,
            bossName: occurrence.bossName,
            points: occurrence.points,
            spawnAt: occurrence.spawnAt,
            dateKey: occurrence.dateKey,
            localDate: occurrence.dateKey,
            timeKey: occurrence.timeKey,
            localTime: occurrence.timeKey,
            primaryDateKey: occurrence.primaryDateKey,
            primaryLocalDate: occurrence.primaryDateKey,
            primaryTimeKey: occurrence.primaryTimeKey,
            primaryLocalTime: occurrence.primaryTimeKey,
            scheduleId: occurrence.scheduleId,
            occurrenceKey: occurrence.occurrenceKey,
            status: "recorded",
            manualOverride: false,
            comment: clean(bulkAttendanceComment),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: getCurrentUpdaterName(),
            updatedByUid: currentUser?.uid || null,
          });
        });
        await batch.commit();
      }

      const bossCounts = new Map();
      pending.forEach(({ occurrence }) => {
        const name = occurrence.bossName || bossLabel(occurrence.bossId);
        bossCounts.set(name, (bossCounts.get(name) || 0) + 1);
      });
      const bossSummary = Array.from(bossCounts.entries()).map(([name, count]) => `${name}: ${count}`).join(", " );
      const playerSummary = Array.from(new Set(pending.map(x => x.player.ign))).slice(0, 20).join(", " );

      await createGuildNotice({
        title: "Boss Hunt Bulk Attendance Recorded",
        message: `${pending.length} BH attendance record${pending.length === 1 ? "" : "s"} recorded for ${selectedPlayers.length} selected player${selectedPlayers.length === 1 ? "" : "s"}.`,
        type: "success",
        action: "Bulk Attendance Recorded",
        entityType: "bh-attendance-bulk",
        status: "recorded",
        notes: clean(bulkAttendanceComment),
        details: [
          `New attendance records: ${pending.length}`,
          `Already recorded / skipped: ${skipped.length}`,
          `Scheduled date: ${bulkAttendanceDate}`,
          `Boss breakdown: ${bossSummary || "None"}`,
          `Players: ${playerSummary}${new Set(pending.map(x => x.player.ign)).size > 20 ? " …" : ""}`,
          `Admin comment: ${clean(bulkAttendanceComment)}`,
          `Recorded by: ${getCurrentUpdaterName()}`,
        ],
        relatedModules: ["bh-attendance", "raid-schedule"],
      });

      setBulkAttendanceOpen(false);
      setSuccess(`${pending.length} BH attendance record${pending.length === 1 ? "" : "s"} saved. ${skipped.length ? `${skipped.length} already-recorded combination${skipped.length === 1 ? "" : "s"} skipped.` : ""}`.trim());
      await loadAllData();
      await reloadGuildNotices();
      switchActiveTab("players");
    } catch (err) {
      console.error(err);
      setBulkAttendanceError(err?.message || "Could not save bulk BH attendance. Nothing further was saved.");
    } finally {
      setBulkAttendanceSaving(false);
    }
  };

  /* =========================================================
     TOGGLE SCHEDULED SPAWN
  ========================================================= */

  const toggleScheduledSpawn =
    (occurrenceKey) => {
      setSelectedScheduledSpawns(
        (current) =>
          current.includes(
            occurrenceKey
          )
            ? current.filter(
              (key) =>
                key !==
                occurrenceKey
            )
            : [
              ...current,
              occurrenceKey,
            ]
      );
    };

  /* =========================================================
     SAVE SCHEDULED ATTENDANCE
  ========================================================= */

  const saveScheduledAttendance =
    async () => {
      if (!isAdmin) return;

      if (
        !attendancePlayerId
      ) {
        setError(
          "Select a player first."
        );
        return;
      }

      if (
        !selectedScheduledSpawns.length
      ) {
        setError(
          "Select at least one scheduled spawn."
        );
        return;
      }

      const player =
        players.find(
          (p) =>
            String(
              p.id
            ) ===
            String(
              attendancePlayerId
            )
        );

      if (!player) {
        setError(
          "Selected player could not be found."
        );
        return;
      }

      setAttendanceSaving(
        true
      );

      try {
        let added = 0;
        let skipped = 0;
        const recordedOccurrences = [];

        for (const occurrenceKey of selectedScheduledSpawns) {
          const occurrence =
            scheduleOccurrences.find(
              (item) =>
                item.occurrenceKey ===
                occurrenceKey
            );

          if (!occurrence) {
            continue;
          }

          const duplicate =
            attendanceRows.some(
              (row) =>
                attendanceMatchesPlayer(
                  row,
                  player.id
                ) &&
                occurrenceMatchesRow(
                  row,
                  occurrence
                )
            );

          if (duplicate) {
            skipped += 1;
            continue;
          }

          await addDoc(
            collection(
              db,
              "bhAttendance"
            ),
            {
              playerId:
                String(
                  player.id
                ),

              playerName:
                player.ign,

              bossId:
                occurrence.bossId,

              bossName:
                occurrence.bossName,

              points:
                occurrence.points,

              spawnAt:
                occurrence.spawnAt,

              dateKey:
                occurrence.dateKey,

              localDate:
                occurrence.dateKey,

              timeKey:
                occurrence.timeKey,

              localTime:
                occurrence.timeKey,

              primaryDateKey:
                occurrence.primaryDateKey,

              primaryLocalDate:
                occurrence.primaryDateKey,

              primaryTimeKey:
                occurrence.primaryTimeKey,

              primaryLocalTime:
                occurrence.primaryTimeKey,

              scheduleId:
                occurrence.scheduleId,

              occurrenceKey:
                occurrence.occurrenceKey,

              status:
                "recorded",

              manualOverride:
                false,

              comment:
                clean(
                  attendanceComment
                ),

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),

              updatedBy:
                getCurrentUpdaterName(),

              updatedByUid:
                currentUser?.uid ||
                null,
            }
          );

          added += 1;
          recordedOccurrences.push(occurrence);
        }

        if (added) {

          const bossGroups = new Map();
          for (const occurrence of recordedOccurrences) {
            const bossName = occurrence.bossName || bossLabel(occurrence.bossId);
            const key = `${bossName}`;
            if (!bossGroups.has(key)) bossGroups.set(key, []);
            bossGroups.get(key).push(occurrence);
          }

          const spawnLines = recordedOccurrences.map((occurrence) =>
            `${occurrence.bossName || bossLabel(occurrence.bossId)} — ${occurrence.dateKey || "date unavailable"} at ${occurrence.timeKey || "time unavailable"} — +${safeNumber(occurrence.points, 0).toFixed(2)} points`
          );

          const bossSummary = Array.from(bossGroups.entries())
            .map(([bossName, rows]) => `${bossName} (${rows.length} spawn${rows.length === 1 ? "" : "s"})`)
            .join(", ");

          await createGuildNotice(
            {
              title: "Boss Hunt Attendance Recorded",
              message: `${player.ign} was marked PRESENT for ${added} scheduled boss hunt spawn${added === 1 ? "" : "s"}: ${bossSummary || "scheduled boss hunt"}.`,
              type: "success",
              action: "Attendance Recorded",
              entityType: "attendance",
              playerId: player.id,
              playerName: player.ign,
              status: "recorded",
              notes: clean(attendanceComment),
              details: [
                `Player: ${player.ign}`,
                `Scheduled spawn${added === 1 ? "" : "s"}: ${added}`,
                `Boss${bossGroups.size === 1 ? "" : "es"}: ${bossSummary || "Unknown"}`,
                ...spawnLines.map((line, index) => `Spawn ${index + 1}: ${line}`),
                `Recorded by: ${getCurrentUpdaterName()}`,
                clean(attendanceComment) ? `Attendance note: ${clean(attendanceComment)}` : "",
              ].filter(Boolean),
            }
          );
        }

        if (skipped) {
          setSuccess(
            `${added} attendance record${added === 1
              ? ""
              : "s"
            } added. ${skipped} duplicate${skipped === 1
              ? ""
              : "s"
            } skipped.`
          );
        } else {
          setSuccess(
            `${added} attendance record${added === 1
              ? ""
              : "s"
            } added.`
          );
        }

        setAttendanceModalOpen(
          false
        );

        await loadAllData();
        await reloadGuildNotices();
        switchActiveTab("players");
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not save attendance."
        );
      } finally {
        setAttendanceSaving(
          false
        );
      }
    };

  /* =========================================================
     SAVE MANUAL ATTENDANCE
  ========================================================= */

  const saveManualAttendance =
    async () => {
      if (!isAdmin) return;

      if (
        !attendancePlayerId
      ) {
        setError(
          "Select a player first."
        );
        return;
      }

      if (!overrideDate) {
        setError(
          "Select an attendance date."
        );
        return;
      }

      if (!overrideTime) {
        setError(
          "Select an attendance time."
        );
        return;
      }

      const player =
        players.find(
          (p) =>
            String(
              p.id
            ) ===
            String(
              attendancePlayerId
            )
        );

      if (!player) {
        setError(
          "Selected player could not be found."
        );
        return;
      }

      const spawnAt =
        zonedLocalToDate(
          overrideDate,
          overrideTime,
          effectiveTimezone
        );

      if (!spawnAt) {
        setError(
          "Invalid date or time."
        );
        return;
      }

      const bossId =
        normalizeBossId(
          overrideBoss
        );

      const points =
        safeNumber(
          overridePoints,
          defaultBossPoints(
            bossId
          )
        );

      setAttendanceSaving(
        true
      );

      try {
        await addDoc(
          collection(
            db,
            "bhAttendance"
          ),
          {
            playerId:
              String(
                player.id
              ),

            playerName:
              player.ign,

            bossId,

            bossName:
              bossLabel(
                bossId
              ),

            points,

            spawnAt,

            dateKey:
              dateKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            localDate:
              dateKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            timeKey:
              timeKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            localTime:
              timeKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            primaryDateKey:
              dateKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryLocalDate:
              dateKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryTimeKey:
              timeKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryLocalTime:
              timeKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            scheduleId:
              null,

            occurrenceKey:
              null,

            status:
              "recorded",

            manualOverride:
              true,

            comment:
              clean(
                overrideComment
              ),

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),

            updatedByUid:
              currentUser?.uid ||
              null,
          }
        );

        await createGuildNotice(
          {
            title:
              "Boss Hunt Attendance Correction",

            message:
              `${player.ign} received ${points.toFixed(
                2
              )} point${points === 1
                ? ""
                : "s"
              } for ${bossLabel(
                bossId
              )} on ${formatLongDate(
                spawnAt,
                effectiveTimezone
              )}.`,

            type: "warning",
            action: "Boss Hunt Attendance Corrected",
            entityType: "attendance",
            playerId: player.id,
            playerName: player.ign,
            bossId,
            bossName: bossLabel(bossId),
            points,
            status: "recorded",
            notes: clean(overrideComment),
            details: [
              `Player: ${player.ign}`,
              `Boss: ${bossLabel(bossId)}`,
              `Attendance date: ${formatLongDate(spawnAt, effectiveTimezone)}`,
              `Attendance time: ${timeKeyFromDate(spawnAt, effectiveTimezone)}`,
              `Points awarded: +${points.toFixed(2)}`,
              `Attendance correction: Yes`,
              `Recorded by: ${getCurrentUpdaterName()}`,
              clean(overrideComment) ? `Admin note: ${clean(overrideComment)}` : "",
            ].filter(Boolean),
          }
        );

        setSuccess(
          "Attendance correction saved."
        );

        setAttendanceModalOpen(
          false
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not save attendance correction."
        );
      } finally {
        setAttendanceSaving(
          false
        );
      }
    };

  /* =========================================================
     UNIFIED ADD PLAYER — ONE OR MANY IGNs
     A single IGN and a pasted list use the exact same workflow.
  ========================================================= */
  const openBHAddPlayers = () => {
    if (!isAdmin) return;
    setBulkPlayerGroups([{ id: Date.now(), igns: "", className: CLASS_OPTIONS[0] || "Swordman", weapon: "" }]);
    setBulkPlayerSaving(false);
    setBulkPlayerError("");
    setNewPlayerIgn("");
    setNewPlayerClass(CLASS_OPTIONS[0] || "Swordman");
    setNewPlayerWeapon("");
    setError("");
    setAddPlayerModalOpen(true);
  };

  const saveBHPlayers = async () => {
    if (!isAdmin || bulkPlayerSaving) return;
    const raw = bulkPlayerGroups.flatMap(g => String(g.igns || "").split(/\r?\n/).map(clean).filter(Boolean));
    const names = Array.from(new Set(raw));
    const existing = new Map(players.map(p => [clean(p.ign).toLowerCase(), p]));
    const seen = new Set();
    const entries = [];
    const errors = [];

    if (!names.length) errors.push("Enter at least one IGN.");

    bulkPlayerGroups.forEach((g, index) => {
      const lines = Array.from(new Set(String(g.igns || "").split(/\r?\n/).map(clean).filter(Boolean)));
      if (!lines.length) return;
      if (!clean(g.className)) errors.push(`Group ${index + 1}: class is required.`);
      lines.forEach(ign => {
        const key = ign.toLowerCase();
        if (existing.has(key)) {
          const p = existing.get(key);
          errors.push(`${ign} already exists in the BH roster (${p?.active === false ? "DISABLED" : "ACTIVE"}).`);
        } else if (seen.has(key)) {
          errors.push(`${ign} is listed more than once.`);
        } else {
          seen.add(key);
          entries.push({ ign, className: clean(g.className), weapon: clean(g.weapon) });
        }
      });
    });

    if (errors.length) {
      setBulkPlayerError(errors.slice(0, 20).join(" "));
      return;
    }

    setBulkPlayerSaving(true);
    setBulkPlayerError("");
    try {
      for (let start = 0; start < entries.length; start += 400) {
        const batch = writeBatch(db);
        entries.slice(start, start + 400).forEach(entry => {
          const ref = doc(collection(db, "players"));
          batch.set(ref, {
            ign: entry.ign,
            class: entry.className,
            className: entry.className,
            weapon: entry.weapon,
            active: true,
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: getCurrentUpdaterName(),
            createdByUid: currentUser?.uid || null,
          });
        });
        await batch.commit();
      }

      await createGuildNotice({
        title: "Players Added",
        message: `${entries.length} player${entries.length === 1 ? "" : "s"} were added to the Boss Hunt roster.`,
        type: "success",
        action: "Players Added",
        entityType: "player-bulk",
        status: "active",
        details: entries.map((e, i) => `${i + 1}. ${e.ign} • Class: ${e.className || "Unspecified"} • Preferred Weapon: ${e.weapon || "Unspecified"}`).concat([`Added by: ${getCurrentUpdaterName()}`]),
      });

      setBulkPlayerGroups([{ id: Date.now(), igns: "", className: CLASS_OPTIONS[0] || "Swordman", weapon: "" }]);
      setNewPlayerIgn("");
      setNewPlayerWeapon("");
      setSuccess(`${entries.length} player${entries.length === 1 ? "" : "s"} added.`);
      setAddPlayerModalOpen(false);
      switchActiveTab("players");
      setPlayerSearch("");
      setPlayerClassFilter("all");
      setPlayerPage(1);
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      console.error(err);
      setBulkPlayerError(err?.message || "Could not add player(s).");
    } finally {
      setBulkPlayerSaving(false);
    }
  };

  // Backwards-compatible alias for any existing single-player button handlers.
  const addPlayer = saveBHPlayers;

  /* =========================================================
     EDIT PLAYER
  ========================================================= */

  const saveEditedPlayer =
    async () => {
      if (
        !isAdmin ||
        !editingPlayer
      ) {
        return;
      }

      const ign =
        clean(
          editingPlayer.ign
        );

      if (!ign) {
        setError(
          "IGN cannot be empty."
        );
        return;
      }

      const duplicate =
        players.some(
          (player) =>
            String(
              player.id
            ) !==
            String(
              editingPlayer.id
            ) &&
            lower(
              player.ign
            ) ===
            lower(
              ign
            )
        );

      if (duplicate) {
        setError(
          "Another player already uses that IGN."
        );
        return;
      }

      try {
        await updateDoc(
          doc(
            db,
            "players",
            String(
              editingPlayer.id
            )
          ),
          {
            ign,

            class:
              clean(
                editingPlayer.class
              ),

            weapon:
              clean(
                editingPlayer.weapon
              ),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),
          }
        );

        await createGuildNotice(
          {
            title:
              "Player Updated",

            message:
              `${ign}'s player profile was updated.`,

            type: "info",
            action: "Player Profile Updated",
            entityType: "player",
            entityId: editingPlayer.id,
            playerName: ign,
            details: [
              `Player: ${ign}`,
              `New class: ${clean(editingPlayer.class) || "Unspecified"}`,
              `New weapon: ${clean(editingPlayer.weapon) || "Unspecified"}`,
              `Changed by: ${getCurrentUpdaterName()}`,
            ],
            changes: [
              `IGN: ${clean(editingPlayer.ign) || "—"} → ${ign}`,
              `Class: ${clean(editingPlayer.originalClass || editingPlayer.class) || "—"} → ${clean(editingPlayer.class) || "—"}`,
              `Weapon: ${clean(editingPlayer.originalWeapon || editingPlayer.weapon) || "—"} → ${clean(editingPlayer.weapon) || "—"}`,
            ],
          }
        );

        setEditingPlayer(
          null
        );

        setSuccess(
          "Player updated."
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        setError(
          err?.message ||
          "Could not update player."
        );
      }
    };

  /* =========================================================
     PERMANENTLY DELETE PLAYER
     Deletes the player, all attendance records, all reward
     claim records, and all player-assigned reward records.
     Requires admin + confirmation + PIN 12345.
  ========================================================= */

  const permanentlyDeletePlayer =
    async () => {
      if (!isAdmin || !deletePlayerTarget || deletePlayerBusy) return;

      if (deletePlayerPin !== "12345") {
        setError("Incorrect delete PIN.");
        return;
      }

      const playerId = String(deletePlayerTarget.id);
      const playerIgn = clean(deletePlayerTarget.ign || "Unknown");

      setDeletePlayerBusy(true);
      setError("");

      try {
        const [attendanceSnap, claimsSnap, rewardsSnap] = await Promise.all([
          getDocs(collection(db, "bhAttendance")),
          getDocs(collection(db, "bhRewardClaims")),
          getDocs(collection(db, "bhRewards")),
        ]);

        const attendanceToDelete = attendanceSnap.docs.filter((snap) => {
          const data = snap.data() || {};
          return String(data.playerId ?? "") === playerId;
        });

        const claimsToDelete = claimsSnap.docs.filter((snap) => {
          const data = snap.data() || {};
          return String(data.playerId ?? "") === playerId;
        });

        const rewardsToDelete = rewardsSnap.docs.filter((snap) => {
          const data = snap.data() || {};
          return String(data.playerId ?? "") === playerId;
        });

        const deleteRefs = [
          ...attendanceToDelete.map((snap) => doc(db, "bhAttendance", snap.id)),
          ...claimsToDelete.map((snap) => doc(db, "bhRewardClaims", snap.id)),
          ...rewardsToDelete.map((snap) => doc(db, "bhRewards", snap.id)),
          doc(db, "players", playerId),
        ];

        for (const ref of deleteRefs) {
          await deleteDoc(ref);
        }

        // Remove guild notices that explicitly belong to this player.
        // This keeps the visible activity/history free of the deleted IGN
        // when notices carry a playerId/playerName field.
        const noticeDeletes = guildNotices
          .filter((notice) =>
            String(notice?.playerId ?? "") === playerId ||
            lower(notice?.playerName) === lower(playerIgn)
          );

        for (const notice of noticeDeletes) {
          if (notice?.id) {
            await deleteDoc(doc(db, "guildNotices", String(notice.id)));
          }
        }

        await createGuildNotice({
          title: "Player Permanently Deleted",
          message: `${playerIgn} and all associated attendance, reward claims, and assigned reward records were permanently deleted by ${getCurrentUpdaterName()}.`,
          type: "warning",
          action: "Player Permanently Deleted",
          entityType: "player",
          entityId: playerId,
          playerId,
          playerName: playerIgn,
          status: "deleted",
          details: [
            `Player: ${playerIgn}`,
            `Attendance records deleted: ${attendanceToDelete.length}`,
            `Reward claims deleted: ${claimsToDelete.length}`,
            `Assigned rewards deleted: ${rewardsToDelete.length}`,
            `Player roster record deleted: Yes`,
            `Deleted by: ${getCurrentUpdaterName()}`,
          ],
          changes: [
            `Player roster: active record → permanently deleted`,
            `Attendance records: ${attendanceToDelete.length} deleted`,
            `Reward claims: ${claimsToDelete.length} deleted`,
            `Assigned rewards: ${rewardsToDelete.length} deleted`,
          ],
        });

        setDeletePlayerTarget(null);
        setDeletePlayerPin("");
        setSuccess(`${playerIgn} and all associated records were permanently deleted.`);

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        console.error(err);
        setError(err?.message || "Could not permanently delete player.");
      } finally {
        setDeletePlayerBusy(false);
      }
    };

  /* =========================================================
     ENABLE / DISABLE PLAYER
  ========================================================= */

  const togglePlayerActive =
    async (player) => {
      if (!isAdmin) return;

      try {
        await updateDoc(
          doc(
            db,
            "players",
            String(
              player.id
            )
          ),
          {
            active:
              !player.active,

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),
          }
        );

        await createGuildNotice(
          {
            title:
              player.active
                ? "Player Disabled"
                : "Player Enabled",

            message:
              `${player.ign} was ${player.active
                ? "disabled"
                : "enabled"
              } by ${getCurrentUpdaterName()}.`,

            type:
              player.active
                ? "warning"
                : "success",
            action: player.active ? "Player Disabled" : "Player Enabled",
            entityType: "player",
            entityId: player.id,
            playerId: player.id,
            playerName: player.ign,
            status: player.active ? "disabled" : "active",
            details: [
              `Player: ${player.ign}`,
              `Previous roster status: ${player.active ? "Active" : "Disabled"}`,
              `New roster status: ${player.active ? "Disabled" : "Active"}`,
              `Changed by: ${getCurrentUpdaterName()}`,
            ],
            changes: [
              `Status: ${player.active ? "Active" : "Disabled"} → ${player.active ? "Disabled" : "Active"}`,
            ],
          }
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        setError(
          err?.message ||
          "Could not update player status."
        );
      }
    };

  /* =========================================================
     SAVE SCORING
  ========================================================= */

  const saveScoring =
    async () => {
      if (!isAdmin) return;

      setScoringSaving(
        true
      );

      try {
        const previous =
          buildScoringDraft(
            scoring,
            schedules
          );

        await setDoc(
          doc(
            db,
            "bhScoring",
            "current"
          ),
          {
            bosses:
              scoringDraft,

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),

            updatedByUid:
              currentUser?.uid ||
              null,
          },
          {
            merge: true,
          }
        );

        await addDoc(
          collection(
            db,
            "bhScoringHistory"
          ),
          {
            previous,

            next:
              scoringDraft,

            comment:
              clean(
                scoringComment
              ),

            createdAt:
              serverTimestamp(),

            createdBy:
              getCurrentUpdaterName(),

            createdByUid:
              currentUser?.uid ||
              null,
          }
        );

        const changedBosses =
          bossOptions.filter(
            (boss) =>
              safeNumber(
                previous[
                boss.id
                ],
                0
              ) !==
              safeNumber(
                scoringDraft[
                boss.id
                ],
                0
              )
          );

        for (const boss of changedBosses) {
          await createGuildNotice(
            {
              title:
                "Boss Hunt Scoring Changed",

              message:
                `${boss.name} changed from ${safeNumber(
                  previous[
                  boss.id
                  ],
                  0
                ).toFixed(
                  2
                )} to ${safeNumber(
                  scoringDraft[
                  boss.id
                  ],
                  0
                ).toFixed(
                  2
                )} points.`,

              type: "warning",
            }
          );
        }

        setScoringComment("");

        setSuccess(
          "Boss scoring saved."
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not save scoring."
        );
      } finally {
        setScoringSaving(
          false
        );
      }
    };


  const openNewRewardModal = () => {
    if (!isAdmin) return;

    setRewardForm({
      name: "",
      bossId: "sonya",
      cost: SONYA_REWARD_COST,
      weaponClass: CLASS_OPTIONS[0] || "",
      playerId: "",
      status: "available",
      spawnAt: "",
      notes: "",
    });
    setError("");
    setEditingReward({ __new: true });
  };

  const openRewardInventoryDetails = (reward) => {
    if (!reward) return;
    setSelectedRewardInventory(reward);
  };

  /* =========================================================
     ADD REWARD
  ========================================================= */

  const addReward =
    async () => {
      if (!isAdmin) return;

      const name =
        clean(
          rewardForm.name
        );

      if (!name) {
        setError(
          "Enter a reward name."
        );
        return;
      }

      const normalizedBoss = normalizeBossId(rewardForm.bossId);
      const cost = normalizedBoss === "sonya" ? SONYA_REWARD_COST : 0;

      if (!clean(rewardForm.weaponClass)) {
        setError("Choose the weapon class for this reward.");
        return;
      }

      try {
        const rewardPlayerId =
          clean(
            rewardForm.playerId
          ) || null;

        const rewardPlayer =
          players.find(
            (p) =>
              String(
                p.id
              ) ===
              String(
                rewardPlayerId
              )
          );

        const rewardRef = await addDoc(
          collection(
            db,
            "bhRewards"
          ),
          {
            name,

            bossId: normalizedBoss,

            bossName:
              bossLabel(
                rewardForm.bossId
              ),

            cost,

            weaponClass: clean(rewardForm.weaponClass),

            playerId:
              rewardPlayerId,

            playerName:
              rewardPlayer?.ign ||
              "",

            status:
              rewardForm.status ||
              "available",

            spawnAt:
              rewardForm.spawnAt
                ? new Date(
                  rewardForm.spawnAt
                )
                : null,

            notes:
              clean(
                rewardForm.notes
              ),

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),

            createdBy:
              getCurrentUpdaterName(),
            createdByUid: currentUser?.uid || null,
            updatedBy: getCurrentUpdaterName(),
          }
        );

        await createGuildNotice({
          title: "New Boss Hunt Reward",
          message: `${name} was added to the ${bossLabel(normalizedBoss)} reward list${normalizedBoss === "sonya" ? " for 6.00 points" : " (free Duck Race reward)"}.`,
          type: "success",
          module: "bh-rewards", action: "REWARD CREATED", entityType: "reward", entityId: rewardRef.id,
          rewardName: name, bossId: normalizedBoss, bossName: bossLabel(normalizedBoss),
          playerId: rewardPlayerId, playerName: rewardPlayer?.ign || "", recipientPlayerId: rewardPlayerId, recipientPlayerName: rewardPlayer?.ign || "",
          status: rewardForm.status || "available", relatedModules: ["bh-rewards", "bh-attendance", "raid-schedule"],
          details: [`Reward: ${name}`, `Boss: ${bossLabel(normalizedBoss)}`, `Weapon class: ${clean(rewardForm.weaponClass)}`, `Cost: ${cost.toFixed(2)} points`, `Owner / assigned player: ${rewardPlayer?.ign || "Unassigned"}`, `Initial status: ${rewardForm.status || "available"}`, `Created by: ${getCurrentUpdaterName()}`],
        });

        setRewardForm({
          name: "",
          bossId:
            DEFAULT_BOSS_LIST[0]
              ?.id ||
            "sonya",
          cost: SONYA_REWARD_COST,
          weaponClass: CLASS_OPTIONS[0] || "",
          playerId: "",
          status:
            "available",
          spawnAt: "",
          notes: "",
        });

        setSuccess(
          "Reward added."
        );

        await loadAllData();
        await reloadGuildNotices();
        return true;
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not add reward."
        );
        return false;
      }
    };

  /* =========================================================
     EDIT REWARD
  ========================================================= */

  const saveEditedReward =
    async () => {
      if (
        !isAdmin ||
        !editingReward
      ) {
        return;
      }

      try {
        const rewardBefore = rewards.find((r) => String(r.id) === String(editingReward.id)) || editingReward;
        if (!clean(editingReward.weaponClass)) {
          setError("Choose the weapon class for this reward.");
          return;
        }
        const player =
          players.find(
            (p) =>
              String(
                p.id
              ) ===
              String(
                editingReward.playerId
              )
          );

        await updateDoc(
          doc(
            db,
            "bhRewards",
            String(
              editingReward.id
            )
          ),
          {
            name:
              clean(
                editingReward.name
              ),

            bossId:
              normalizeBossId(
                editingReward.bossId
              ),

            bossName:
              bossLabel(
                editingReward.bossId
              ),

            cost: normalizeBossId(editingReward.bossId) === "sonya" ? SONYA_REWARD_COST : 0,

            weaponClass: clean(editingReward.weaponClass),

            playerId:
              clean(
                editingReward.playerId
              ) || null,

            playerName:
              player?.ign ||
              "",

            status:
              editingReward.status ||
              "available",

            notes:
              clean(
                editingReward.notes
              ),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),
          }
        );

        await createGuildNotice({
          title: "Reward Updated",
          message: `${editingReward.name} was updated by ${getCurrentUpdaterName()}.`,
          type: "info", module: "bh-rewards", action: "REWARD UPDATED", entityType: "reward", entityId: editingReward.id,
          rewardId: editingReward.id, rewardName: editingReward.name, bossId: editingReward.bossId, bossName: bossLabel(editingReward.bossId),
          playerId: editingReward.playerId, playerName: player?.ign || "", recipientPlayerId: editingReward.playerId, recipientPlayerName: player?.ign || "",
          status: editingReward.status || "available", relatedModules: ["bh-rewards", "bh-attendance", "raid-schedule"],
          details: [`Reward: ${editingReward.name} (${editingReward.id})`, `Boss: ${bossLabel(editingReward.bossId)}`, `Weapon class: ${clean(editingReward.weaponClass)}`, `Owner / assigned player: ${player?.ign || "Unassigned"}`, `Status: ${editingReward.status || "available"}`, `Changed by: ${getCurrentUpdaterName()}`],
          changes: [
            { field: "Reward name", from: rewardBefore?.name || editingReward.name, to: clean(editingReward.name) },
            { field: "Boss", from: rewardBefore?.bossName || bossLabel(rewardBefore?.bossId), to: bossLabel(editingReward.bossId) },
            { field: "Weapon class", from: rewardBefore?.weaponClass || "—", to: clean(editingReward.weaponClass) },
            { field: "Owner / player", from: rewardBefore?.playerName || "Unassigned", to: player?.ign || "Unassigned" },
            { field: "Status", from: rewardBefore?.status || "available", to: editingReward.status || "available" },
          ],
        });

        setEditingReward(
          null
        );

        setSuccess(
          "Reward updated."
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        setError(
          err?.message ||
          "Could not update reward."
        );
      }
    };

  /* =========================================================
     CLAIM REWARD
  ========================================================= */

  const claimReward = async (reward) => {
    if (!currentUser) {
      setError("You must be signed in to claim a reward.");
      return;
    }
    if (!reward?.playerId) {
      setError("This reward is not assigned to a player.");
      return;
    }
    if (lower(reward.status) !== "available") {
      setError("This reward is not currently available.");
      return;
    }

    const rewardBossId = normalizeBossId(reward.bossId);
    if (rewardBossId !== "sonya") {
      const todayDuck = getDuckRaceStatus(rewardBossId);
      if (todayDuck?.status !== "duck-raced") {
        setError(`${reward.bossName} has not been marked DUCK RACED for today yet.`);
        return;
      }
    }

    const stats = playerStats.find((player) => String(player.id) === String(reward.playerId));
    if (!stats) {
      setError("Player could not be found.");
      return;
    }

    const cost = rewardBossId === "sonya" ? SONYA_REWARD_COST : 0;
    const minimumEligible = rewardBossId === "sonya" ? cost : BH_CLAIM_THRESHOLD;
    if (stats.available < minimumEligible) {
      setError(`${stats.ign} only has ${stats.available.toFixed(2)} available points. ${rewardBossId === "sonya" ? "6.00 points are required for Sonya." : `${BH_CLAIM_THRESHOLD.toFixed(1)}+ points are required to claim a Duck Race reward.`}`);
      return;
    }

    setSaving(true);
    try {
      const rewardRef = doc(db, "bhRewards", String(reward.id));
      const claimRef = doc(collection(db, "bhRewardClaims"));
      const actorName = getCurrentUpdaterName();
      const claimNow = new Date();

      await runTransaction(db, async (tx) => {
        const rewardSnap = await tx.get(rewardRef);
        if (!rewardSnap.exists()) throw new Error("This reward no longer exists.");
        const currentReward = rewardSnap.data() || {};
        if (lower(currentReward.status) !== "available") {
          throw new Error("This reward was already claimed or is no longer available. Refresh the reward list.");
        }
        const assignedPlayerId = String(currentReward.playerId ?? reward.playerId ?? "");
        if (!assignedPlayerId) throw new Error("This reward is not assigned to a player.");
        if (assignedPlayerId !== String(stats.id)) {
          throw new Error("This reward assignment changed. Refresh the reward list and try again.");
        }

        tx.set(claimRef, {
          playerId: String(stats.id),
          playerName: stats.ign,
          rewardId: String(reward.id),
          rewardName: reward.name,
          weaponClass: reward.weaponClass || "",
          bossId: reward.bossId,
          bossName: reward.bossName,
          points: cost,
          status: "claimed",
          claimedAt: serverTimestamp(),
          claimedBy: actorName,
          claimedByUid: currentUser?.uid || null,
          createdAt: serverTimestamp(),
          createdBy: actorName,
          createdByUid: currentUser?.uid || null,
          updatedAt: serverTimestamp(),
          updatedBy: actorName,
          updatedByUid: currentUser?.uid || null,
        });

        tx.update(rewardRef, {
          status: "claimed",
          updatedAt: serverTimestamp(),
          updatedBy: actorName,
          updatedByUid: currentUser?.uid || null,
        });
      });

      const claimMessage = rewardBossId === "sonya"
        ? `${stats.ign} claimed ${reward.name} from Sonya for 6.00 points.`
        : `${stats.ign} claimed ${reward.name} from ${reward.bossName} as a Duck Race reward.`;

      await createGuildNotice({
        title: rewardBossId === "sonya" ? "SONYA WEAPON CLAIMED" : "DUCK RACE REWARD CLAIMED",
        message: claimMessage,
        type: "success",
        module: "bh-rewards",
        action: "REWARD CLAIMED",
        entityType: "reward-claim",
        entityId: claimRef.id,
        claimId: claimRef.id,
        rewardId: reward.id,
        rewardName: reward.name,
        playerId: stats.id,
        playerName: stats.ign,
        recipientPlayerId: stats.id,
        recipientPlayerName: stats.ign,
        bossId: reward.bossId,
        bossName: reward.bossName,
        points: cost,
        status: "claimed",
        details: [
          `Recipient / owner: ${stats.ign} (${stats.id})`,
          `Reward: ${reward.name} (${reward.id})`,
          `Weapon class: ${reward.weaponClass || "Unspecified"}`,
          `Boss: ${reward.bossName || bossLabel(reward.bossId)}`,
          `Claim type: ${rewardBossId === "sonya" ? "Sonya weapon" : "Duck Race reward"}`,
          `Points used: ${cost.toFixed(2)}`,
          `Reward status: Available → Claimed`,
          `Claim record: ${claimRef.id}`,
          `Claimed by: ${actorName}`,
          `Claimed at: ${formatDateTime(claimNow, effectiveTimezone)}`,
        ],
        changes: [
          { field: "Reward status", from: reward.status || "available", to: "claimed" },
          { field: "Reward owner", from: reward.playerName || String(reward.playerId || "Unassigned"), to: stats.ign },
          { field: "Points", from: `${stats.available.toFixed(2)} available before claim`, to: `${Math.max(0, stats.available - cost).toFixed(2)} available after claim` },
        ],
        relatedModules: ["bh-rewards", "bh-attendance", "raid-schedule"],
      });

      setSuccess(claimMessage);
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not claim reward.");
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     EDIT / DELETE REWARD CLAIM

     Admin-only. A Sonya claim is always worth exactly 6.00 points.
     Editing a claim never changes that business rule. Deleting a claim
     removes the claim and returns its linked reward to AVAILABLE.
  ========================================================= */

  const openEditRewardClaim = (claim) => {
    if (!isAdmin || !claim) return;
    const player = players.find((p) => String(p.id) === String(claim.playerId || ""));
    const reward = rewards.find((r) => String(r.id) === String(claim.rewardId || ""));
    const bossId = normalizeBossId(claim.bossId || reward?.bossId);
    setEditingRewardClaim({
      ...claim,
      id: String(claim.id || ""),
      playerId: String(claim.playerId || ""),
      playerName: claim.playerName || player?.ign || "",
      rewardId: String(claim.rewardId || ""),
      rewardName: claim.rewardName || reward?.name || "Reward",
      bossId,
      bossName: claim.bossName || reward?.bossName || bossLabel(bossId),
      weaponClass: claim.weaponClass || reward?.weaponClass || "",
      points: bossId === "sonya" ? SONYA_REWARD_COST : 0,
      status: "claimed",
      notes: claim.notes || "",
    });
  };

  const saveEditedRewardClaim = async () => {
    if (!isAdmin || !editingRewardClaim) return;
    const player = players.find((p) => String(p.id) === String(editingRewardClaim.playerId || ""));
    if (!player) { setError("Please select a valid player."); return; }
    const reward = rewards.find((r) => String(r.id) === String(editingRewardClaim.rewardId || ""));
    const bossId = normalizeBossId(editingRewardClaim.bossId || reward?.bossId);
    const points = bossId === "sonya" ? SONYA_REWARD_COST : 0;
    try {
      const claimId = String(editingRewardClaim.id || "");
      const existingClaim = rewardClaims.find((claim) => String(claim.id) === claimId);
      const originalReward = rewards.find((r) => String(r.id) === String(existingClaim?.rewardId || editingRewardClaim.rewardId || ""));
      const payload = {
        playerId: String(player.id), playerName: player.ign || "",
        rewardId: String(editingRewardClaim.rewardId || ""),
        rewardName: clean(editingRewardClaim.rewardName) || reward?.name || "Reward",
        weaponClass: clean(editingRewardClaim.weaponClass || reward?.weaponClass),
        bossId, bossName: bossLabel(bossId), points, status: "claimed",
        notes: clean(editingRewardClaim.notes), updatedAt: serverTimestamp(),
        updatedBy: getCurrentUpdaterName(), updatedByUid: currentUser?.uid || null,
      };
      if (existingClaim) {
        await updateDoc(doc(db, "bhRewardClaims", claimId), payload);
      } else if (editingRewardClaim.rewardId) {
        await updateDoc(doc(db, "bhRewards", String(editingRewardClaim.rewardId)), {
          playerId: String(player.id), playerName: player.ign || "", status: "claimed",
          updatedAt: serverTimestamp(), updatedBy: getCurrentUpdaterName(),
        });
      } else throw new Error("This reward claim could not be located.");
      await createGuildNotice({
        title: "Reward Claim Updated",
        message: `${player.ign}'s ${bossLabel(bossId)} reward claim was updated by ${getCurrentUpdaterName()}.`,
        type: "info",
        action: "Reward Claim Updated",
        entityType: "reward-claim",
        entityId: claimId,
        claimId,
        rewardId: editingRewardClaim.rewardId,
        rewardName: clean(editingRewardClaim.rewardName) || reward?.name || "Reward",
        playerId: player.id,
        playerName: player.ign,
        recipientPlayerId: player.id,
        recipientPlayerName: player.ign,
        bossId,
        bossName: bossLabel(bossId),
        points,
        status: "claimed",
        notes: clean(editingRewardClaim.notes),
        relatedModules: ["bh-rewards", "bh-attendance", "raid-schedule"],
        details: [
          `Claim record: ${claimId || "legacy / reward-linked"}`,
          `Player / current owner: ${player.ign} (${player.id})`,
          `Reward: ${clean(editingRewardClaim.rewardName) || reward?.name || "Reward"}`,
          `Boss: ${bossLabel(bossId)}`,
          `Points: ${points.toFixed(2)}`,
          `Status: Claimed`,
          `Changed by: ${getCurrentUpdaterName()}`,
          `Owner movement: ${existingClaim?.playerName || originalReward?.playerName || "Unknown"} → ${player.ign}`,
          clean(editingRewardClaim.notes) ? `Notes: ${clean(editingRewardClaim.notes)}` : "",
        ].filter(Boolean),
        changes: [
          { field: "Player / owner", from: existingClaim?.playerName || originalReward?.playerName || "Unknown", to: player.ign },
          { field: "Reward", from: existingClaim?.rewardName || originalReward?.name || "Unknown", to: clean(editingRewardClaim.rewardName) || reward?.name || "Reward" },
          { field: "Boss", from: existingClaim?.bossName || originalReward?.bossName || "Unknown", to: bossLabel(bossId) },
          { field: "Points", from: `${safeNumber(existingClaim?.points, points).toFixed(2)}`, to: `${points.toFixed(2)}` },
        ],
      });
      setEditingRewardClaim(null); setSuccess("Reward claim updated."); await loadAllData(); await reloadGuildNotices();
    } catch (err) { console.error(err); setError(err?.message || "Could not update reward claim."); }
  };

  const deleteRewardClaim = async (claim) => {
    if (!isAdmin || !claim) return;

    const playerName = claim.playerName || historyPlayer?.ign || "Player";
    const confirmed = window.confirm(
      `Remove this Sonya weapon claim from ${playerName}?\n\nThis will remove the claim and return the linked reward to AVAILABLE.\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const claimId = String(claim.id || "");
      const actualClaim = rewardClaims.find(
        (item) => String(item.id) === claimId
      );

      if (actualClaim) {
        await deleteDoc(doc(db, "bhRewardClaims", claimId));
      }

      if (claim.rewardId) {
        const rewardSnap = await getDoc(
          doc(db, "bhRewards", String(claim.rewardId))
        );

        if (rewardSnap.exists()) {
          await updateDoc(
            doc(db, "bhRewards", String(claim.rewardId)),
            {
              status: "available",
              updatedAt: serverTimestamp(),
              updatedBy: getCurrentUpdaterName(),
            }
          );
        }
      }

      await createGuildNotice({
        title: "Reward Claim Removed",
        message: `${playerName}\'s Sonya weapon claim was removed by ${getCurrentUpdaterName()}. The 6.00 points are restored to the player\'s balance.`,
        type: "warning",
        action: "Reward Claim Removed",
        entityType: "reward-claim",
        entityId: claimId,
        claimId,
        rewardId: claim.rewardId,
        rewardName: claim.rewardName,
        playerId: claim.playerId,
        playerName,
        recipientPlayerId: claim.playerId,
        recipientPlayerName: playerName,
        bossId: claim.bossId,
        bossName: claim.bossName,
        points: claim.points ?? SONYA_REWARD_COST,
        status: "removed",
        relatedModules: ["bh-rewards", "bh-attendance", "raid-schedule"],
        details: [
          `Claim record: ${claimId}`,
          `Player / former owner: ${playerName} (${claim.playerId || "unknown"})`,
          `Reward: ${claim.rewardName || "Sonya weapon reward"}`,
          `Boss: ${claim.bossName || "Sonya"}`,
          `Claim removed by: ${getCurrentUpdaterName()}`,
          `Linked reward status: Returned to Available`,
          `Points restored: ${(claim.points ?? SONYA_REWARD_COST).toFixed(2)}`,
        ],
        changes: [
          `Claim status: claimed → removed`,
          `Linked reward: claimed → available`,
          `Points restored: ${(claim.points ?? SONYA_REWARD_COST).toFixed(2)}`,
        ],
      });

      setSuccess("Reward claim deleted and 6.00 points restored.");
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not delete reward claim.");
    }
  };

  /* =========================================================
     BH BULK MANAGEMENT
     Selection always points to existing Firestore record IDs. FROM/TO are
     filters only and can never create a record that did not already exist.
  ========================================================= */
  const openBHMultiTools = (mode = "menu") => {
    if (!isAdmin) return;
    setBulkAttendanceOpen(false);
    setAddPlayerModalOpen(false);
    setBulkToolsMode(mode); setBulkToolsSelected([]); setBulkToolsSearch("");
    setBulkToolsFrom(""); setBulkToolsTo(""); setBulkToolsPage(1);
    setBulkToolsComment(""); setBulkToolsError(""); setBulkToolsSaving(false);
    setBulkToolsPoints(""); setBulkToolsClass("");
    setBulkToolsWeapon(""); setBulkToolsStatus("available"); setBulkToolsNotes(""); setBulkToolsPin("");
    setBulkToolsModal("open");
  };

  const bulkBHRows = useMemo(() => {
    let rows;
    if (["player-edit","player-disable","player-delete"].includes(bulkToolsMode)) {
      rows = players.map(p => ({id:String(p.id),kind:"player",player:p,ign:clean(p.ign),className:clean(p.className||p.class),weapon:clean(p.weapon),dateKey:"",timeKey:"",sortAt:safeToDate(p.updatedAt||p.createdAt)?.getTime()||0,recordLabel:"PLAYER PROFILE",value:p.active===false?"DISABLED":"ACTIVE",status:p.active===false?"DISABLED":"ACTIVE"}));
    } else if (["reward-edit","reward-delete"].includes(bulkToolsMode)) {
      rows = rewards.map(r => { const at=safeToDate(r.updatedAt)||safeToDate(r.createdAt); return {id:String(r.id),kind:"reward",reward:r,ign:clean(r.playerName)||"UNASSIGNED",className:clean(r.weaponClass),weapon:clean(r.name),dateKey:at?dateKeyFromDate(at,effectiveTimezone):"",timeKey:at?timeKeyFromDate(at,effectiveTimezone):"",sortAt:at?.getTime()||0,recordLabel:`${bossLabel(r.bossId)} • ${clean(r.name)||"REWARD"}`,value:clean(r.status)||"available",status:(clean(r.status)||"available").toUpperCase()}; });
    } else if (["claim-edit","claim-delete"].includes(bulkToolsMode)) {
      rows = rewardClaims.filter(c=>lower(c.status)!=="cancelled").map(c=>{ const at=safeToDate(c.claimedAt)||safeToDate(c.updatedAt)||safeToDate(c.createdAt); const reward=rewards.find(r=>String(r.id)===String(c.rewardId||"")); return {id:String(c.id),kind:"claim",claim:c,reward,ign:clean(c.playerName),className:clean(c.weaponClass),weapon:clean(c.rewardName||reward?.name),dateKey:at?dateKeyFromDate(at,effectiveTimezone):"",timeKey:at?timeKeyFromDate(at,effectiveTimezone):"",sortAt:at?.getTime()||0,recordLabel:`${bossLabel(c.bossId||reward?.bossId)} • ${clean(c.rewardName||reward?.name)||"CLAIM"}`,value:`${safeNumber(c.points,0).toFixed(2)} pts`,status:(clean(c.status)||"claimed").toUpperCase()}; });
    } else {
      rows = attendanceRows.map(r=>{ const at=safeToDate(r.spawnAt)||safeToDate(r.updatedAt)||safeToDate(r.createdAt); const p=players.find(x=>String(x.id)===String(r.playerId)); return {id:String(r.id),kind:"attendance",row:r,player:p,ign:clean(r.playerName||p?.ign),className:clean(p?.className||p?.class),weapon:clean(r.bossName||bossLabel(r.bossId)),dateKey:attendanceDate(r,effectiveTimezone),timeKey:clean(r.timeKey)||(at?timeKeyFromDate(at,effectiveTimezone):""),sortAt:at?.getTime()||0,recordLabel:`${bossLabel(r.bossId)} • ${r.manualOverride?"CORRECTION":"SCHEDULED"}`,value:`+${safeNumber(r.points,0).toFixed(2)} pts`,status:r.attended===false?"DID NOT ATTEND":"ATTENDED"}; });
    }
    return rows.sort((a,b)=>(b.sortAt||0)-(a.sortAt||0)||lower(a.ign).localeCompare(lower(b.ign),undefined,{numeric:true,sensitivity:"base"}));
  },[bulkToolsMode,players,attendanceRows,rewards,rewardClaims,effectiveTimezone]);

  const filteredBHMultiRows = useMemo(()=>{ const q=lower(bulkToolsSearch); return bulkBHRows.filter(x=>{ if(bulkToolsFrom&&x.dateKey&&x.dateKey<bulkToolsFrom)return false; if(bulkToolsTo&&x.dateKey&&x.dateKey>bulkToolsTo)return false; return !q||[x.ign,x.className,x.weapon,x.dateKey,x.timeKey,x.recordLabel,x.value,x.status].some(v=>lower(v).includes(q)); }); },[bulkBHRows,bulkToolsFrom,bulkToolsTo,bulkToolsSearch]);
  const bulkBHPageCount=Math.max(1,Math.ceil(filteredBHMultiRows.length/5));
  const bulkBHSafePage=Math.min(Math.max(1,bulkToolsPage),bulkBHPageCount);
  const bulkBHVisibleRows=filteredBHMultiRows.slice((bulkBHSafePage-1)*5,bulkBHSafePage*5);
  const toggleBHMultiSelection=id=>setBulkToolsSelected(cur=>cur.includes(String(id))?cur.filter(x=>x!==String(id)):[...cur,String(id)]);
  const toggleBHMultiPage=()=>{const ids=bulkBHVisibleRows.map(x=>String(x.id));setBulkToolsSelected(cur=>ids.length&&ids.every(id=>cur.includes(id))?cur.filter(id=>!ids.includes(id)):Array.from(new Set([...cur,...ids])))};
  const bulkSelectedBHRows=bulkBHRows.filter(x=>bulkToolsSelected.includes(String(x.id)));

  const saveBHMultiChange=async()=>{
    if(!isAdmin||bulkToolsSaving)return;
    if(!bulkSelectedBHRows.length){setBulkToolsError("Select one or more EXISTING records from the table.");return;}
    if(!clean(bulkToolsComment)){setBulkToolsError("Admin comment is required for every bulk modification.");return;}
    if(bulkToolsMode==="player-delete"&&bulkToolsPin!=="12345"){setBulkToolsError("Incorrect delete PIN.");return;}
    if(bulkToolsMode==="attendance-edit"&&bulkToolsPoints!==""&&safeNumber(bulkToolsPoints,-1)<0){setBulkToolsError("Attendance points cannot be negative.");return;}
    if(bulkToolsMode==="player-edit"&&!clean(bulkToolsClass)&&bulkToolsWeapon===""){setBulkToolsError("Choose at least one player field to change.");return;}
    setBulkToolsSaving(true);setBulkToolsError("");
    try{
      for(let start=0;start<bulkSelectedBHRows.length;start+=400){
        const batch=writeBatch(db); const rows=bulkSelectedBHRows.slice(start,start+400);
        for(const x of rows){
          if(bulkToolsMode==="attendance-edit"){ if(!x.row)throw new Error(`${x.ign}: saved attendance record is missing.`); batch.update(doc(db,"bhAttendance",x.row.id),{...(bulkToolsPoints!==""?{points:safeNumber(bulkToolsPoints,0)}:{}),comment:clean(bulkToolsComment),updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName(),updatedByUid:currentUser?.uid||null}); }
          else if(bulkToolsMode==="attendance-delete"||bulkToolsMode==="attendance-redo"){if(!x.row)throw new Error(`${x.ign}: saved attendance record is missing.`);batch.delete(doc(db,"bhAttendance",x.row.id));}
          else if(bulkToolsMode==="player-edit"){const p=x.player;const cls=clean(bulkToolsClass)||clean(p.className||p.class);batch.update(doc(db,"players",p.id),{...(cls?{class:cls,className:cls}:{}),...(bulkToolsWeapon!==""?{weapon:clean(bulkToolsWeapon)}:{}),updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName(),updatedByUid:currentUser?.uid||null});}
          else if(bulkToolsMode==="player-disable"){batch.update(doc(db,"players",x.player.id),{active:false,status:"disabled",updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName(),updatedByUid:currentUser?.uid||null});}
          else if(bulkToolsMode==="player-delete"){batch.delete(doc(db,"players",x.player.id));}
          else if(bulkToolsMode==="reward-edit"){batch.update(doc(db,"bhRewards",x.reward.id),{status:clean(bulkToolsStatus)||clean(x.reward.status)||"available",notes:bulkToolsNotes!==""?clean(bulkToolsNotes):clean(x.reward.notes),updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName()});}
          else if(bulkToolsMode==="reward-delete"){if(rewardClaims.some(c=>String(c.rewardId||"")===String(x.reward.id)))throw new Error(`${x.weapon}: has claim history and cannot be deleted. Disable it instead.`);batch.delete(doc(db,"bhRewards",x.reward.id));}
          else if(bulkToolsMode==="claim-edit"){batch.update(doc(db,"bhRewardClaims",x.claim.id),{notes:bulkToolsNotes!==""?clean(bulkToolsNotes):clean(x.claim.notes),updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName(),updatedByUid:currentUser?.uid||null});}
          else if(bulkToolsMode==="claim-delete"){batch.delete(doc(db,"bhRewardClaims",x.claim.id));if(x.claim.rewardId){const reward=rewards.find(r=>String(r.id)===String(x.claim.rewardId));if(reward)batch.update(doc(db,"bhRewards",reward.id),{status:"available",updatedAt:serverTimestamp(),updatedBy:getCurrentUpdaterName(),updatedByUid:currentUser?.uid||null});}}
        }
        await batch.commit();
      }
      const labels={"attendance-edit":"attendance records corrected","attendance-delete":"attendance records deleted","attendance-redo":"attendance records removed for redo","player-edit":"player profiles updated","player-disable":"players disabled","player-delete":"player profiles deleted","reward-edit":"rewards updated","reward-delete":"rewards deleted","claim-edit":"reward claims updated","claim-delete":"reward claims deleted and linked rewards restored"};
      const title=`BH BULK ${bulkToolsMode.replaceAll("-"," ").toUpperCase()}`;
      await createGuildNotice({title,message:`${bulkSelectedBHRows.length} existing ${labels[bulkToolsMode]||"records"}.`,type:bulkToolsMode.includes("delete")?"warning":"info",module:"bh-attendance",action:title,entityType:"bh-bulk-management",entityId:bulkSelectedBHRows.map(x=>x.id).join(","),details:[`Records changed: ${bulkSelectedBHRows.length}`,`Exact record IDs: ${bulkSelectedBHRows.map(x=>x.id).join(", ")}`,`Dates targeted: ${Array.from(new Set(bulkSelectedBHRows.map(x=>x.dateKey).filter(Boolean))).join(", ")||"record-specific saved dates only"}`,`Admin comment: ${clean(bulkToolsComment)}`,`Changed by: ${getCurrentUpdaterName()}`]});
      setBulkToolsModal(null);setSuccess(`${bulkSelectedBHRows.length} existing record${bulkSelectedBHRows.length===1?"":"s"} processed. No new record was created.`);await loadAllData();await reloadGuildNotices();
    }catch(err){console.error(err);setBulkToolsError(err?.message||"Bulk change failed.");}finally{setBulkToolsSaving(false);}
  };

  /* =========================================================
     EDIT ATTENDANCE
  ========================================================= */

  const openEditAttendance =
    (row) => {
      if (!isAdmin) return;

      const spawnAt =
        safeToDate(
          row.spawnAt
        );

      setEditingAttendance(
        row
      );

      setEditAttendanceBoss(
        row.bossId
      );

      setEditAttendanceDate(
        row.dateKey ||
        (
          spawnAt
            ? dateKeyFromDate(
              spawnAt,
              effectiveTimezone
            )
            : todayKey
        )
      );

      setEditAttendanceTime(
        row.timeKey ||
        (
          spawnAt
            ? timeKeyFromDate(
              spawnAt,
              effectiveTimezone
            )
            : "12:00"
        )
      );

      setEditAttendancePoints(
        safeNumber(
          row.points,
          0
        )
      );

      setEditAttendanceComment(
        clean(
          row.comment
        )
      );
    };

  const saveEditedAttendance =
    async () => {
      if (
        !isAdmin ||
        !editingAttendance
      ) {
        return;
      }

      const spawnAt =
        zonedLocalToDate(
          editAttendanceDate,
          editAttendanceTime,
          effectiveTimezone
        );

      if (!spawnAt) {
        setError(
          "Invalid attendance date/time."
        );
        return;
      }

      const bossId =
        normalizeBossId(
          editAttendanceBoss
        );

      const oldPoints =
        safeNumber(
          editingAttendance.points,
          0
        );

      const newPoints =
        safeNumber(
          editAttendancePoints,
          0
        );

      try {
        await updateDoc(
          doc(
            db,
            "bhAttendance",
            String(
              editingAttendance.id
            )
          ),
          {
            bossId,

            bossName:
              bossLabel(
                bossId
              ),

            points:
              newPoints,

            spawnAt,

            dateKey:
              dateKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            localDate:
              dateKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            timeKey:
              timeKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            localTime:
              timeKeyFromDate(
                spawnAt,
                effectiveTimezone
              ),

            primaryDateKey:
              dateKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryLocalDate:
              dateKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryTimeKey:
              timeKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            primaryLocalTime:
              timeKeyFromDate(
                spawnAt,
                PRIMARY_TIMEZONE
              ),

            comment:
              clean(
                editAttendanceComment
              ),

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),

            updatedByUid:
              currentUser?.uid ||
              null,
          }
        );

        if (
          oldPoints !==
          newPoints
        ) {
          await createGuildNotice(
            {
              title:
                "Boss Hunt Points Changed",

              message:
                `${editingAttendance.playerName || "Player"}: ${oldPoints.toFixed(
                  2
                )} → ${newPoints.toFixed(
                  2
                )} points for ${bossLabel(
                  bossId
                )}.`,

              type: "warning",
            }
          );
        } else {
          await createGuildNotice(
            {
              title:
                "Boss Hunt Attendance Updated",

              message:
                `${editingAttendance.playerName || "Player"} attendance for ${bossLabel(
                  bossId
                )} was updated.`,

              type: "info",
            }
          );
        }

        setEditingAttendance(
          null
        );

        setSuccess(
          "Attendance updated."
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        setError(
          err?.message ||
          "Could not update attendance."
        );
      }
    };

  /* =========================================================
     DELETE ATTENDANCE
  ========================================================= */

  const deleteAttendance =
    async (row) => {
      if (!isAdmin) return;

      const confirmed =
        window.confirm(
          `Delete ${row.playerName ||
          "this player's"
          } ${row.bossName} attendance record?`
        );

      if (!confirmed)
        return;

      try {
        await deleteDoc(
          doc(
            db,
            "bhAttendance",
            String(
              row.id
            )
          )
        );

        await createGuildNotice(
          {
            title:
              "Attendance Removed",

            message:
              `${row.playerName || "Player"}'s ${row.bossName} attendance record was removed by ${getCurrentUpdaterName()}.`,

            type: "warning",
          }
        );

        setSuccess(
          "Attendance deleted."
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        setError(
          err?.message ||
          "Could not delete attendance."
        );
      }
    };

  /* =========================================================
     PLAYER HISTORY — COMPLETE ATTENDANCE + REWARD LEDGER

     Attendance rows are lifetime attendance records.
     Reward rows are Sonya weapon claims.
     One Sonya claim always deducts exactly 6.00 points.
  ========================================================= */

  const historyActivityRows = useMemo(() => {
    if (!historyPlayer) return [];

    const playerId = String(historyPlayer.id);
    const rows = [];

    attendanceRows
      .filter((row) => String(row?.playerId ?? "") === playerId)
      .forEach((row) => {
        const at =
          safeToDate(row?.spawnAt) ||
          safeToDate(row?.createdAt) ||
          safeToDate(row?.updatedAt);

        rows.push({
          id: `attendance-${row.id}`,
          eventType: "attendance",
          dateTime: at,
          dateKey: row.dateKey || formatDate(at, effectiveTimezone),
          timeKey: row.timeKey || formatTime(at, effectiveTimezone),
          bossName: clean(row.bossName) || "Unknown Boss",
          details: row.manualOverride
            ? (clean(row.comment) || "Attendance correction")
            : "Scheduled spawn attendance",
          points: safeNumber(row.points, 0),
          relatedReward: "—",
          updatedAt: safeToDate(row.updatedAt) || safeToDate(row.createdAt),
          updatedBy: clean(row.updatedBy) || "SYSTEM",
          attendanceRow: row,
        });
      });

    /*
     * De-duplicate claims by rewardId. Older data can contain both a
     * bhRewardClaims document and a claimed bhRewards document for the same
     * Sonya weapon. They represent one claim, not two.
     */
    const claimMap = new Map();

    rewardClaims.forEach((claim) => {
      if (String(claim?.playerId ?? "") !== playerId) return;
      if (lower(claim?.status) === "cancelled") return;

      const linkedReward = rewards.find(
        (reward) => String(reward?.id ?? "") === String(claim?.rewardId ?? "")
      );

      const claimBoss = normalizeBossId(
        claim?.bossId ?? claim?.boss ?? claim?.bossName ?? linkedReward?.bossName
      );
      const linkedBoss = normalizeBossId(
        linkedReward?.bossId ?? linkedReward?.boss ?? linkedReward?.bossName
      );

      if (claimBoss !== "sonya" && linkedBoss !== "sonya") return;

      const key = claim?.rewardId
        ? `reward:${claim.rewardId}`
        : `claim:${claim.id}`;

      claimMap.set(key, {
        ...claim,
        rewardName: clean(
          claim?.rewardName ?? claim?.name ?? linkedReward?.name
        ) || "Sonya Weapon",
        claimedAt:
          safeToDate(claim?.claimedAt) ||
          safeToDate(claim?.updatedAt) ||
          safeToDate(claim?.createdAt),
        claimedBy:
          clean(claim?.claimedBy ?? claim?.updatedBy ?? claim?.createdBy) ||
          "SYSTEM",
      });
    });

    /* Include legacy claimed reward records when no claim document exists. */
    rewards.forEach((reward) => {
      if (String(reward?.playerId ?? "") !== playerId) return;
      if (lower(reward?.status) !== "claimed") return;

      const bossId = normalizeBossId(
        reward?.bossId ?? reward?.boss ?? reward?.bossName
      );
      if (bossId !== "sonya") return;

      const key = `reward:${reward.id}`;
      if (claimMap.has(key)) return;

      claimMap.set(key, {
        id: `reward-${reward.id}`,
        rewardId: String(reward.id),
        playerId,
        rewardName: clean(reward?.name ?? reward?.rewardName) || "Sonya Weapon",
        claimedAt:
          safeToDate(reward?.updatedAt) ||
          safeToDate(reward?.createdAt),
        claimedBy:
          clean(reward?.updatedBy ?? reward?.createdBy) ||
          "SYSTEM",
      });
    });

    claimMap.forEach((claim) => {
      rows.push({
        id: `reward-${claim.rewardId || claim.id}`,
        eventType: "reward",
        dateTime: claim.claimedAt,
        dateKey: formatDate(claim.claimedAt, effectiveTimezone),
        timeKey: formatTime(claim.claimedAt, effectiveTimezone),
        bossName: "Sonya",
        details: `Sonya weapon claimed: ${claim.rewardName}`,
        points: -6,
        relatedReward: claim.rewardName,
        updatedAt: safeToDate(claim.updatedAt) || claim.claimedAt,
        updatedBy: claim.claimedBy || "SYSTEM",
        rewardClaim: claim,
      });
    });

    return rows.sort(
      (a, b) => updatedTimeMs(b, "dateTime") - updatedTimeMs(a, "dateTime")
    );
  }, [historyPlayer, attendanceRows, rewardClaims, rewards, effectiveTimezone]);

  const historyRows = useMemo(() => {
    const q = lower(historySearch.trim());

    let filtered = historyActivityRows;

    if (historyTab === "attendance") {
      filtered = filtered.filter((row) => row.eventType === "attendance");
    } else if (historyTab === "rewards") {
      filtered = filtered.filter((row) => row.eventType === "reward");
    }

    if (!q) return filtered;

    return filtered.filter((row) =>
      [
        row.dateKey,
        row.timeKey,
        row.bossName,
        row.details,
        row.relatedReward,
        row.updatedBy,
        row.eventType,
      ].some((value) => lower(value).includes(q))
    );
  }, [historyActivityRows, historySearch, historyTab]);

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE));

  const visibleHistory = historyRows.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [historyTab, historyPlayer]);

  /* =========================================================
     CLEAR MESSAGES
  ========================================================= */

  useEffect(() => {
    if (!success && !error)
      return;

    const timer =
      setTimeout(() => {
        setSuccess("");
        setError("");
      }, 6000);

    return () =>
      clearTimeout(timer);
  }, [
    success,
    error,
  ]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const totalPlayers =
    players.length;

  const selectedPlayer =
    players.find(
      (player) =>
        String(
          player.id
        ) ===
        String(
          attendancePlayerId
        )
    ) || null;

  const totalAvailableRewardCount =
    rewards.filter(
      (reward) =>
        reward.status ===
        "available"
    ).length;

  const totalRewardCount =
    rewards.filter(
      (reward) =>
        reward.status !== "disabled"
    ).length;

  /*
   * A reward is considered claimed when either the reward record itself is
   * marked claimed OR a matching bhRewardClaims record exists.  This keeps
   * the Reward Center synchronized with the player ledger after claims and
   * admin overrides.
   */
  const claimedRewardIds = useMemo(() => {
    const ids = new Set();

    rewards.forEach((reward) => {
      if (lower(reward.status) === "claimed") {
        ids.add(String(reward.id));
      }
    });

    rewardClaims.forEach((claim) => {
      if (lower(claim.status) === "cancelled") return;
      if (claim.rewardId) ids.add(String(claim.rewardId));
    });

    return ids;
  }, [rewards, rewardClaims]);

  const totalClaimedRewardCount = useMemo(
    () =>
      rewards.filter((reward) =>
        claimedRewardIds.has(String(reward.id))
      ).length,
    [rewards, claimedRewardIds]
  );

  const totalUnclaimedRewardCount = useMemo(
    () =>
      rewards.filter(
        (reward) =>
          reward.status === "available" &&
          !claimedRewardIds.has(String(reward.id))
      ).length,
    [rewards, claimedRewardIds]
  );

  /*
   * Reward Center:
   * Always show all four BH bosses, even when no reward exists yet.
   * "Total" = active reward records (available + claimed).
   * "Claimed" = claimed active reward records.
   * "Unclaimed" = currently available reward records.
   */
  const rewardBossSummary = useMemo(() => {
    const byBoss = new Map();

    DEFAULT_BOSS_LIST.forEach((boss) => {
      byBoss.set(boss.id, {
        id: boss.id,
        name: boss.name,
        total: 0,
        claimed: 0,
        unclaimed: 0,
      });
    });

    rewards.forEach((reward) => {
      if (reward.status === "disabled") {
        return;
      }

      const id = normalizeBossId(
        reward.bossId ??
        reward.bossName
      );

      const boss =
        byBoss.get(id) ||
        {
          id,
          name: bossLabel(id),
          total: 0,
          claimed: 0,
          unclaimed: 0,
        };

      boss.total += 1;

      if (claimedRewardIds.has(String(reward.id))) {
        boss.claimed += 1;
      } else if (reward.status === "available") {
        boss.unclaimed += 1;
      }

      byBoss.set(id, boss);
    });

    const order = [
      "sonya",
      "geomancer",
      "giant-hawk",
      "reflector",
    ];

    return Array.from(byBoss.values()).sort(
      (a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
    );
  }, [rewards, claimedRewardIds]);

  const bossImagePath = (bossId) => {
    const id = normalizeBossId(bossId);

    const images = {
      sonya: sonyaImage,
      geomancer: geomancerImage,
      "giant-hawk": giantHawkImage,
      reflector: reflectorImage,
    };

    return images[id] || sonyaImage;
  };

  const weaponClassIconPath = (weaponClass) => {
    const key = lower(weaponClass).replace(/[^a-z]/g, "");
    const icons = {
      swordman: swordmanIcon,
      swordsman: swordmanIcon,
      archer: archerIcon,
      gunner: gunnerIcon,
      shaman: shamanIcon,
      extreme: extremeIcon,
      brawler: brawlerIcon,
    };
    return icons[key] || null;
  };

  const getDuckRaceStatus = (bossId, date = todayKey) => {
    const id = normalizeBossId(bossId);
    return duckRaceStatuses.find(
      (item) => item.bossId === id && item.dateKey === date
    ) || null;
  };

  const miniBossIds = ["geomancer", "giant-hawk", "reflector"];

  const todayRewardClaimsByBoss = useMemo(() => {
    const groups = new Map();
    DEFAULT_BOSS_LIST.forEach((boss) => groups.set(boss.id, []));
    rewardClaims.forEach((claim) => {
      if (lower(claim.status) === "cancelled") return;
      const claimedAt = safeToDate(claim.claimedAt);
      if (!claimedAt || dateKeyFromDate(claimedAt, effectiveTimezone) !== todayKey) return;
      const bossId = normalizeBossId(claim.bossId ?? claim.bossName);
      if (!groups.has(bossId)) groups.set(bossId, []);
      groups.get(bossId).push(claim);
    });
    groups.forEach((claims) => claims.sort((a, b) => (safeToDate(a.claimedAt)?.getTime() || 0) - (safeToDate(b.claimedAt)?.getTime() || 0)));
    return groups;
  }, [rewardClaims, effectiveTimezone, todayKey]);

  const lastWinnerByBoss = useMemo(() => {
    const latest = new Map();
    rewardClaims.forEach((claim) => {
      if (lower(claim.status) === "cancelled") return;
      const d = safeToDate(claim.claimedAt);
      if (!d) return;
      const bossId = normalizeBossId(claim.bossId ?? claim.bossName);
      const existing = latest.get(bossId);
      if (!existing || d.getTime() > (safeToDate(existing.claimedAt)?.getTime() || 0)) latest.set(bossId, claim);
    });
    return latest;
  }, [rewardClaims]);

  const rewardLastUpdated = useMemo(() => {
    const events = rewards.flatMap((reward) => [
      { at: safeToDate(reward.updatedAt), by: reward.updatedBy },
      { at: safeToDate(reward.createdAt), by: reward.createdBy },
    ]).filter((x) => x.at);
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events[0] || null;
  }, [rewards]);

  const setDuckRaceForToday = async (bossId, nextStatus) => {
    if (!isAdmin || !miniBossIds.includes(normalizeBossId(bossId))) return;
    setDuckRaceSaving(true);
    try {
      const id = normalizeBossId(bossId);
      const docId = `${id}_${todayKey}`;
      await setDoc(doc(db, "bhDuckRaceStatus", docId), {
        bossId: id,
        bossName: bossLabel(id),
        dateKey: todayKey,
        status: nextStatus,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUpdaterName(),
        updatedByUid: currentUser?.uid || null,
      }, { merge: true });
      await createGuildNotice({
        title: nextStatus === "duck-raced" ? "Duck Race Completed" : "Duck Race Reset",
        message: `${bossLabel(id)} was marked ${nextStatus === "duck-raced" ? "DUCK RACED" : "NOT YET"} for ${todayKey} by ${getCurrentUpdaterName()}.`,
        type: nextStatus === "duck-raced" ? "success" : "warning",
        action: nextStatus === "duck-raced" ? "Duck Race Completed" : "Duck Race Reset",
        entityType: "duck-race",
        entityId: `${id}_${todayKey}`,
        bossId: id,
        bossName: bossLabel(id),
        status: nextStatus,
        details: [
          `Boss: ${bossLabel(id)}`,
          `Local date: ${todayKey}`,
          `Previous status: ${nextStatus === "duck-raced" ? "Not Yet" : "Duck Raced"}`,
          `New status: ${nextStatus === "duck-raced" ? "Duck Raced" : "Not Yet"}`,
          `Changed by: ${getCurrentUpdaterName()}`,
        ],
        changes: [
          `Duck Race status: ${nextStatus === "duck-raced" ? "Not Yet → Duck Raced" : "Duck Raced → Not Yet"}`,
        ],
      });
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      setError(err?.message || "Could not update Duck Race status.");
    } finally {
      setDuckRaceSaving(false);
    }
  };

  const deleteReward = async (reward) => {
    if (!isAdmin || !reward) return;
    const linkedClaims = rewardClaims.filter((claim) => String(claim.rewardId || "") === String(reward.id));
    if (linkedClaims.length) {
      setError("This reward has claim history and cannot be deleted. Disable it instead to preserve the ledger.");
      return;
    }
    if (!window.confirm(`Delete reward \"${reward.name}\"?\n\nThis cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "bhRewards", String(reward.id)));
      await createGuildNotice({
        title: "Reward Deleted",
        message: `${reward.name} was deleted by ${getCurrentUpdaterName()}.`,
        type: "warning",
        action: "Reward Deleted",
        entityType: "reward",
        entityId: reward.id,
        rewardId: reward.id,
        rewardName: reward.name,
        playerId: reward.playerId,
        playerName: reward.playerName,
        bossId: reward.bossId,
        bossName: reward.bossName,
        points: reward.cost,
        status: "deleted",
        details: [
          `Reward: ${reward.name}`,
          `Boss: ${reward.bossName || bossLabel(reward.bossId)}`,
          `Cost: ${safeNumber(reward.cost, 0).toFixed(2)} points`,
          `Assigned player: ${reward.playerName || "Unassigned"}`,
          `Previous status: ${reward.status || "available"}`,
          `Deleted by: ${getCurrentUpdaterName()}`,
        ],
        changes: [`Reward record: ${reward.status || "available"} → deleted`],
      });
      setSuccess("Reward deleted.");
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      setError(err?.message || "Could not delete reward.");
    }
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="bh-page">
      <div className="bh-page-header">
        <div>
          <div className="bh-eyebrow">
            RAN ONLINE EP7 CLASSIC • Boss Hunt
          </div>

          <h1>
            Boss Hunt Attendance
          </h1>

          <p>
            Track boss hunt
            attendance, player
            points, rewards and
            guild activity.
          </p>
        </div>

        <div className="bh-header-status-group">
          <div className="bh-live-status" aria-label="Realtime Firebase status">
            <span className="bh-live-status-dot">● LIVE</span>
            <strong>REALTIME FIREBASE</strong>
            <small>DISPLAYING IN {effectiveTimezone}</small>
          </div>
          <div className="bh-view-status">
            {isAdmin ? "ADMIN" : "VIEW ONLY"}
          </div>
        </div>
      </div>

      {error && (
        <div className="bh-alert bh-alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bh-alert bh-alert-success">
          {success}
        </div>
      )}

      {/* Summary cards removed per dashboard cleanup request. */}

      {/* ===================================================
          TABS
      =================================================== */}

      <nav className="bh-tabs bh-primary-nav" aria-label="Boss Hunt sections">
        <button type="button" className={`bh-tab ${activeTab === "schedule" ? "active" : ""}`} onClick={() => switchActiveTab("schedule")} aria-selected={activeTab === "schedule"}>
          <span className="bh-tab-icon bh-tab-icon-schedule" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9h17M7 13h3M14 13h3M7 16.5h3" /></svg></span>
          <span className="bh-tab-copy"><strong>ACTUAL SCHEDULE</strong><small>View boss spawns</small></span>
        </button>
        <button type="button" className={`bh-tab ${activeTab === "players" ? "active" : ""}`} onClick={() => switchActiveTab("players")} aria-selected={activeTab === "players"}>
          <span className="bh-tab-icon bh-tab-icon-players" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6" /><path d="M15 6.5a3 3 0 0 1 0 5.8M16 14c2.6.3 4.1 2.1 4.5 5.5" /></svg></span>
          <span className="bh-tab-copy"><strong>PLAYERS &amp; HISTORY</strong><small>Roster &amp; attendance</small></span>
        </button>
        <button type="button" className={`bh-tab ${activeTab === "rewards" ? "active" : ""}`} onClick={() => switchActiveTab("rewards")} aria-selected={activeTab === "rewards"}>
          <span className="bh-tab-icon bh-tab-icon-rewards" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8.5h14v11H5z" /><path d="M4 8.5h16v-3H4zM12 5.5v14M12 5.5c-2.8 0-4-1.1-4-2.6 0-1.1.9-1.9 2-1.9 1.7 0 2.8 2.2 2 4.5zm0 0c2.8 0 4-1.1 4-2.6 0-1.1-.9-1.9-2-1.9-1.7 0-2.8 2.2-2 4.5z" /></svg></span>
          <span className="bh-tab-copy"><strong>REWARDS</strong><small>Claims &amp; inventory</small></span>
        </button>
        <button
          type="button"
          className={`bh-notice-toggle ${noticePanelOpen ? "is-on" : "is-off"}`}
          onClick={toggleNoticePanel}
          aria-pressed={noticePanelOpen}
          aria-controls="bh-notifications-panel"
          title={noticePanelOpen ? "Hide Activity & Notifications" : "Show Activity & Notifications"}
        >
          <span className="bh-notice-toggle-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" /><path d="M10 21h4" /></svg>
          </span>
          <span className="bh-notice-toggle-copy">
            <strong>ACTIVITY &amp; NOTIFICATIONS</strong>
            <small>BOSS HUNT AUDIT FEED</small>
          </span>
          <span className="bh-notice-switch" aria-hidden="true"><span /></span>
        </button>
      </nav>

      {/* ===================================================
                  UNIFIED GUILD BOSS HUNT NOTIFICATIONS
                  One audit feed — no duplicate NEW/OLD tables.
              =================================================== */}
      <section className={`bh-panel bh-notifications-full bh-notifications-unified bh-notifications-slide ${noticePanelOpen ? "is-open" : "is-closed"}`} id="bh-notifications-panel" aria-hidden={!noticePanelOpen}>
        <div className="bh-unified-notice-header">
          <div className="bh-unified-notice-title-wrap">
            <div className="bh-unified-notice-emblem"><span>♟</span></div>
            <div>
              <div className="bh-section-kicker">GUILD BOSS HUNT NOTIFICATIONS</div>
              <h2>Activity &amp; Notifications</h2>
              <p>Track every Boss Hunt activity in one unified audit feed. NEW is based on the current local calendar day.</p>
            </div>
          </div>
          <div className="bh-unified-notice-summary">
            <div className="bh-unified-count new"><strong>{newNotices.length}</strong><span>NEW TODAY</span></div>
            <div className="bh-unified-count"><strong>{sortedGuildNotices.length}</strong><span>TOTAL</span></div>
            <button type="button" className="bh-unified-refresh" onClick={reloadGuildNotices} aria-label="Refresh notifications">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-4L3 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 13a8 8 0 0 0 14.8 4L21 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 19v-5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              REFRESH
            </button>
          </div>
        </div>

        <div className="bh-unified-notice-filters">
          <div className="bh-unified-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input className="bh-input" type="search" placeholder="Search player, action, reward, boss, or admin..." value={noticeSearch} onChange={(e) => { setNoticeSearch(e.target.value); setNoticeAllPage(1); }} />
          </div>
          <select className="bh-input" value={noticeTypeFilter} onChange={(e) => { setNoticeTypeFilter(e.target.value); setNoticeAllPage(1); }} aria-label="Filter notification category">
            <option value="all">ALL TYPES</option>
            <option value="reward">REWARD</option>
            <option value="attendance">ATTENDANCE</option>
            <option value="points">POINTS</option>
            <option value="player">PLAYER</option>
            <option value="schedule">SCHEDULE</option>
            <option value="admin">ADMIN</option>
            <option value="system">SYSTEM</option>
          </select>
          <select className="bh-input" value={noticeAdminFilter} onChange={(e) => { setNoticeAdminFilter(e.target.value); setNoticeAllPage(1); }} aria-label="Filter notification admin">
            <option value="all">ALL ADMINS</option>
            {noticeAdmins.map((admin) => <option key={admin} value={admin}>{admin}</option>)}
          </select>
          <select className="bh-input" value={noticeTimeFilter} onChange={(e) => { setNoticeTimeFilter(e.target.value); setNoticeAllPage(1); }} aria-label="Filter notification time">
            <option value="all">ALL TIME</option>
            <option value="today">TODAY</option>
            <option value="7">LAST 7 DAYS</option>
            <option value="30">LAST 30 DAYS</option>
          </select>
          <div className="bh-unified-date-control">
            <label>DATE</label>
            <div className="bh-unified-date-input">
              <input className="bh-input" type="date" aria-label="Choose notification date" value={noticeDateFilter} onChange={(e) => { setNoticeDateFilter(e.target.value); setNoticeAllPage(1); }} />
              <span aria-hidden="true">▣</span>
            </div>
          </div>
          <div className="bh-unified-time-control"><label>FROM</label><input className="bh-input" type="time" value={noticeFromTime} onChange={(e) => { setNoticeFromTime(e.target.value); setNoticeAllPage(1); }} /></div>
          <div className="bh-unified-time-control"><label>TO</label><input className="bh-input" type="time" value={noticeToTime} onChange={(e) => { setNoticeToTime(e.target.value); setNoticeAllPage(1); }} /></div>
          {noticeDateFilter && <button type="button" className="bh-secondary-button bh-unified-clear" onClick={() => { setNoticeDateFilter(""); setNoticeFromTime("11:00"); setNoticeToTime("03:00"); setNoticeAllPage(1); }}>CLEAR DATE</button>}
        </div>

        <div className="bh-unified-notice-results-head">
          <div><strong>{filteredAllNotices.length}</strong> notifications found <span className="bh-results-dot">•</span> <b>{newNotices.length}</b> new today</div>
          <div>Showing {filteredAllNotices.length ? `${(safeAllPage - 1) * NOTICE_PAGE_SIZE + 1}–${Math.min(safeAllPage * NOTICE_PAGE_SIZE, filteredAllNotices.length)}` : "0"} of {filteredAllNotices.length}</div>
        </div>

        <div className="bh-unified-notice-table-wrap">
          <table className="bh-unified-notice-table">
            <colgroup><col className="c-num" /><col className="c-status" /><col className="c-icon" /><col className="c-category" /><col className="c-message" /><col className="c-time" /><col className="c-by" /><col className="c-open" /></colgroup>
            <thead><tr><th>#</th><th>STATUS</th><th>ICON</th><th>CATEGORY</th><th>MESSAGE</th><th>TIME</th><th>BY</th><th aria-label="Open"></th></tr></thead>
            <tbody>
              {pagedAllNotices.map((notice, index) => {
                const category = noticeCategoryKey(notice);
                const categoryClass = noticeCategoryClass(notice);
                const isNew = noticeDayKey(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone) === todayKey;
                return (
                  <tr key={notice.id} className={`bh-unified-notice-row category-${categoryClass}`} onClick={() => setSelectedNotice(notice)} title="Click to view full notification details">
                    <td className="notice-number">{(safeAllPage - 1) * NOTICE_PAGE_SIZE + index + 1}</td>
                    <td><span className={`bh-unified-status ${isNew ? "new" : "old"}`}>{isNew ? "NEW" : "OLD"}</span></td>
                    <td><span className={`bh-unified-icon category-${categoryClass}`}><NoticeCategoryIcon category={category} /></span></td>
                    <td><span className={`bh-unified-category category-${categoryClass}`}>{noticeTypeLabel(notice)}</span></td>
                    <td><div className="bh-unified-message"><strong>{notice.title || "Guild Activity"}</strong><span>{notice.message || "No additional message recorded."}</span></div></td>
                    <td className="notice-time">{formatDateTime(notice.updatedAt || notice.createdAt || notice.timestamp, effectiveTimezone)}</td>
                    <td className="notice-by">{notice.createdBy || "System"}</td>
                    <td className="notice-open"><span>›</span></td>
                  </tr>
                );
              })}
              {!pagedAllNotices.length && <tr><td colSpan="8" className="bh-unified-empty">No notifications match your filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bh-unified-pagination">
          <button disabled={safeAllPage <= 1} onClick={() => setNoticeAllPage(1)} aria-label="First page">«</button>
          <button disabled={safeAllPage <= 1} onClick={() => setNoticeAllPage((p) => Math.max(1, p - 1))} aria-label="Previous page">‹</button>
          {Array.from({ length: Math.min(5, allNoticePageCount) }, (_, i) => {
            const page = allNoticePageCount <= 5 ? i + 1 : Math.max(1, Math.min(allNoticePageCount - 4, safeAllPage - 2)) + i;
            return <button key={page} className={safeAllPage === page ? "active" : ""} onClick={() => setNoticeAllPage(page)}>{page}</button>;
          })}
          <button disabled={safeAllPage >= allNoticePageCount} onClick={() => setNoticeAllPage((p) => Math.min(allNoticePageCount, p + 1))} aria-label="Next page">›</button>
          <button disabled={safeAllPage >= allNoticePageCount} onClick={() => setNoticeAllPage(allNoticePageCount)} aria-label="Last page">»</button>
        </div>
      </section>

      {activeTab === "schedule" && (
        /* ===================================================
            ACTUAL SCHEDULE
        =================================================== */

        <section id="bh-schedule-panel" className="bh-panel bh-schedule-panel">
          <div className="bh-panel-header">
            <div>
              <div className="bh-section-kicker">
                EXACT SCHEDULED
                SPAWN
              </div>

              <h2>
                Actual Raid Schedule
              </h2>

              <p>
                Schedule times come
                directly from the
                canonical Raid
                Schedule.
              </p>
            </div>

          </div>

          <div className="bh-schedule-controls">
            <div className="bh-form-group">
              <label>
                DAYS BACK
              </label>

              <select
                className="bh-select"
                value={
                  scheduleBackDays
                }
                onChange={(e) =>
                  setScheduleBackDays(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                {Array.from(
                  {
                    length: 8,
                  },
                  (_, i) => (
                    <option
                      key={i}
                      value={i}
                    >
                      {i}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="bh-form-group">
              <label>
                DAYS FORWARD
              </label>

              <select
                className="bh-select"
                value={
                  scheduleForwardDays
                }
                onChange={(e) =>
                  setScheduleForwardDays(
                    Number(
                      e.target.value
                    )
                  )
                }
              >
                {Array.from(
                  {
                    length: 8,
                  },
                  (_, i) => (
                    <option
                      key={i}
                      value={i}
                    >
                      {i}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="bh-form-group">
              <label>
                STATUS
              </label>

              <select
                className="bh-select"
                value={
                  scheduleStatusFilter
                }
                onChange={(e) =>
                  setScheduleStatusFilter(
                    e.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                <option value="active">
                  Active
                </option>

                <option value="inactive">
                  Inactive
                </option>
              </select>
            </div>

            <div className="bh-form-group">
              <label>
                BOSS
              </label>

              <select
                className="bh-select"
                value={
                  scheduleBossFilter
                }
                onChange={(e) =>
                  setScheduleBossFilter(
                    e.target.value
                  )
                }
              >
                <option value="all">
                  All Bosses
                </option>

                {bossOptions.map(
                  (boss) => (
                    <option
                      key={
                        boss.id
                      }
                      value={
                        boss.id
                      }
                    >
                      {
                        boss.name
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="bh-window-info">
            TODAY is always shown
            first. Showing{" "}
            <strong>
              {scheduleBackDays}
            </strong>{" "}
            previous day
            {scheduleBackDays ===
              1
              ? ""
              : "s"} and{" "}
            <strong>
              {
                scheduleForwardDays
              }
            </strong>{" "}
            future day
            {scheduleForwardDays ===
              1
              ? ""
              : "s"}.
          </div>

          <div className="bh-schedule-list">
            {orderedScheduleDateKeys.map(
              (dateKey) => {
                const occurrences =
                  filteredScheduleOccurrences.filter(
                    (item) =>
                      item.dateKey ===
                      dateKey
                  );

                const isToday =
                  dateKey ===
                  todayKey;

                const isSelected =
                  dateKey ===
                  selectedScheduleDate;

                return (
                  <div
                    key={
                      dateKey
                    }
                    className={`bh-date-section ${isSelected
                      ? "selected"
                      : ""
                      }`}
                  >
                    <button
                      className="bh-date-header"
                      onClick={() =>
                        setSelectedScheduleDate(
                          dateKey
                        )
                      }
                    >
                      <div>
                        <span className="bh-date-badge">
                          {isToday
                            ? "TODAY"
                            : dateKey <
                              todayKey
                              ? "PREVIOUS"
                              : "UPCOMING"}
                        </span>

                        <strong>
                          {formatLongDate(
                            zonedLocalToDate(
                              dateKey,
                              "12:00",
                              effectiveTimezone
                            ),
                            effectiveTimezone
                          )}
                        </strong>
                      </div>

                      <span>
                        {
                          occurrences.length
                        }{" "}
                        spawn
                        {occurrences.length ===
                          1
                          ? ""
                          : "s"}
                      </span>
                    </button>

                    {occurrences.length ===
                      0 ? (
                      <div className="bh-empty-state">
                        No scheduled
                        occurrences
                        for this
                        date.
                      </div>
                    ) : (
                      <div className="bh-occurrence-grid">
                        {occurrences.map(
                          (
                            occurrence
                          ) => {
                            const recordedCount =
                              attendanceRows.filter(
                                (
                                  row
                                ) =>
                                  occurrenceMatchesRow(
                                    row,
                                    occurrence
                                  )
                              ).length;

                            return (
                              <button
                                key={
                                  occurrence.occurrenceKey
                                }
                                className={`bh-occurrence-card ${recordedCount
                                  ? "recorded"
                                  : ""
                                  }`}
                                onClick={() => {
                                  setSelectedScheduleDate(dateKey);

                                  // ADMIN: preserve the existing attendance/admin flow.
                                  if (isAdmin) {
                                    openAttendanceModal(
                                      dateKey,
                                      occurrence
                                    );
                                    return;
                                  }

                                  // GUEST / REGULAR USER: ONLY the individual spawn card
                                  // redirects to Players & History. The top BH navigation
                                  // remains completely normal and usable.
                                  switchActiveTab("players");
                                }}
                              >
                                <div className="bh-occurrence-media">
                                  <img
                                    className="bh-occurrence-image"
                                    src={bossImagePath(occurrence.bossId)}
                                    alt={`${occurrence.bossName} boss`}
                                  />
                                  <div className="bh-occurrence-media-shade" />
                                  <span className="bh-occurrence-kind">
                                    {normalizeBossId(occurrence.bossId) === "sonya" ? "BOSS RAID" : normalizeBossId(occurrence.bossId) === "reflector" ? "MINI BOSS" : "BOSS RAID"}
                                  </span>
                                </div>

                                <div className="bh-occurrence-content">
                                  <div className="bh-occurrence-time">
                                    {formatTime(
                                      occurrence.spawnAt,
                                      effectiveTimezone
                                    )}
                                  </div>

                                  <div className="bh-occurrence-boss">
                                    {occurrence.bossName}
                                  </div>

                                  <div className="bh-occurrence-meta">
                                    <span className="bh-occurrence-points">
                                      +{safeNumber(occurrence.points, 0).toFixed(2)} POINTS
                                    </span>
                                    <span className="bh-occurrence-status">
                                      {recordedCount
                                        ? `${recordedCount} RECORDED`
                                        : "NO ATTENDANCE"}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </section>
      )}

      {activeTab === "players" && (
        /* ===================================================
           PLAYERS
       =================================================== */

        <section id="players-history" className="bh-panel bh-players-dashboard bh-players-dashboard-v8">
          <div className="bh-players-hero bh-players-hero-v8">
            <div className="bh-players-title-wrap bh-players-title-wrap-v8">
              <div className="bh-players-emblem bh-players-emblem-v8" aria-hidden="true">
                <span>♟</span>
              </div>
              <div>
                <div className="bh-section-kicker">PLAYER ROSTER</div>
                <div className="bh-players-title-row">
                  <h2>Players &amp; History</h2>
                  {isAdmin && (
                    <button
                      type="button"
                      className="bh-inline-add-player"
                      onClick={openBHAddPlayers}
                    >
                      ＋ ADD NEW PLAYER
                    </button>
                  )}
                  {isAdmin && <button type="button" className="bh-inline-add-player bh-bulk-tools-trigger" onClick={() => openBHMultiTools("menu")}>⚙ BULK TOOLS</button>}
                </div>
                <p>Manage registered players, track attendance records and reward activities.</p>
              </div>
            </div>

            <div className="bh-players-stat-grid bh-players-stat-grid-v8">
              <div className="bh-player-stat bh-player-stat-cyan bh-player-stat-v8">
                <div className="bh-player-stat-icon">♟</div>
                <div>
                  <strong>{totalPlayers}</strong>
                  <span>TOTAL PLAYERS</span>
                  <small>Registered players in the roster</small>
                </div>
              </div>

              <div className="bh-player-stat bh-player-stat-green bh-player-stat-v8">
                <div className="bh-player-stat-icon">◫</div>
                <div>
                  <strong>
                    {(() => {
                      const activeCount = players.filter((player) => player.active).length;
                      const possible = activeCount * Math.max(1, new Set(attendanceRows.map((row) => clean(row.occurrenceKey || row.id))).size);
                      const attended = new Set(
                        attendanceRows
                          .filter((row) => activeCount && attendanceMatchesPlayer(row, row.playerId))
                          .map((row) => `${clean(row.playerId)}|${clean(row.occurrenceKey || row.id)}`)
                      ).size;
                      return possible ? `${Math.min(100, Math.round((attended / possible) * 100))}%` : "0%";
                    })()}
                  </strong>
                  <span>ATTENDANCE RATE</span>
                  <small>Attendance on recorded scheduled spawns</small>
                </div>
              </div>

              <div className="bh-player-stat bh-player-stat-purple bh-player-stat-v8 bh-player-stat-sonya">
                <div className="bh-player-stat-sonya-art" aria-hidden="true">
                  <img src={sonyaImage} alt="" />
                </div>
                <div className="bh-player-stat-sonya-icon bh-player-stat-icon">⚔</div>
                <div className="bh-player-stat-content">
                  <strong>{totalSonyaClaims}</strong>
                  <span>SONYA WEAPONS CLAIMED</span>
                  <small>All-time Sonya claims</small>
                  <em>-6.00 pts per Sonya claim</em>
                </div>
              </div>

              <div className="bh-player-stat bh-player-stat-gold bh-player-stat-v8">
                <div className="bh-player-stat-icon">⚔</div>
                <div>
                  <strong>{eligiblePlayers.length}</strong>
                  <span>ELIGIBLE FOR SONYA WEAPON</span>
                  <small>Players with {safeNumber(BH_CLAIM_THRESHOLD, 6).toFixed(2)}+ points eligible to claim</small>
                </div>
              </div>

              <div className="bh-mini-boss-rewards-card bh-mini-boss-rewards-card-v10">
                <div className="bh-mini-boss-rewards-head">
                  <div className="bh-mini-boss-rewards-title">
                    <span className="bh-mini-boss-rewards-gift" aria-hidden="true">🎁</span>
                    <div>
                      <span>MINI BOSS REWARDS</span>
                      <small>CLAIMED / AVAILABLE</small>
                    </div>
                  </div>
                </div>

                <div className="bh-mini-boss-rewards-list">
                  {[
                    { id: "geomancer", name: "Geomancer", color: "blue" },
                    { id: "reflector", name: "Reflector", color: "green" },
                    { id: "giant-hawk", name: "Giant Hawk", color: "gold" },
                  ].map((miniBoss) => {
                    const summary = rewardBossSummary.find((boss) => boss.id === miniBoss.id) || {
                      total: 0,
                      claimed: 0,
                      unclaimed: 0,
                    };
                    const total = safeNumber(summary.total, 0);
                    const claimed = safeNumber(summary.claimed, 0);
                    const unclaimed = safeNumber(summary.unclaimed, Math.max(0, total - claimed));
                    const percent = total > 0 ? Math.min(100, Math.round((claimed / total) * 100)) : 0;

                    return (
                      <div className={`bh-mini-boss-row bh-mini-boss-${miniBoss.color}`} key={miniBoss.id}>
                        <div className="bh-mini-boss-icon-wrap">
                          <img
                            src={bossImagePath(miniBoss.id)}
                            alt={`${miniBoss.name} boss`}
                            className="bh-mini-boss-icon"
                          />
                        </div>
                        <div className="bh-mini-boss-main">
                          <div className="bh-mini-boss-topline">
                            <strong>{miniBoss.name}</strong>
                            <b>{claimed} / {total}</b>
                          </div>
                          <div className="bh-mini-boss-track" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </div>
                          <div className="bh-mini-boss-bottomline">
                            <span>{claimed} CLAIMED</span>
                            <span>{unclaimed} AVAILABLE</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bh-players-filters bh-players-filters-v8">
            <div className="bh-players-search">
              <span aria-hidden="true">⌕</span>
              <input
                className="bh-input"
                value={playerSearch}
                placeholder="Search IGN..."
                onChange={(e) => {
                  setPlayerSearch(e.target.value);
                  setPlayerPage(1);
                }}
              />
            </div>

            <div className="bh-players-class-filter">
              <span aria-hidden="true">☷</span>
              <select
                className="bh-select"
                value={playerClassFilter}
                onChange={(e) => {
                  setPlayerClassFilter(e.target.value);
                  setPlayerPage(1);
                }}
              >
                <option value="all">All Classes</option>
                {CLASS_OPTIONS.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bh-players-table-card bh-players-table-card-v8">
            <TableScroller>
              <table className="bh-table bh-players-table bh-players-table-v8">
                <colgroup>
                  <col className="bh-col-player" />
                  <col className="bh-col-class" />
                  {DEFAULT_BOSS_LIST.map((boss) => (
                    <col key={`col-${boss.id}`} className="bh-col-boss" />
                  ))}
                  <col className="bh-col-total" />
                  <col className="bh-col-sonya-count" />
                  <col className="bh-col-sonya-deducted" />
                  <col className="bh-col-balance" />
                  <col className="bh-col-updated" />
                  <col className="bh-col-updated-by" />
                  <col className="bh-col-actions" />
                </colgroup>
                <thead>
                  <tr className="bh-v6-group-row">
                    <th rowSpan="2" className="bh-v6-player-head">PLAYER</th>
                    <th rowSpan="2" className="bh-v6-class-head">CLASS</th>
                    <th colSpan={DEFAULT_BOSS_LIST.length + 1} className="bh-v6-attendance-group">
                      ATTENDANCE EARNED (ALL TIME)
                    </th>
                    <th colSpan="2" className="bh-v6-sonya-group">
                      SONYA WEAPON CLAIMS (ALL TIME)
                    </th>
                    <th rowSpan="2" className="bh-v6-balance-head">
                      CURRENT REWARD<br />BALANCE (POINTS)
                      <small>(EARNED - SONYA CLAIMS)</small>
                    </th>
                    <th rowSpan="2" className="bh-v6-update-head">
                      LAST UPDATED<br />LIVE STATUS
                    </th>
                    <th rowSpan="2" className="bh-v6-update-head">
                      UPDATED BY<br />ADMIN
                    </th>
                    <th rowSpan="2" className="bh-v6-actions-head">ACTIONS</th>
                  </tr>
                  <tr className="bh-v6-sub-row">
                    {DEFAULT_BOSS_LIST.map((boss) => {
                      const bossKey = String(boss.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
                      const bossGlyph = {
                        sonya: "⚔",
                        geomancer: "⚔",
                        reflector: "✥",
                        "giant-hawk": "✦",
                      }[bossKey] || "✦";
                      return (
                        <th key={boss.id} className={`bh-boss-head-${bossKey}`}>
                          <span className="bh-boss-head-icon" aria-hidden="true">{bossGlyph}</span>
                          {boss.name.toUpperCase()}<small>({safeNumber(boss.points, 0).toFixed(1)} PT)</small>
                        </th>
                      );
                    })}
                    <th>TOTAL<small>POINTS</small></th>
                    <th>
                      # SONYA<br />WEAPONS CLAIMED
                    </th>
                    <th>
                      POINTS DEDUCTED<br />(-6.00 EACH)
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visiblePlayers.map((player) => {
                    const initials = clean(player.ign || "?").charAt(0).toUpperCase() || "?";
                    const classIcon = {
                      Swordman: swordmanIcon,
                      Archer: archerIcon,
                      Gunner: gunnerIcon,
                      Shaman: shamanIcon,
                      Extreme: extremeIcon,
                      Brawler: brawlerIcon,
                    }[player.class] || swordmanIcon;

                    return (
                      <tr key={String(player.id)} className="bh-player-row bh-player-row-v8">
                        <td>
                          <div className="bh-player-identity">
                            <div className="bh-player-avatar">{initials}</div>
                            <div className="bh-player-name-wrap">
                              <strong>{player.ign || "Unknown"}</strong>
                              <span className={player.active ? "bh-player-online" : "bh-player-disabled"}>
                                <i /> {player.active ? "ONLINE" : "DISABLED"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="bh-player-class bh-player-class-v8">
                            <img src={classIcon} alt="" />
                            <span>{player.class || "—"}</span>
                          </div>
                        </td>

                        {DEFAULT_BOSS_LIST.map((boss) => (
                          <td key={boss.id} className={`bh-v6-attendance-cell bh-attendance-${String(boss.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                            <strong>{safeNumber(player.attendanceByBoss?.[boss.id], 0).toFixed(2)}+</strong>
                          </td>
                        ))}

                        <td className="bh-v6-total-cell">
                          <strong>{safeNumber(player.points, 0).toFixed(2)}</strong>
                        </td>

                        <td className="bh-v6-sonya-count-cell">
                          <strong>{safeNumber(player.sonyaClaimsCount, 0)}</strong>
                        </td>

                        <td className={`bh-v6-deduction-cell ${player.sonyaDeducted > 0 ? "bh-deduction-negative" : "bh-deduction-zero"}`}>
                          <strong>{player.sonyaDeducted > 0 ? `-${safeNumber(player.sonyaDeducted, 0).toFixed(2)}` : "0.00"}</strong>
                        </td>

                        {(() => {
                          const balance = safeNumber(player.available, 0);
                          const eligible = balance >= BH_CLAIM_THRESHOLD;
                          const negative = balance < 0;
                          const balanceClass = negative
                            ? "bh-balance-negative"
                            : eligible
                              ? "bh-balance-eligible"
                              : "bh-balance-pending";
                          return (
                            <td className={`bh-v6-balance-cell ${balanceClass}`}>
                              <div className="bh-balance-status-card">
                                <strong>{balance.toFixed(2)}</strong>
                                <span>{eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</span>
                              </div>
                            </td>
                          );
                        })()}

                        <td className="bh-v6-updated-cell bh-live-status-cell">
                          <span>◫ {formatDate(player.latestUpdatedAt, effectiveTimezone)}</span>
                          <span>◷ {formatTime(player.latestUpdatedAt, effectiveTimezone)}</span>
                          {(() => {
                            const live = bhLiveStatusByPlayer[String(player.id)];
                            if (!live) return null;
                            return <span className={`bh-live-attendance-status is-${live.state}`}>
                              <b>{live.state === "attended" ? "✓" : live.state === "missed" ? "✕" : "◷"}</b>
                              <strong>{live.label}</strong>
                              {live.occurrence && <small>{bossLabel(live.occurrence.bossId)} • {formatTime(live.occurrence.spawnAt, effectiveTimezone)}</small>}
                            </span>;
                          })()}
                        </td>

                        <td className="bh-v6-updated-by-cell">
                          <span>♙ {player.latestUpdatedBy || "SYSTEM"}</span>
                          <small>ADMIN</small>
                        </td>

                        <td>
                          <div className="bh-player-actions bh-player-actions-v8">
                            <button
                              type="button"
                              className="bh-player-action bh-player-action-history"
                              onClick={() => {
                                setHistoryPlayer(player);
                                setHistoryPage(1);
                                setHistorySearch("");
                              }}
                            >
                              <span>◷</span> HISTORY
                            </button>

                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="bh-player-action bh-player-action-edit"
                                  onClick={() => setEditingPlayer({ ...player })}
                                >
                                  <span>✎</span> EDIT
                                </button>

                                <button
                                  type="button"
                                  className="bh-player-action bh-player-action-disable"
                                  onClick={() => togglePlayerActive(player)}
                                >
                                  <span>⊘</span> {player.active ? "DISABLE" : "ENABLE"}
                                </button>

                                <button
                                  type="button"
                                  className="bh-player-action bh-player-action-delete"
                                  onClick={() => {
                                    setDeletePlayerTarget(player);
                                    setDeletePlayerPin("");
                                    setError("");
                                  }}
                                >
                                  <span>⌫</span> DELETE
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!visiblePlayers.length && (
                    <tr>
                      <td colSpan={DEFAULT_BOSS_LIST.length + 9} className="bh-empty-cell">
                        No players found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroller>
          </div>

          <div className="bh-players-pagination bh-players-pagination-v6">
            <div className="bh-v6-page-controls">
              <button type="button" disabled={playerPage <= 1} onClick={() => setPlayerPage(1)}>«</button>
              <button type="button" disabled={playerPage <= 1} onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}>‹</button>
              <div className="bh-players-page-number"><span>{playerPage}</span></div>
              <button type="button" disabled={playerPage >= playerPageCount} onClick={() => setPlayerPage((p) => Math.min(playerPageCount, p + 1))}>›</button>
              <button type="button" disabled={playerPage >= playerPageCount} onClick={() => setPlayerPage(playerPageCount)}>»</button>
            </div>
            <strong>Page {playerPage} of {playerPageCount}</strong>
            <span>Showing {visiblePlayers.length} of {filteredPlayers.length} players</span>
          </div>

          <div className="bh-player-table-legend" aria-label="Players table color legend">
            <div className="bh-player-legend-attendance">
              <span className="legend-sonya"><b>＋</b> Sonya Points <small>(1.0 per attendance)</small></span>
              <span className="legend-geomancer"><b>＋</b> Geomancer Points <small>(0.2 per attendance)</small></span>
              <span className="legend-reflector"><b>＋</b> Reflector Points <small>(0.2 per attendance)</small></span>
              <span className="legend-hawk"><b>＋</b> Giant Hawk Points <small>(0.2 per attendance)</small></span>
              <span className="legend-total"><b>＋</b> Total Points <small>(Lifetime total)</small></span>
            </div>
            <div className="bh-player-legend-balance">
              <span className="legend-negative"><b>●</b> Balance &lt; 0 <small>Red + NOT ELIGIBLE</small></span>
              <span className="legend-pending"><b>●</b> 0.00 – 5.99 <small>Gold + NOT ELIGIBLE</small></span>
              <span className="legend-eligible"><b>●</b> 6.00+ <small>Green + ELIGIBLE</small></span>
            </div>
          </div>
        </section>
      )}

      {activeTab === "rewards" && (
        /* ===================================================
            REWARDS
        =================================================== */

        <section className="bh-panel bh-reward-dashboard" id="bh-reward-center">
          <div className="bh-reward-dashboard-header">
            <div>
              <div className="bh-section-kicker">REWARD CENTER <span className="bh-live-indicator">LIVE</span></div>
              <h2>Boss Hunt Rewards</h2>
              <p>Manage Sonya grand rewards, daily Duck Race rewards, winners and claim history.</p>
            </div>
            <div className="bh-reward-last-updated">
              <span>LAST UPDATED</span>
              <strong>{rewardLastUpdated?.at ? formatDateTime(rewardLastUpdated.at, effectiveTimezone) : "—"}</strong>
              <small>{rewardLastUpdated?.by || "System"}</small>
            </div>
          </div>

          <div className="bh-reward-summary-grid">
            <div className="bh-reward-summary-card"><span>🎁</span><div><small>TOTAL REWARDS</small><strong>{totalRewardCount}</strong><em>Across all bosses</em></div></div>
            <div className="bh-reward-summary-card"><span>✓</span><div><small>TOTAL CLAIMED</small><strong>{totalClaimedRewardCount}</strong><em>All time</em></div></div>
            <div className="bh-reward-summary-card"><span>⌛</span><div><small>UNCLAIMED</small><strong>{totalUnclaimedRewardCount}</strong><em>Available rewards</em></div></div>
            <div className="bh-reward-summary-card"><span>🏆</span><div><small>TODAY'S WINNERS</small><strong>{Array.from(todayRewardClaimsByBoss.values()).reduce((n, x) => n + x.length, 0)}</strong><em>All bosses</em></div></div>
          </div>

          <div className="bh-reward-section-title">
            <div><span className="bh-section-kicker">BOSS OVERVIEW</span><h3>Reward &amp; Duck Race Status</h3></div>
            {isAdmin && <span className="bh-reward-admin-note">Only Sonya has a 6.00-point cost. Mini bosses use daily Duck Race status.</span>}
          </div>

          <div className="bh-reward-boss-grid">
            {rewardBossSummary.map((boss) => {
              const sonya = boss.id === "sonya";
              const duck = !sonya ? getDuckRaceStatus(boss.id) : null;
              const winnerCount = todayRewardClaimsByBoss.get(boss.id)?.length || 0;

              /*
               * UNIFIED REWARD STATUS
               * Sonya: available while at least one unclaimed reward remains.
               * Mini bosses: today's Duck Race must be completed first.
               *   not raced -> WAITING FOR DUCK RACE
               *   raced + stock -> AVAILABLE
               *   raced + no stock -> CLAIMED OUT
               * Player eligibility is intentionally separate from this status.
               */
              const hasRewards = safeNumber(boss.unclaimed, 0) > 0;
              const duckRaced = duck?.status === "duck-raced";
              const rewardStatus = sonya
                ? hasRewards
                  ? { key: "available", label: "AVAILABLE", detail: `${boss.unclaimed} reward${boss.unclaimed === 1 ? "" : "s"} remaining` }
                  : { key: "claimed-out", label: "CLAIMED OUT", detail: "No rewards remaining" }
                : !duckRaced
                  ? { key: "waiting", label: "WAITING FOR DUCK RACE", detail: "Today's Duck Race has not been completed" }
                  : hasRewards
                    ? { key: "available", label: "AVAILABLE", detail: `${boss.unclaimed} reward${boss.unclaimed === 1 ? "" : "s"} remaining` }
                    : { key: "claimed-out", label: "CLAIMED OUT", detail: "No rewards remaining" };

              return (
                <article key={boss.id} className={`bh-reward-boss-card bh-reward-boss-card-detailed ${sonya ? "sonya" : "mini"}`}>
                  <div className="bh-reward-boss-hero">
                    <img src={bossImagePath(boss.id)} alt={`${boss.name} boss`} />
                    <div className="bh-reward-boss-hero-overlay">
                      <span className="bh-reward-boss-kind">{sonya ? "GRAND BOSS" : "MINI BOSS"}</span>
                      <strong>{boss.name}</strong>
                      <small>{sonya ? "WEEKLY · WEDNESDAY" : boss.id === "geomancer" ? "EVERY 10 HOURS" : "DAILY · MULTIPLE SPAWNS"}</small>
                    </div>
                  </div>
                  <div className="bh-reward-boss-detail-body">
                    <div className="bh-reward-boss-score-row">
                      <div><span>ATTENDANCE POINTS</span><strong>+{safeNumber(boss.points, 0).toFixed(2)}</strong></div>
                      <div className={`bh-reward-boss-state ${sonya ? "grand" : duck?.status === "duck-raced" ? "done" : "pending"}`}>
                        <span>{sonya ? "REWARD COST" : "DUCK RACE"}</span>
                        <strong>{sonya ? "-6.00" : duck?.status === "duck-raced" ? "COMPLETED" : "PENDING"}</strong>
                      </div>
                    </div>
                    <div className="bh-reward-boss-stat-grid">
                      <div><small>TOTAL REWARDS</small><strong>{boss.total}</strong></div>
                      <div><small>CLAIMED</small><strong>{boss.claimed}</strong></div>
                      <div><small>UNCLAIMED</small><strong>{boss.unclaimed}</strong></div>
                    </div>
                    <div className="bh-reward-boss-info-list">
                      <div><span>SCHEDULE</span><strong>{sonya ? "Weekly Wednesday · 21:00 PH" : boss.id === "geomancer" ? "Every 10 hours" : "Daily · multiple spawns"}</strong></div>
                      <div><span>REWARD TYPE</span><strong>{sonya ? "Point-funded reward" : "Duck Race reward"}</strong></div>
                      <div className="bh-reward-status-row"><span>STATUS</span><strong className={`status-${rewardStatus.key}`}>{rewardStatus.label}</strong></div>
                      <div className="bh-reward-status-detail"><span>DETAIL</span><em>{rewardStatus.detail}</em></div>
                    </div>
                    {!sonya && isAdmin && (
                      <button type="button" className="bh-reward-duck-button" disabled={duckRaceSaving} onClick={() => setDuckRaceForToday(boss.id, duck?.status === "duck-raced" ? "not-yet" : "duck-raced")}>
                        {duck?.status === "duck-raced" ? "RESET DUCK RACE" : "MARK DUCK RACED"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="bh-reward-section-title winners"><div><span className="bh-section-kicker">🏆 TODAY'S WINNERS</span><h3>{formatDate(new Date(), effectiveTimezone)}</h3></div></div>
          <div className="bh-reward-winners-grid">
            {rewardBossSummary.map((boss) => {
              const claims = todayRewardClaimsByBoss.get(boss.id) || [];
              const last = lastWinnerByBoss.get(boss.id);
              const sonya = boss.id === "sonya";
              return (
                <div key={boss.id} className={`bh-reward-winner-card ${sonya ? "grand" : "duck"}`}>
                  <div className="bh-reward-winner-title">{sonya ? "👑 SONYA — GRAND BOSS WINNERS" : <><img src={duckRaceIcon} alt="" /> {boss.name.toUpperCase()} — DUCK RACE WINNERS</>}</div>
                  {claims.length ? <div className="bh-reward-winner-list">{claims.map((claim) => {
                    const reward = rewards.find((r) => String(r.id) === String(claim.rewardId));
                    const wc = claim.weaponClass || reward?.weaponClass || "";
                    const icon = weaponClassIconPath(wc);
                    return <div className={`bh-reward-winner-row ${sonya ? "grand-winner" : "duck-winner"}`} key={claim.id}><div className="bh-reward-winner-player"><strong>{claim.playerName || "Unknown"}</strong>{wc && <span>{icon && <img src={icon} alt="" />}{wc}</span>}</div><div><small>{claim.rewardName || "Reward"}</small><b>{sonya ? "-6.00 points" : "CLAIMED"}</b></div><time>{formatTime(claim.claimedAt, effectiveTimezone)}</time>{!sonya && <img className="bh-reward-winner-duck" src={duckRaceIcon} alt="Duck Race pick" title="Duck Race pick" />}</div>;
                  })}</div> : <div className="bh-reward-no-winner"><strong>NO WINNER TODAY</strong><span>No reward claims for {boss.name} today.</span>{last && <div><small>LAST WINNER</small><b>{last.playerName || "Unknown"}</b><span>{formatDateTime(last.claimedAt, effectiveTimezone)}</span></div>}</div>}
                  {claims.length > 0 && <div className="bh-reward-winner-total">TOTAL WINNERS: {claims.length}</div>}
                </div>
              );
            })}
          </div>

          <div className="bh-reward-section-title bh-reward-inventory-title">
            <div>
              <span className="bh-section-kicker">REWARD MANAGEMENT</span>
              <h3>Reward Inventory</h3>
              <p>Click any reward to view its complete claim history and details.</p>
            </div>
            {isAdmin && (
              <button
                type="button"
                className="bh-reward-add-inline"
                onClick={openNewRewardModal}
              >
                ＋ ADD NEW REWARD
              </button>
            )}
          </div>

          <div id="reward-inventory" className="bh-filter-row bh-reward-filters">
            <input className="bh-input" value={rewardSearch} placeholder="Search reward, boss or player..." onChange={(e) => { setRewardSearch(e.target.value); setRewardPage(1); }} />
            <select className="bh-select" value={rewardBossFilter} onChange={(e) => { setRewardBossFilter(e.target.value); setRewardPage(1); }}><option value="all">All Bosses</option>{bossOptions.map((boss) => <option key={boss.id} value={boss.id}>{boss.name}</option>)}</select>
            <select className="bh-select" value={rewardStatusFilter} onChange={(e) => { setRewardStatusFilter(e.target.value); setRewardPage(1); }}><option value="all">All Status</option><option value="available">Available</option><option value="claimed">Claimed</option><option value="disabled">Disabled</option></select>
          </div>

          <TableScroller><table className="bh-table bh-reward-management-table"><thead><tr><th>REWARD</th><th>BOSS</th><th>WEAPON CLASS</th><th>COST</th><th>DUCK RACE</th><th>STATUS</th><th>CLAIMS</th><th>UNCLAIMED</th><th>CREATED BY</th><th>CREATED AT</th><th>UPDATED AT</th><th>ACTIONS</th></tr></thead><tbody>
            {visibleRewards.map((reward) => {
              const bossId = normalizeBossId(reward.bossId); const isSonya = bossId === "sonya"; const icon = weaponClassIconPath(reward.weaponClass); const rewardClaimsForReward = rewardClaims.filter((c) => String(c.rewardId) === String(reward.id) && lower(c.status) !== "cancelled"); const claimed = claimedRewardIds.has(String(reward.id)); const duck = !isSonya ? getDuckRaceStatus(bossId) : null; const assignedStats = reward.playerId ? playerStats.find((p) => String(p.id) === String(reward.playerId)) : null; const claimEligible = Boolean(reward.playerId) && lower(reward.status) === "available" && Boolean(assignedStats) && (isSonya ? assignedStats.available >= SONYA_REWARD_COST : duck?.status === "duck-raced");
              return (
                <tr
                  key={reward.id}
                  className="bh-reward-inventory-row"
                  tabIndex={0}
                  role="button"
                  aria-label={`View details and claim history for ${reward.name || "reward"}`}
                  onClick={() => openRewardInventoryDetails(reward)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openRewardInventoryDetails(reward);
                    }
                  }}
                >
                  <td>
                    <strong>{reward.name}</strong>
                    {reward.playerName && <small className="bh-reward-assignee">Assigned: {reward.playerName}</small>}
                    <small className="bh-reward-row-hint">CLICK FOR HISTORY &amp; DETAILS</small>
                  </td>
                  <td>{reward.bossName}</td>
                  <td><span className="bh-reward-class-cell">{icon && <img src={icon} alt="" />}{reward.weaponClass || "—"}</span></td>
                  <td>{isSonya ? <strong className="bh-reward-cost">-6.00</strong> : <span>—</span>}</td>
                  <td>{isSonya ? <span className="bh-reward-na">N/A</span> : <span className={`bh-reward-duck-pill ${duck?.status === "duck-raced" ? "done" : "pending"}`}>{duck?.status === "duck-raced" ? "DUCK RACED" : "NOT YET"}</span>}</td>
                  <td><span className={`bh-status-pill bh-status-${reward.status}`}>{reward.status}</span></td>
                  <td>{rewardClaimsForReward.length + (claimed && !rewardClaimsForReward.length ? 1 : 0)}</td>
                  <td>{claimed ? 0 : reward.status === "available" ? 1 : 0}</td>
                  <td>{reward.createdBy || "System"}</td>
                  <td>{formatDateTime(reward.createdAt, effectiveTimezone)}</td>
                  <td>{formatDateTime(reward.updatedAt, effectiveTimezone)}</td>
                  <td>
                    <div className="bh-action-row" onClick={(e) => e.stopPropagation()}>
                      {reward.playerId && reward.status === "available" && <button type="button" className={`bh-small-button ${!claimEligible ? "bh-small-button-disabled" : ""}`} disabled={saving || !claimEligible} title={!assignedStats ? "Assigned player could not be found." : isSonya && assignedStats.available < SONYA_REWARD_COST ? `Player needs ${SONYA_REWARD_COST.toFixed(2)} available points.` : !isSonya && duck?.status !== "duck-raced" ? `${reward.bossName || bossLabel(bossId)} must be marked DUCK RACED for today.` : "Claim reward"} onClick={(e) => { e.stopPropagation(); claimReward(reward); }}>{saving ? "CLAIMING..." : claimEligible ? "CLAIM" : !isSonya ? "DUCK RACE" : "NOT ELIGIBLE"}</button>}
                      {isAdmin && (
                        <>
                          <button className="bh-small-button" onClick={() => setEditingReward({ ...reward })}>EDIT</button>
                          <button className="bh-small-button danger" onClick={() => deleteReward(reward)}>DELETE</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleRewards.length && <tr><td colSpan="12" className="bh-empty-cell">No rewards found.</td></tr>}
          </tbody></table></TableScroller>
          <div className="bh-pagination"><button disabled={rewardPage <= 1} onClick={() => setRewardPage((p) => Math.max(1, p - 1))}>PREVIOUS</button><span>Page {rewardPage} of {rewardPageCount}</span><button disabled={rewardPage >= rewardPageCount} onClick={() => setRewardPage((p) => Math.min(rewardPageCount, p + 1))}>NEXT</button></div>

        </section>
      )}

      {/* ===================================================
          REWARD INVENTORY DETAIL / CLAIM HISTORY MODAL
      =================================================== */}
      {selectedRewardInventory && (() => {
        const detailReward = selectedRewardInventory;
        const detailBossId = normalizeBossId(detailReward.bossId);
        /*
         * Claim history must work for both modern claim documents and older
         * reward records that were already marked CLAIMED before
         * bhRewardClaims was introduced. Never show the same claim twice.
         */
        const detailClaimMap = new Map();
        rewardClaims
          .filter((claim) =>
            String(claim.rewardId || "") === String(detailReward.id || "") &&
            lower(claim.status) !== "cancelled"
          )
          .forEach((claim) => {
            detailClaimMap.set(`reward:${String(claim.rewardId || detailReward.id)}`, claim);
          });

        if (
          lower(detailReward.status) === "claimed" &&
          !Array.from(detailClaimMap.values()).some(
            (claim) => String(claim.rewardId || "") === String(detailReward.id || "")
          )
        ) {
          detailClaimMap.set(`legacy-${detailReward.id}`, {
            id: `legacy-${detailReward.id}`,
            playerId: detailReward.playerId || "",
            playerName: detailReward.playerName || "Unassigned",
            rewardId: String(detailReward.id),
            rewardName: detailReward.name || "Reward",
            weaponClass: detailReward.weaponClass || "",
            bossId: detailReward.bossId,
            bossName: detailReward.bossName,
            points: detailBossId === "sonya" ? SONYA_REWARD_COST : safeNumber(detailReward.cost, 0),
            status: "claimed",
            claimedAt: detailReward.updatedAt || detailReward.createdAt,
            claimedBy: detailReward.updatedBy || detailReward.createdBy || "SYSTEM",
            updatedAt: detailReward.updatedAt || detailReward.createdAt,
            updatedBy: detailReward.updatedBy || detailReward.createdBy || "SYSTEM",
            legacy: true,
          });
        }

        const detailClaims = Array.from(detailClaimMap.values()).sort(
          (a, b) =>
            (safeToDate(b.claimedAt)?.getTime() || safeToDate(b.updatedAt)?.getTime() || 0) -
            (safeToDate(a.claimedAt)?.getTime() || safeToDate(a.updatedAt)?.getTime() || 0)
        );

        return (
          <div
            className="bh-modal-backdrop bh-reward-detail-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedRewardInventory(null);
            }}
          >
            <div className="bh-reward-detail-modal">
              <header className="bh-reward-detail-header">
                <div>
                  <span className="bh-section-kicker">REWARD INVENTORY</span>
                  <h2>{detailReward.name || "Reward"}</h2>
                  <p>Complete reward information and claim history.</p>
                </div>
                <button
                  type="button"
                  className="bh-modal-close"
                  aria-label="Close reward details"
                  onClick={() => setSelectedRewardInventory(null)}
                >
                  ×
                </button>
              </header>

              <div className="bh-reward-detail-summary">
                <div className="bh-reward-detail-summary-card">
                  <small>ACTION</small>
                  <strong>{detailReward.status === "claimed" ? "REWARD CLAIMED" : "REWARD RECORD"}</strong>
                </div>
                <div className="bh-reward-detail-summary-card">
                  <small>CREATED BY</small>
                  <strong>{detailReward.createdBy || "System"}</strong>
                </div>
                <div className="bh-reward-detail-summary-card">
                  <small>CREATED</small>
                  <strong>{formatDateTime(detailReward.createdAt, effectiveTimezone)}</strong>
                </div>
                <div className="bh-reward-detail-summary-card">
                  <small>LAST UPDATED</small>
                  <strong>{formatDateTime(detailReward.updatedAt || detailReward.createdAt, effectiveTimezone)}</strong>
                </div>
              </div>

              <div className="bh-reward-detail-block">
                <small>DETAILS</small>
                <p>
                  {detailReward.name || "Reward"} is a {detailReward.weaponClass || "reward"} reward for {detailReward.bossName || "Boss Hunt"}.
                  {detailReward.playerName ? ` Current owner: ${detailReward.playerName}.` : " It is currently unassigned."}
                  {detailBossId === "sonya" ? " Sonya claims use 6.00 BH points." : " Duck Race rewards do not deduct BH points."}
                </p>
              </div>

              <div className="bh-reward-detail-block">
                <small>RECORD MAPPING</small>
                <div className="bh-reward-detail-mapping">
                  <div><b>PLAYER / OWNER</b><span>{detailReward.playerName || "Unassigned"}</span></div>
                  <div><b>RECORD</b><span>BH reward • {detailReward.name || "Reward"}</span></div>
                  {detailReward.bossId && <div><b>BOSS</b><span>{detailReward.bossName || bossLabel(detailReward.bossId)}</span></div>}
                  <div><b>WEAPON CLASS</b><span>{detailReward.weaponClass || "—"}</span></div>
                  <div><b>STATUS</b><span>{String(detailReward.status || "available").toUpperCase()}</span></div>
                  <div><b>COST</b><span>{detailBossId === "sonya" ? "-6.00 BH POINTS" : "FREE / 0 POINTS"}</span></div>
                  {detailReward.spawnAt && <div><b>SPAWN</b><span>{formatDateTime(detailReward.spawnAt, effectiveTimezone)}</span></div>}
                </div>
              </div>

              <div className="bh-reward-detail-block">
                <small>RECORD</small>
                <ul className="bh-reward-detail-record-list">
                  <li><b>Reward:</b> {displayAuditText(detailReward.name || "—")}</li>
                  <li><b>Boss:</b> {displayAuditText(detailReward.bossName || "—")}</li>
                  <li><b>Player / owner:</b> {detailReward.playerName || "Unassigned"}</li>
                  <li><b>Weapon class:</b> {detailReward.weaponClass || "—"}</li>
                  <li><b>Claims:</b> {detailClaims.length}</li>
                  <li><b>Created:</b> {detailReward.createdBy || "System"} • {formatDateTime(detailReward.createdAt, effectiveTimezone)}</li>
                  <li><b>Updated:</b> {detailReward.updatedBy || detailReward.createdBy || "System"} • {formatDateTime(detailReward.updatedAt || detailReward.createdAt, effectiveTimezone)}</li>
                  {(detailReward.notes || detailReward.reason) && <li><b>Notes:</b> {detailReward.notes || detailReward.reason}</li>}
                </ul>
              </div>

              <section className="bh-reward-detail-history">
                {detailReward.playerId && lower(detailReward.status) === "available" && (() => {
                  const detailPlayerStats = playerStats.find((p) => String(p.id) === String(detailReward.playerId));
                  const detailIsSonya = detailBossId === "sonya";
                  const detailDuck = !detailIsSonya ? getDuckRaceStatus(detailBossId) : null;
                  const detailEligible = Boolean(detailPlayerStats) && (detailIsSonya ? detailPlayerStats.available >= SONYA_REWARD_COST : detailDuck?.status === "duck-raced");
                  const detailReason = !detailPlayerStats
                    ? "Assigned player could not be found."
                    : detailIsSonya && detailPlayerStats.available < SONYA_REWARD_COST
                      ? `${detailPlayerStats.ign} needs ${SONYA_REWARD_COST.toFixed(2)} available points.`
                      : !detailIsSonya && detailDuck?.status !== "duck-raced"
                        ? `${detailReward.bossName || bossLabel(detailBossId)} must be marked DUCK RACED for today.`
                        : "Ready to claim.";
                  return (
                    <div className="bh-reward-detail-claim-bar">
                      <div>
                        <strong>{detailEligible ? "READY TO CLAIM" : "CLAIM NOT AVAILABLE"}</strong>
                        <span>{detailReason}</span>
                      </div>
                      <button
                        type="button"
                        className="bh-primary-button"
                        disabled={saving || !detailEligible}
                        onClick={() => claimReward(detailReward)}
                      >
                        {saving ? "CLAIMING..." : detailEligible ? "CLAIM REWARD" : "NOT ELIGIBLE"}
                      </button>
                    </div>
                  );
                })()}

                <div className="bh-reward-detail-history-head">
                  <div>
                    <span className="bh-section-kicker">CLAIM HISTORY</span>
                    <h3>{detailClaims.length ? `${detailClaims.length} Claim${detailClaims.length === 1 ? "" : "s"}` : "No Claims Yet"}</h3>
                  </div>
                  <span className="bh-reward-detail-live">● LIVE DATA</span>
                </div>

                {detailClaims.length ? (
                  <div className="bh-reward-claim-detail-list">
                    {detailClaims.map((claim) => {
                      const claimReward = rewards.find((r) => String(r.id) === String(claim.rewardId || ""));
                      const claimClass = claim.weaponClass || claimReward?.weaponClass || detailReward.weaponClass || "";
                      const claimClassIcon = weaponClassIconPath(claimClass);
                      return (
                        <article className="bh-reward-claim-detail-card" key={claim.id}>
                          <div className="bh-reward-claim-detail-icon">✓</div>
                          <div className="bh-reward-claim-detail-main">
                            <div className="bh-reward-claim-detail-top">
                              <strong>{claim.playerName || detailReward.playerName || "Unknown Player"}</strong>
                              <span>{formatDateTime(claim.claimedAt, effectiveTimezone)}</span>
                            </div>
                            <div className="bh-reward-claim-detail-fields">
                              <div><span>REWARD</span><strong>{claim.rewardName || detailReward.name || "Reward"}</strong></div>
                              <div><span>BOSS</span><strong>{claim.bossName || detailReward.bossName || "—"}</strong></div>
                              <div><span>WEAPON CLASS</span><strong>{claimClassIcon && <img src={claimClassIcon} alt="" />}{claimClass || "—"}</strong></div>
                              <div><span>COST</span><strong>{normalizeBossId(claim.bossId || detailReward.bossId) === "sonya" ? "-6.00 POINTS" : "—"}</strong></div>
                              <div><span>CLAIMED BY</span><strong>{claim.claimedBy || claim.updatedBy || claim.createdBy || "SYSTEM"}</strong></div>

                            </div>
                          </div>
                          {isAdmin && (
                            <div className="bh-reward-claim-detail-actions">
                              <button type="button" onClick={() => openEditRewardClaim(claim)}>EDIT</button>
                              <button type="button" className="danger" onClick={() => deleteRewardClaim(claim)}>DELETE</button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bh-reward-detail-empty">
                    <strong>NO CLAIM HISTORY</strong>
                    <span>This reward has not been claimed yet.</span>
                  </div>
                )}
              </section>
            </div>
          </div>
        );
      })()}



      {/* ===================================================
          ADMIN
      =================================================== */}

      {activeTab ===
        "admin" &&
        isAdmin && (
          <section className="bh-admin-grid">
            {/* ADD PLAYER */}
            <div className="bh-panel">
              <div className="bh-panel-header">
                <div>
                  <div className="bh-section-kicker">
                    PLAYER MANAGEMENT
                  </div>

                  <h2>
                    Add Player
                  </h2>
                </div>
              </div>

              <div className="bh-form-grid">
                <div className="bh-form-group">
                  <label>
                    IGN
                  </label>

                  <input
                    className="bh-input"
                    value={
                      newPlayerIgn
                    }
                    placeholder="Player IGN"
                    onChange={(e) =>
                      setNewPlayerIgn(
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="bh-form-group">
                  <label>
                    CLASS
                  </label>

                  <TypeSelect id="bh-admin-new-player-class" className="bh-input" value={newPlayerClass} onChange={setNewPlayerClass} options={CLASS_OPTIONS} placeholder="Type or select class..." />
                </div>

                <div className="bh-form-group">
                  <label>
                    WEAPON
                  </label>

                  <input
                    className="bh-input"
                    value={
                      newPlayerWeapon
                    }
                    placeholder="Weapon"
                    onChange={(e) =>
                      setNewPlayerWeapon(
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <button
                className="bh-primary-button"
                onClick={
                  addPlayer
                }
              >
                ADD PLAYER
              </button>
            </div>

            {/* SCORING */}
            <div className="bh-panel">
              <div className="bh-panel-header">
                <div>
                  <div className="bh-section-kicker">
                    BOSS SCORING
                  </div>

                  <h2>
                    Point Values
                  </h2>
                </div>
              </div>

              <div className="bh-scoring-list">
                {bossOptions.map(
                  (boss) => (
                    <div
                      key={
                        boss.id
                      }
                      className="bh-scoring-row"
                    >
                      <div>
                        <strong>
                          {
                            boss.name
                          }
                        </strong>
                      </div>

                      <input
                        className="bh-input bh-points-input"
                        type="text"
                        inputMode="decimal"
                        value={
                          scoringDraft[
                          boss.id
                          ] ??
                          boss.points
                        }
                        onChange={(e) =>
                          setScoringDraft(
                            (
                              current
                            ) => ({
                              ...current,
                              [boss.id]:
                                formatNumericInput(e.target.value, true),
                            })
                          )
                        }
                      />
                    </div>
                  )
                )}
              </div>

              <div className="bh-form-group">
                <label>
                  CHANGE COMMENT
                </label>

                <textarea
                  className="bh-textarea"
                  value={
                    scoringComment
                  }
                  placeholder="Why are the point values changing?"
                  onChange={(e) =>
                    setScoringComment(
                      e.target.value
                    )
                  }
                />
              </div>

              <button
                className="bh-primary-button"
                disabled={
                  scoringSaving
                }
                onClick={
                  saveScoring
                }
              >
                {scoringSaving
                  ? "SAVING..."
                  : "SAVE SCORING"}
              </button>

              <div className="bh-subsection">
                <h3>
                  Scoring History
                </h3>

                <div className="bh-history-mini">
                  {scoringHistory
                    .slice(
                      0,
                      10
                    )
                    .map(
                      (
                        history
                      ) => (
                        <div
                          key={
                            history.id
                          }
                          className="bh-history-mini-row"
                        >
                          <div>
                            <strong>
                              {
                                history.createdBy
                              }
                            </strong>

                            <span>
                              {
                                history.comment ||
                                "Scoring updated"
                              }
                            </span>
                          </div>

                          <time>
                            {formatDateTime(
                              history.createdAt,
                              effectiveTimezone
                            )}
                          </time>
                        </div>
                      )
                    )}

                  {!scoringHistory.length && (
                    <div className="bh-empty-small">
                      No scoring
                      changes yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ADD REWARD */}
            <div className="bh-panel">
              <div className="bh-panel-header">
                <div>
                  <div className="bh-section-kicker">
                    REWARD MANAGEMENT
                  </div>

                  <h2>
                    Add Reward
                  </h2>
                </div>
              </div>

              <div className="bh-form-grid">
                <div className="bh-form-group">
                  <label>
                    REWARD
                  </label>

                  <input
                    className="bh-input"
                    value={
                      rewardForm.name
                    }
                    placeholder="Reward name"
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          name:
                            e.target.value,
                        })
                      )
                    }
                  />
                </div>

                <div className="bh-form-group">
                  <label>
                    BOSS
                  </label>

                  <select
                    className="bh-select"
                    value={
                      rewardForm.bossId
                    }
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          bossId:
                            e.target
                              .value,
                        })
                      )
                    }
                  >
                    {bossOptions.map(
                      (boss) => (
                        <option
                          key={
                            boss.id
                          }
                          value={
                            boss.id
                          }
                        >
                          {
                            boss.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="bh-form-group">
                  <label>
                    COST
                  </label>

                  <input
                    className="bh-input"
                    type="text"
                    inputMode="decimal"
                    value={
                      rewardForm.cost
                    }
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          cost:
                            formatNumericInput(e.target.value, true),
                        })
                      )
                    }
                  />
                </div>

                <div className="bh-form-group">
                  <label>
                    PLAYER
                  </label>

                  <select
                    className="bh-select"
                    value={
                      rewardForm.playerId
                    }
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          playerId:
                            String(
                              e.target
                                .value
                            ),
                        })
                      )
                    }
                  >
                    <option value="">
                      Unassigned
                    </option>

                    {players
                      .filter(
                        (p) =>
                          p.active
                      )
                      .map(
                        (
                          player
                        ) => (
                          <option
                            key={
                              String(
                                player.id
                              )
                            }
                            value={
                              String(
                                player.id
                              )
                            }
                          >
                            {
                              player.ign
                            }
                          </option>
                        )
                      )}
                  </select>
                </div>

                <div className="bh-form-group">
                  <label>
                    STATUS
                  </label>

                  <select
                    className="bh-select"
                    value={
                      rewardForm.status
                    }
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          status:
                            e.target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="available">
                      Available
                    </option>

                    <option value="disabled">
                      Disabled
                    </option>
                  </select>
                </div>

                <div className="bh-form-group">
                  <label>
                    SPAWN DATE/TIME
                  </label>

                  <input
                    className="bh-input"
                    type="datetime-local"
                    value={
                      rewardForm.spawnAt
                    }
                    onChange={(e) =>
                      setRewardForm(
                        (
                          current
                        ) => ({
                          ...current,
                          spawnAt:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </div>
              </div>

              <div className="bh-form-group">
                <label>
                  NOTES
                </label>

                <textarea
                  className="bh-textarea"
                  value={
                    rewardForm.notes
                  }
                  placeholder="Reward notes"
                  onChange={(e) =>
                    setRewardForm(
                      (
                        current
                      ) => ({
                        ...current,
                        notes:
                          e.target
                            .value,
                      })
                    )
                  }
                />
              </div>

              <button
                className="bh-primary-button"
                disabled={
                  rewardSaving
                }
                onClick={
                  addReward
                }
              >
                {rewardSaving
                  ? "SAVING..."
                  : "ADD REWARD"}
              </button>
            </div>
          </section>
        )}

      {/* ===================================================
          ATTENDANCE MODAL
      =================================================== */}

      {attendanceModalOpen && (
        <div
          className="bh-modal-backdrop"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setAttendanceModalOpen(
                false
              );
            }
          }}
        >
          <div className="bh-modal bh-add-attendance-modal">
            <div className="bh-modal-header bh-add-attendance-v6-header">
              <div className="bh-add-attendance-v6-title">
                <div className="bh-add-attendance-v6-icon">☠</div>
                <div>
                  <div className="bh-section-kicker">BOSS HUNT</div>
                  <h2>Add New Attendance</h2>
                  <p>Record a player's attendance for a scheduled boss hunt.</p>
                </div>
              </div>

              {isAdmin && <div className="bh-add-attendance-v6-header-actions"><span className="bh-add-attendance-v6-admin">⚙ ADMIN ONLY</span><button type="button" className="bh-bulk-attendance-header-btn" onClick={openBHBulkAttendance}>☷ BULK ATTENDANCE</button></div>}

              <button
                className="bh-modal-close"
                onClick={() => setAttendanceModalOpen(false)}
                aria-label="Close add attendance"
              >×</button>
            </div>

            {/* =================================================
                ONLY ONE PLAYER SELECTOR
            ================================================= */}

            <AttendancePlayerFilter
              players={players}
              value={String(attendancePlayerId || "")}
              onChange={(playerId) => {
                setAttendancePlayerId(playerId ? String(playerId) : "");
                setAttendanceSelectedDate(todayKey);
                setSelectedScheduledSpawns([]);
              }}
              scheduleOccurrences={scheduleOccurrences}
              attendanceRows={attendanceRows}
              todayKey={todayKey}
              selectedScheduledSpawns={selectedScheduledSpawns}
              toggleScheduledSpawn={toggleScheduledSpawn}
              showTodaySchedule={attendanceMode === "scheduled"}
              onAddNewPlayer={isAdmin ? () => {
                setNewPlayerIgn("");
                setNewPlayerClass(CLASS_OPTIONS[0] || "");
                setNewPlayerWeapon("");
                setError("");
                setAddPlayerModalOpen(true);
              } : null}
            />

            {/* =================================================
                MODE TABS
            ================================================= */}

            <div className="bh-mode-tabs">
              <button
                className={
                  attendanceMode ===
                    "scheduled"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setAttendanceMode(
                    "scheduled"
                  )
                }
              >
                SCHEDULED
              </button>

              <button
                className={
                  attendanceMode ===
                    "manual"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setAttendanceMode(
                    "manual"
                  )
                }
              >
                ATTENDANCE CORRECTION
              </button>
            </div>

            {/* =================================================
                SCHEDULED
            ================================================= */}

            {attendanceMode ===
              "scheduled" && (
                <>
                  {/* Today's scheduled bosses are shown directly inside the selected-player card above. */}

                  <div className="bh-form-group">
                    <label>
                      COMMENT
                    </label>

                    <textarea
                      className="bh-textarea"
                      value={
                        attendanceComment
                      }
                      placeholder="Optional attendance note"
                      onChange={(e) =>
                        setAttendanceComment(
                          e.target
                            .value
                        )
                      }
                    />
                  </div>

                  <div className="bh-modal-actions">
                    <button
                      className="bh-secondary-button"
                      onClick={() =>
                        setAttendanceModalOpen(
                          false
                        )
                      }
                    >
                      CANCEL
                    </button>

                    <button
                      className="bh-primary-button"
                      disabled={
                        attendanceSaving ||
                        !attendancePlayerId ||
                        !selectedScheduledSpawns.length
                      }
                      onClick={
                        saveScheduledAttendance
                      }
                    >
                      {attendanceSaving
                        ? "SAVING..."
                        : "MARK ATTENDANCE"}
                    </button>
                  </div>
                </>
              )}

            {/* =================================================
                ATTENDANCE CORRECTION
            ================================================= */}

            {attendanceMode ===
              "manual" && (
                <>
                  <div className="bh-form-grid">
                    <div className="bh-form-group">
                      <label>
                        DATE
                      </label>

                      <input
                        className="bh-input"
                        type="date"
                        value={
                          overrideDate
                        }
                        onChange={(e) =>
                          setOverrideDate(
                            e.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="bh-form-group">
                      <label>
                        TIME
                      </label>

                      <input
                        className="bh-input"
                        type="time"
                        value={
                          overrideTime
                        }
                        onChange={(e) =>
                          setOverrideTime(
                            e.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="bh-form-group">
                      <label>
                        BOSS
                      </label>

                      <select
                        className="bh-select"
                        value={
                          overrideBoss
                        }
                        onChange={(e) => {
                          const id =
                            e.target
                              .value;

                          setOverrideBoss(
                            id
                          );

                          setOverridePoints(
                            bossPointsFromScoring(
                              scoring,
                              id
                            )
                          );
                        }}
                      >
                        {bossOptions.map(
                          (boss) => (
                            <option
                              key={
                                boss.id
                              }
                              value={
                                boss.id
                              }
                            >
                              {
                                boss.name
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="bh-form-group">
                      <label>
                        POINTS CORRECTION
                      </label>

                      <input
                        className="bh-input"
                        type="text"
                        inputMode="decimal"
                        value={
                          overridePoints
                        }
                        onChange={(e) =>
                          setOverridePoints(
                            formatNumericInput(e.target.value, true)
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="bh-override-warning">
                    Attendance correction
                    records the exact
                    selected date,
                    time, boss and
                    points. It does
                    not modify the Raid
                    Schedule.
                  </div>

                  <div className="bh-form-group">
                    <label>
                      CORRECTION COMMENT
                    </label>

                    <textarea
                      className="bh-textarea"
                      value={
                        overrideComment
                      }
                      placeholder="Explain why this attendance is being corrected (for example: forgot to add attendance)."
                      onChange={(e) =>
                        setOverrideComment(
                          e.target
                            .value
                        )
                      }
                    />
                  </div>

                  <div className="bh-modal-actions">
                    <button
                      className="bh-secondary-button"
                      onClick={() =>
                        setAttendanceModalOpen(
                          false
                        )
                      }
                    >
                      CANCEL
                    </button>

                    <button
                      className="bh-primary-button"
                      disabled={
                        attendanceSaving ||
                        !attendancePlayerId
                      }
                      onClick={
                        saveManualAttendance
                      }
                    >
                      {attendanceSaving
                        ? "SAVING..."
                        : "SAVE CORRECTION"}
                    </button>
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* ===================================================
          PLAYER HISTORY MODAL — COMPLETE ACTIVITY LOG
      =================================================== */}
      {historyPlayer && (
        <div
          className="bh-modal-backdrop bh-history-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHistoryPlayer(null);
          }}
        >
          <div className="bh-history-modal-v4">
            <header className="bh-history-v4-header">
              <div className="bh-history-v4-player">
                <div className="bh-history-v4-kicker">PLAYER HISTORY</div>
                <div className="bh-history-v4-profile">
                  <div className="bh-history-v4-avatar">
                    {clean(historyPlayer.ign).slice(0, 1).toUpperCase() || "?"}
                  </div>
                  <div className="bh-history-v4-player-main">
                    <h2>{historyPlayer.ign}</h2>
                    <p>
                      {historyPlayer.class || "Unknown class"}
                      {historyPlayer.weapon ? ` • ${historyPlayer.weapon}` : ""}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bh-history-v4-player-meta">
                <div><span>GUILD</span><strong>{historyPlayer.guild || historyPlayer.guildName || "24-7-G"}</strong></div>
                <div><span>JOINED</span><strong>{formatDate(historyPlayer.joinedAt || historyPlayer.joinDate || historyPlayer.createdAt, effectiveTimezone)}</strong></div>
                <div><span>STATUS</span><strong className={historyPlayer.active === false ? "is-disabled" : "is-active"}>● {historyPlayer.active === false ? "Disabled" : "Active"}</strong><small>{historyPlayer.active === false ? "Offline" : "Online"}</small></div>
              </div>
              <button
                type="button"
                className="bh-history-v4-close"
                onClick={() => setHistoryPlayer(null)}
              >
                ×
              </button>
            </header>

            <section className="bh-history-v4-stats">
              <div className="bh-history-v4-stat cyan">
                <span>▣</span>
                <div><small>BH DAYS ATTENDED</small><strong>{new Set(historyActivityRows.filter(r => r.eventType === "attendance").map(r => r.dateKey)).size}</strong><em>Unique calendar days</em></div>
              </div>
              <div className="bh-history-v4-stat gold">
                <span>★</span>
                <div><small>TOTAL POINTS EARNED</small><strong>{historyActivityRows.filter(r => r.eventType === "attendance").reduce((sum, r) => sum + safeNumber(r.points, 0), 0).toFixed(2)}</strong><em>Attendance points earned</em></div>
              </div>
              <div className="bh-history-v4-stat purple">
                <span>▣</span>
                <div><small>REWARDS CLAIMED</small><strong>{historyActivityRows.filter(r => r.eventType === "reward").length}</strong><em>Actual reward claims</em></div>
              </div>
              <div className="bh-history-v4-stat violet">
                <span>▤</span>
                <div><small>TOTAL ACTIVITY</small><strong>{historyActivityRows.length}</strong><em>Attendance + reward activity</em></div>
              </div>
            </section>

            <section className="bh-history-v4-toolbar">
              <div className="bh-history-v4-search">
                <span>⌕</span>
                <input
                  className="bh-input"
                  value={historySearch}
                  placeholder="Search boss, reward, date, time, admin..."
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                />
                {historySearch && (
                  <button type="button" onClick={() => { setHistorySearch(""); setHistoryPage(1); }}>×</button>
                )}
              </div>
              <div className="bh-history-v4-count">
                <small>ACTIVITY LOG</small>
                <strong>{historyRows.length} {historyRows.length === 1 ? "ENTRY" : "ENTRIES"}</strong>
              </div>
            </section>

            <nav className="bh-history-v4-tabs" aria-label="Player history filters">
              <button type="button" className={historyTab === "all" ? "active" : ""} onClick={() => setHistoryTab("all")}>ALL ACTIVITY</button>
              <button type="button" className={historyTab === "attendance" ? "active" : ""} onClick={() => setHistoryTab("attendance")}>ATTENDANCE HISTORY</button>
              <button type="button" className={historyTab === "rewards" ? "active" : ""} onClick={() => setHistoryTab("rewards")}>REWARD CLAIM HISTORY</button>
            </nav>

            <section className="bh-history-v4-log-card">
              <div className="bh-history-v4-log-head">
                <div><span>COMPLETE LOG</span><strong>{historyTab === "all" ? "Attendance & Reward Activity" : historyTab === "attendance" ? "Attendance History" : "Reward Claim History"}</strong></div>
                <span>● LIVE DATA</span>
              </div>

              <TableScroller>
                <table className="bh-history-v4-table">
                  <thead><tr>
                    <th>DATE &amp; TIME</th><th>TYPE</th><th>BOSS / REWARD</th><th>DETAILS</th><th>POINTS</th><th>RELATED REWARD</th><th>UPDATED BY</th>{isAdmin && <th>ACTIONS</th>}
                  </tr></thead>
                  <tbody>
                    {visibleHistory.map((row) => (
                      <tr key={row.id} className={row.eventType === "reward" ? "reward-row" : "attendance-row"}>
                        <td>
                          <div className="bh-history-v4-datetime">
                            <strong>
                              {row.dateTime
                                ? formatDate(
                                  row.dateTime,
                                  effectiveTimezone
                                )
                                : row.dateKey || "—"}
                            </strong>
                            <span>
                              {row.dateTime
                                ? formatTime(
                                  row.dateTime,
                                  effectiveTimezone
                                )
                                : row.timeKey || "—"}
                            </span>
                          </div>
                        </td>
                        <td><span className={`bh-history-v4-type ${row.eventType}`}><i>{row.eventType === "reward" ? "⚔" : "✦"}</i>{row.eventType === "reward" ? "REWARD CLAIMED" : (row.attendanceRow?.manualOverride ? "OVERRIDE" : "ATTENDANCE")}</span></td>
                        <td><div className="bh-history-v4-boss"><span>{clean(row.bossName).slice(0, 1).toUpperCase() || "B"}</span><strong>{row.bossName}</strong></div></td>
                        <td><span className="bh-history-v4-details">{row.details}</span></td>
                        <td><strong className={`bh-history-v4-points ${row.eventType}`}>{row.points > 0 ? "+" : ""}{row.points.toFixed(2)}</strong></td>
                        <td><span className="bh-history-v4-related">{row.relatedReward}</span></td>
                        <td><div className="bh-history-v4-updater"><strong>{row.updatedBy || "SYSTEM"}</strong>{isAdmin && row.eventType === "reward" && <small>ADMIN</small>}</div></td>
                        {isAdmin && (
                          <td>
                            {row.eventType === "attendance" ? (
                              <div className="bh-history-v4-actions">
                                <button type="button" onClick={() => openEditAttendance(row.attendanceRow)}>EDIT</button>
                                <button type="button" className="danger" onClick={() => deleteAttendance(row.attendanceRow)}>DELETE</button>
                              </div>
                            ) : (
                              <div className="bh-history-v4-actions">
                                <button type="button" onClick={() => openEditRewardClaim(row.rewardClaim)}>EDIT</button>
                                <button type="button" className="danger" onClick={() => deleteRewardClaim(row.rewardClaim)}>DELETE</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {!visibleHistory.length && <tr><td colSpan={isAdmin ? 8 : 7} className="bh-history-v4-empty"><strong>NO ACTIVITY FOUND</strong><span>No attendance or reward records match your filters.</span></td></tr>}
                  </tbody>
                </table>
              </TableScroller>
            </section>

            <footer className="bh-history-v4-footer">
              <span>Showing <b>{visibleHistory.length ? (historyPage - 1) * PAGE_SIZE + 1 : 0}</b>–<b>{Math.min(historyPage * PAGE_SIZE, historyRows.length)}</b> of <b>{historyRows.length}</b> entries</span>
              <div>
                <button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(1)}>«</button>
                <button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>‹</button>
                <strong>{historyPage} / {historyPageCount}</strong>
                <button type="button" disabled={historyPage >= historyPageCount} onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}>›</button>
                <button type="button" disabled={historyPage >= historyPageCount} onClick={() => setHistoryPage(historyPageCount)}>»</button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ===================================================
          EDIT ATTENDANCE MODAL
      =================================================== */}

      {editingAttendance && (
        <div
          className="bh-modal-backdrop bh-edit-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingAttendance(null);
          }}
        >
          <div className="bh-modal bh-admin-edit-modal bh-edit-attendance-modal">
            <div className="bh-edit-modal-header">
              <div className="bh-edit-modal-title-wrap">
                <div className="bh-edit-modal-icon">◷</div>
                <div>
                  <div className="bh-section-kicker">ADMIN</div>
                  <h2>Edit Attendance</h2>
                  <p>Correct the recorded boss hunt attendance entry.</p>
                </div>
              </div>

              <button
                type="button"
                className="bh-modal-close"
                aria-label="Close edit attendance"
                onClick={() => setEditingAttendance(null)}
              >
                ×
              </button>
            </div>

            <div className="bh-edit-modal-body">
              <div className="bh-edit-player-banner">
                <div className="bh-edit-player-avatar">
                  {(editingAttendance.playerName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <span>PLAYER</span>
                  <strong>{editingAttendance.playerName || "Unknown player"}</strong>
                  <small>Boss Hunt attendance record</small>
                </div>
              </div>

              <div className="bh-edit-field-grid">
                <div className="bh-edit-field-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">◈</span>
                    <span>
                      <strong>BOSS</strong>
                      <small>Boss recorded</small>
                    </span>
                  </div>
                  <select
                    className="bh-select bh-edit-large-input"
                    value={editAttendanceBoss}
                    onChange={(e) => setEditAttendanceBoss(e.target.value)}
                  >
                    {bossOptions.map((boss) => (
                      <option key={boss.id} value={boss.id}>
                        {boss.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bh-edit-field-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">▣</span>
                    <span>
                      <strong>DATE</strong>
                      <small>Local calendar date</small>
                    </span>
                  </div>
                  <input
                    className="bh-input bh-edit-large-input"
                    type="date"
                    value={editAttendanceDate}
                    onChange={(e) => setEditAttendanceDate(e.target.value)}
                  />
                </div>

                <div className="bh-edit-field-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">◷</span>
                    <span>
                      <strong>TIME</strong>
                      <small>Local spawn time</small>
                    </span>
                  </div>
                  <input
                    className="bh-input bh-edit-large-input"
                    type="time"
                    value={editAttendanceTime}
                    onChange={(e) => setEditAttendanceTime(e.target.value)}
                  />
                </div>

                <div className="bh-edit-field-card bh-edit-points-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">✦</span>
                    <span>
                      <strong>POINTS</strong>
                      <small>Attendance points</small>
                    </span>
                  </div>
                  <input
                    className="bh-input bh-edit-large-input"
                    type="text"
                    inputMode="decimal"
                    value={editAttendancePoints}
                    onChange={(e) => setEditAttendancePoints(formatNumericInput(e.target.value, true))}
                  />
                </div>
              </div>

              <div className="bh-edit-field-card bh-edit-comment-card">
                <div className="bh-edit-field-label">
                  <span className="bh-edit-field-icon">≡</span>
                  <span>
                    <strong>COMMENT</strong>
                    <small>Optional admin note</small>
                  </span>
                </div>
                <textarea
                  className="bh-textarea bh-edit-comment-input"
                  value={editAttendanceComment}
                  onChange={(e) => setEditAttendanceComment(e.target.value)}
                  placeholder="Add a note about this attendance change..."
                />
              </div>

              <div className="bh-edit-info-strip">
                <span>ADMIN ONLY</span>
                <p>Editing this record updates its points and audit information.</p>
              </div>
            </div>

            <div className="bh-edit-modal-footer">
              <button
                type="button"
                className="bh-secondary-button"
                onClick={() => setEditingAttendance(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="bh-primary-button bh-edit-save-button"
                onClick={saveEditedAttendance}
              >
                ✓ SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkAttendanceOpen && isAdmin && (
        <div className="bh-modal-backdrop bh-bulk-attendance-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBulkAttendanceOpen(false)}}>
          <div className="bh-modal bh-bulk-attendance-modal" role="dialog" aria-modal="true" aria-labelledby="bh-bulk-attendance-title">
            <div className="bh-modal-header bh-bulk-attendance-header">
              <div>
                <div className="bh-section-kicker">BOSS HUNT • BULK ATTENDANCE</div>
                <h2 id="bh-bulk-attendance-title">Bulk Add Attendance</h2>
                <p className="bh-modal-subtitle">Select saved scheduled boss spawns and multiple existing roster players. Each player is checked per boss; already-recorded combinations are shown and skipped.</p>
              </div>
              <button type="button" className="bh-modal-close" onClick={()=>setBulkAttendanceOpen(false)}>×</button>
            </div>
            <div className="bh-bulk-attendance-body">
              <section className="bh-bulk-attendance-card">
                <div className="bh-bulk-attendance-card-head"><div><span>1 • SCHEDULED DATE</span><small>Only dates that already have scheduled boss spawns can be selected.</small></div><b>{bulkAttendanceDateOccurrences.length} SPAWNS</b></div>
                <select value={bulkAttendanceDate} onChange={e=>{const d=e.target.value;setBulkAttendanceDate(d);setBulkAttendanceSpawns(scheduleOccurrences.filter(o=>o.dateKey===d).map(o=>o.occurrenceKey));setBulkAttendancePage(1)}}>
                  {bulkAttendanceDateOptions.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </section>

              <section className="bh-bulk-attendance-card">
                <div className="bh-bulk-attendance-card-head"><div><span>2 • BOSS SPAWNS</span><small>Click a saved spawn to include it. Existing player records will be marked ATTENDED and not duplicated.</small></div><b>{bulkAttendanceSpawns.length} SELECTED</b></div>
                <div className="bh-bulk-spawn-grid">
                  {bulkAttendanceDateOccurrences.map(o=>{const checked=bulkAttendanceSpawns.includes(o.occurrenceKey);return <button type="button" key={o.occurrenceKey} className={`bh-bulk-spawn-chip ${checked?"is-selected":""}`} onClick={()=>setBulkAttendanceSpawns(cur=>cur.includes(o.occurrenceKey)?cur.filter(x=>x!==o.occurrenceKey):[...cur,o.occurrenceKey])}>
                    <strong>{o.bossName || bossLabel(o.bossId)}</strong><span>{o.timeKey || "—"}</span><small>+{safeNumber(o.points,0).toFixed(2)} pts</small><i>{checked?"✓ SELECTED":"SELECT"}</i>
                  </button>})}
                  {!bulkAttendanceDateOccurrences.length&&<div className="bh-bulk-empty">No saved scheduled spawns exist for this date. No attendance record can be created from this date.</div>}
                </div>
              </section>

              <section className="bh-bulk-attendance-card">
                <div className="bh-bulk-attendance-card-head"><div><span>3 • PLAYERS</span><small>Select existing active roster players. Attendance status is shown separately for every selected boss.</small></div><b>{bulkAttendancePlayers.length} SELECTED</b></div>
                <div className="bh-bulk-player-toolbar"><input value={bulkAttendanceSearch} onChange={e=>{setBulkAttendanceSearch(e.target.value);setBulkAttendancePage(1)}} placeholder="Search IGN, class, preferred weapon..."/><select value={bulkAttendanceClassFilter} onChange={e=>{setBulkAttendanceClassFilter(e.target.value);setBulkAttendancePage(1)}}><option value="all">ALL CLASSES</option>{Array.from(new Set(players.filter(p=>p.active!==false).map(p=>clean(p.class||p.className)).filter(Boolean))).sort().map(c=><option key={c} value={c}>{c}</option>)}</select><select value={bulkAttendanceStatusFilter} onChange={e=>{setBulkAttendanceStatusFilter(e.target.value);setBulkAttendancePage(1)}}><option value="all">ALL ATTENDANCE</option><option value="not-attended">NOT ATTENDED</option><option value="attended">ALREADY ATTENDED</option><option value="partial">PARTIALLY ATTENDED</option></select><button type="button" onClick={toggleBHBulkPlayerPage}>{bulkAttendancePageRows.length&&bulkAttendancePageRows.every(p=>bulkAttendancePlayers.includes(String(p.id)))?"CLEAR PAGE":"SELECT PAGE"}</button><button type="button" onClick={()=>setBulkAttendancePlayers([])}>CLEAR</button></div>
                <div className="bh-bulk-player-table-wrap"><table className="bh-bulk-player-table"><thead><tr><th></th><th>PLAYER</th><th>CLASS</th>{bulkAttendanceDateOccurrences.filter(o=>bulkAttendanceSpawns.includes(o.occurrenceKey)).map(o=><th key={o.occurrenceKey}>{o.bossName || bossLabel(o.bossId)}<small>{o.timeKey}</small></th>)}</tr></thead><tbody>
                  {bulkAttendancePageRows.map(p=><tr key={p.id} className={bulkAttendancePlayers.includes(String(p.id))?"is-selected":""}><td><input type="checkbox" checked={bulkAttendancePlayers.includes(String(p.id))} onChange={()=>toggleBHBulkPlayer(p.id)}/></td><td><strong>{p.ign}</strong><small>{clean(p.weapon)||"Preferred weapon —"}</small></td><td>{clean(p.class||p.className)||"—"}</td>{bulkAttendanceDateOccurrences.filter(o=>bulkAttendanceSpawns.includes(o.occurrenceKey)).map(o=>{const attended=hasBHAttendanceForOccurrence(p.id,o);return <td key={o.occurrenceKey}><span className={`bh-bulk-boss-status ${attended?"is-attended":"is-ready"}`}>{attended?"✓ ATTENDED":"READY"}</span></td>})}</tr>)}
                  {!bulkAttendancePageRows.length&&<tr><td colSpan={3+bulkAttendanceSpawns.length} className="bh-bulk-empty">No active players match the filter.</td></tr>}
                </tbody></table></div>
                <div className="bh-bulk-pagination"><span>PAGE {bulkAttendanceSafePage} OF {bulkAttendancePageCount} • 5 PER PAGE • {bulkAttendanceVisiblePlayers.length} PLAYERS</span><div><button disabled={bulkAttendanceSafePage<=1} onClick={()=>setBulkAttendancePage(v=>Math.max(1,v-1))}>‹</button><button disabled={bulkAttendanceSafePage>=bulkAttendancePageCount} onClick={()=>setBulkAttendancePage(v=>Math.min(bulkAttendancePageCount,v+1))}>›</button></div></div>
              </section>

              <div className="bh-bulk-attendance-summary"><div><strong>{bulkAttendancePlayers.length}</strong><span>PLAYERS SELECTED</span></div><div><strong>{bulkAttendanceSpawns.length}</strong><span>BOSSES SELECTED</span></div><div><strong>{bulkAttendancePlayers.length * bulkAttendanceSpawns.length}</strong><span>COMBINATIONS CHECKED</span></div><div><strong>{bulkAttendancePlayers.filter(id=>bulkAttendanceDateOccurrences.filter(o=>bulkAttendanceSpawns.includes(o.occurrenceKey)).every(o=>hasBHAttendanceForOccurrence(id,o))).length}</strong><span>ALREADY COMPLETE</span></div></div>
              <label className="bh-bulk-attendance-comment">ADMIN COMMENT *<textarea value={bulkAttendanceComment} onChange={e=>setBulkAttendanceComment(e.target.value)} placeholder="Required. Explain why this bulk attendance is being recorded."/></label>
              {bulkAttendanceError&&<div className="bh-bulk-error">{bulkAttendanceError}</div>}
            </div>
            <div className="bh-modal-actions"><button type="button" className="bh-secondary-button" onClick={()=>setBulkAttendanceOpen(false)}>CANCEL</button><button type="button" className="bh-primary-button" disabled={bulkAttendanceSaving||!bulkAttendancePlayers.length||!bulkAttendanceSpawns.length||!bulkAttendanceDateOccurrences.length} onClick={saveBHBulkAttendance}>{bulkAttendanceSaving?"SAVING...":"✓ SAVE BULK ATTENDANCE"}</button></div>
          </div>
        </div>
      )}

      {bulkToolsModal && isAdmin && (
        <div className="bh-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBulkToolsModal(null)}}>
          <style>{`.bh-bulk-tools-modal{width:min(1180px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}.bh-bulk-tools-body{padding:18px 20px;overflow:auto}.bh-bulk-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bh-bulk-menu button{display:flex;gap:14px;align-items:flex-start;text-align:left;padding:15px;border:1px solid rgba(0,183,255,.25);background:#061b28;color:#e9f7ff;border-radius:9px;cursor:pointer}.bh-bulk-menu button:hover{border-color:#00b7ff}.bh-bulk-menu b{font-size:20px;color:#00c8ff;min-width:26px}.bh-bulk-menu strong{display:block;font-size:11px;letter-spacing:.08em}.bh-bulk-menu small{display:block;margin-top:5px;color:#82a9bc;line-height:1.4}.bh-bulk-toolbar{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(2,minmax(130px,.5fr)) auto;gap:8px;align-items:end;margin-bottom:10px}.bh-bulk-toolbar label,.bh-bulk-form label{display:flex;flex-direction:column;gap:5px;font-size:9px;font-weight:800;letter-spacing:.08em;color:#8bb5c9}.bh-bulk-toolbar input,.bh-bulk-form input,.bh-bulk-form select,.bh-bulk-form textarea{box-sizing:border-box;width:100%;border:1px solid #0a5575;background:#041923;color:#e9f7ff;border-radius:6px;padding:9px}.bh-bulk-toolbar button{padding:9px 11px;border:1px solid #0b668c;background:#062535;color:#aee8ff;border-radius:6px;cursor:pointer}.bh-bulk-table-wrap{border:1px solid rgba(0,183,255,.22);border-radius:8px;overflow:auto}.bh-bulk-table{width:100%;border-collapse:collapse;min-width:760px}.bh-bulk-table th,.bh-bulk-table td{padding:8px 9px;border-bottom:1px solid rgba(74,138,162,.15);text-align:left;font-size:10px}.bh-bulk-table th{color:#70cfff;font-size:8px;letter-spacing:.09em;background:#061d2b}.bh-bulk-table tr.is-selected{background:rgba(0,183,255,.09)}.bh-bulk-table td small{display:block;color:#7199aa;margin-top:2px}.bh-bulk-status{font-size:8px;font-weight:900;color:#66f3b0}.bh-bulk-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0;color:#6e9aae;font-size:9px}.bh-bulk-footer button{border:1px solid #0b5572;background:#061f2d;color:#a9d9ea;padding:6px 9px;border-radius:5px}.bh-bulk-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.bh-bulk-form .full{grid-column:1/-1}.bh-bulk-form textarea{min-height:70px;resize:vertical}.bh-bulk-warning,.bh-bulk-error{margin-top:10px;padding:10px 12px;border-radius:7px;font-size:10px}.bh-bulk-warning{border:1px solid rgba(255,82,105,.35);background:rgba(92,12,24,.2);color:#ff9eac}.bh-bulk-error{border:1px solid rgba(255,82,105,.5);background:rgba(92,12,24,.28);color:#ffb3bd}@media(max-width:800px){.bh-bulk-menu{grid-template-columns:1fr}.bh-bulk-toolbar{grid-template-columns:1fr 1fr}.bh-bulk-toolbar label:first-child{grid-column:1/-1}.bh-bulk-form{grid-template-columns:1fr}.bh-bulk-form .full{grid-column:auto}}`}</style>
          <div className="bh-modal bh-bulk-tools-modal" role="dialog" aria-modal="true">
            <div className="bh-modal-header"><div><div className="bh-section-kicker">BOSS HUNT • ADMIN TOOLS</div><h2>{bulkToolsMode==="menu"?"Bulk Tools":`Bulk ${bulkToolsMode.replaceAll("-"," ")}`}</h2><p className="bh-modal-subtitle">Every modification can target multiple EXISTING records. FROM/TO filters records only — they never create a new record.</p></div><button type="button" className="bh-modal-close" onClick={()=>setBulkToolsModal(null)}>×</button></div>
            <div className="bh-bulk-tools-body">
              {bulkToolsMode==="menu" ? <div className="bh-bulk-menu">
                <button className="bh-bulk-add-card" onClick={openBHBulkAttendance}><b>＋</b><span><strong>BULK ADD ATTENDANCE</strong><small>Mark multiple existing roster players against multiple existing scheduled boss spawns.</small></span></button>
                <button onClick={()=>openBHMultiTools("attendance-edit")}><b>✎</b><span><strong>BULK EDIT ATTENDANCE</strong><small>Correct points/comment on multiple saved BH attendance records.</small></span></button>
                <button onClick={()=>openBHMultiTools("attendance-redo")}><b>↻</b><span><strong>BULK REDO ATTENDANCE</strong><small>Remove multiple saved attendance records so they can be recorded again.</small></span></button>
                <button onClick={()=>openBHMultiTools("attendance-delete")}><b>×</b><span><strong>BULK DELETE ATTENDANCE</strong><small>Delete multiple existing attendance records only.</small></span></button>
                <button onClick={()=>openBHMultiTools("player-edit")}><b>♟</b><span><strong>BULK EDIT PLAYERS</strong><small>Apply class and/or preferred weapon changes to multiple players.</small></span></button>
                <button onClick={()=>openBHMultiTools("player-disable")}><b>⊘</b><span><strong>BULK DISABLE PLAYERS</strong><small>Disable multiple players while preserving history.</small></span></button>
                <button onClick={()=>openBHMultiTools("player-delete")}><b>⌫</b><span><strong>BULK DELETE PLAYERS</strong><small>Delete multiple roster profiles.</small></span></button>
                <button onClick={()=>openBHMultiTools("reward-edit")}><b>◆</b><span><strong>BULK EDIT REWARDS</strong><small>Update multiple existing rewards.</small></span></button>
                <button onClick={()=>openBHMultiTools("reward-delete")}><b>×</b><span><strong>BULK DELETE REWARDS</strong><small>Delete multiple unclaimed rewards; claimed rewards are protected.</small></span></button>
                <button onClick={()=>openBHMultiTools("claim-edit")}><b>✎</b><span><strong>BULK EDIT CLAIMS</strong><small>Correct notes on multiple existing reward claims.</small></span></button>
                <button onClick={()=>openBHMultiTools("claim-delete")}><b>×</b><span><strong>BULK DELETE CLAIMS</strong><small>Remove multiple claims and restore linked rewards.</small></span></button>
              </div> : <>
                <div className="bh-bulk-toolbar"><label>SEARCH<input value={bulkToolsSearch} onChange={e=>{setBulkToolsSearch(e.target.value);setBulkToolsPage(1)}} placeholder="IGN, boss, reward, date, status..."/></label><label>FROM<input type="date" value={bulkToolsFrom} onChange={e=>{setBulkToolsFrom(e.target.value);setBulkToolsPage(1)}}/></label><label>TO<input type="date" value={bulkToolsTo} onChange={e=>{setBulkToolsTo(e.target.value);setBulkToolsPage(1)}}/></label><div><button type="button" onClick={toggleBHMultiPage}>{bulkBHVisibleRows.length&&bulkBHVisibleRows.every(x=>bulkToolsSelected.includes(String(x.id)))?"CLEAR PAGE":"SELECT PAGE"}</button> <button type="button" onClick={()=>setBulkToolsSelected([])}>CLEAR</button></div></div>
                <div className="bh-bulk-table-wrap"><table className="bh-bulk-table"><thead><tr><th></th><th>PLAYER</th><th>CLASS / TYPE</th><th>RECORD</th><th>DATE / TIME</th><th>VALUE</th><th>STATUS</th></tr></thead><tbody>{bulkBHVisibleRows.map(x=><tr key={`${x.kind}-${x.id}`} className={bulkToolsSelected.includes(String(x.id))?"is-selected":""}><td><input type="checkbox" checked={bulkToolsSelected.includes(String(x.id))} onChange={()=>toggleBHMultiSelection(x.id)}/></td><td><strong>{x.ign||"—"}</strong></td><td>{x.className||"—"}<small>{x.weapon||"—"}</small></td><td><strong>{x.recordLabel}</strong></td><td>{x.dateKey||"—"}<small>{x.timeKey||"—"}</small></td><td>{x.value||"—"}</td><td><span className="bh-bulk-status">{x.status}</span></td></tr>)}{!bulkBHVisibleRows.length&&<tr><td colSpan="7">No EXISTING records match the filters.</td></tr>}</tbody></table></div>
                <div className="bh-bulk-footer"><span>PAGE {bulkBHSafePage} OF {bulkBHPageCount} • 5 PER PAGE • {filteredBHMultiRows.length} MATCHES • {bulkToolsSelected.length} SELECTED</span><div><button disabled={bulkBHSafePage<=1} onClick={()=>setBulkToolsPage(v=>Math.max(1,v-1))}>‹</button> <button disabled={bulkBHSafePage>=bulkBHPageCount} onClick={()=>setBulkToolsPage(v=>Math.min(bulkBHPageCount,v+1))}>›</button></div></div>
                <div className="bh-bulk-form">
                  {bulkToolsMode==="attendance-edit"&&<label>NEW POINTS<input inputMode="decimal" value={bulkToolsPoints} onChange={e=>setBulkToolsPoints(e.target.value.replace(/[^0-9.]/g,""))} placeholder="Leave blank to keep each record"/></label>}
                  {bulkToolsMode==="player-edit"&&<label>CLASS / NEW CLASS<TypeSelect id="bh-bulk-class" className="bh-input" value={bulkToolsClass} onChange={setBulkToolsClass} options={CLASS_OPTIONS} placeholder="Type or select class" /></label>}
                  {bulkToolsMode==="player-edit"&&<label>PREFERRED WEAPON<TypeSelect id="bh-bulk-weapon" className="bh-input" value={bulkToolsWeapon} onChange={setBulkToolsWeapon} options={Array.from(new Set([...players.map(p => clean(p.weapon)), ...rewards.map(r => clean(r.weaponClass)), ...rewardClaims.map(c => clean(c.weaponClass))].filter(Boolean)))} placeholder="Type or select weapon • blank keeps current" /></label>}
                  {bulkToolsMode==="reward-edit"&&<label>STATUS<select value={bulkToolsStatus} onChange={e=>setBulkToolsStatus(e.target.value)}><option value="available">Available</option><option value="disabled">Disabled</option><option value="claimed">Claimed</option></select></label>}
                  {(bulkToolsMode==="reward-edit"||bulkToolsMode==="claim-edit")&&<label className="full">NOTES<textarea value={bulkToolsNotes} onChange={e=>setBulkToolsNotes(e.target.value)} placeholder="Leave blank to keep each record's notes"/></label>}
                  {["attendance-delete","attendance-redo","reward-delete","claim-delete","player-disable","player-delete"].includes(bulkToolsMode)&&<div className="bh-bulk-warning full">EXACT SAVED RECORDS ONLY. The date filters only narrow the table. Selecting a date with no record cannot create a record.</div>}
                  {bulkToolsMode==="player-delete"&&<label>DELETE PIN *<input inputMode="numeric" value={bulkToolsPin} onChange={e=>setBulkToolsPin(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="5-digit PIN"/></label>}
                  <label className="full">ADMIN COMMENT *<textarea value={bulkToolsComment} onChange={e=>setBulkToolsComment(e.target.value)} placeholder="Required. Explain why these existing records are being changed."/></label>
                </div>
                {bulkToolsError&&<div className="bh-bulk-error">{bulkToolsError}</div>}
              </>}
            </div>
            <div className="bh-modal-actions">{bulkToolsMode==="menu"?<button type="button" className="bh-secondary-button" onClick={()=>setBulkToolsModal(null)}>CLOSE</button>:<><button type="button" className="bh-secondary-button" onClick={()=>setBulkToolsMode("menu")}>BACK</button><button type="button" className="bh-primary-button" disabled={bulkToolsSaving||!bulkSelectedBHRows.length} onClick={saveBHMultiChange}>{bulkToolsSaving?"PROCESSING...":"SAVE BULK CHANGE"}</button></>}</div>
          </div>
        </div>
      )}

      {/* ===================================================
          UNIFIED ADD NEW PLAYER MODAL — ONE OR MANY
      =================================================== */}
      {addPlayerModalOpen && isAdmin && (
        <div className="bh-modal-backdrop bh-add-player-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAddPlayerModalOpen(false); }}>
          <div className="bh-modal bh-add-player-modal bh-unified-player-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-player-title">
            <div className="bh-add-player-header">
              <div className="bh-add-player-icon">♙</div>
              <div>
                <div className="bh-section-kicker">PLAYER ROSTER • UNIFIED ADD</div>
                <h2 id="add-player-title">Add New Player</h2>
                <p>Enter one IGN or paste many IGNs. One line works exactly like individual adding; multiple lines create players in bulk.</p>
              </div>
              <span className="bh-add-player-admin">⚙ ADMIN ONLY</span>
              <button type="button" className="bh-modal-close" onClick={() => setAddPlayerModalOpen(false)} aria-label="Close add player">×</button>
            </div>

            <div className="bh-add-player-body bh-unified-player-add-body">
              <div className="bh-add-player-intro">
                <span>ONE OR MANY PLAYERS</span>
                <strong>Same workflow for single and bulk</strong>
                <p>Paste one IGN for a single player or one IGN per line for bulk. Existing IGNs and duplicate lines are detected before anything is saved.</p>
              </div>

              {bulkPlayerGroups.map((group, index) => (
                <section className="bh-unified-player-group" key={group.id}>
                  <div className="bh-unified-group-head">
                    <div><strong>GROUP {index + 1}</strong><small>IGN / IN-GAME NAME • ONE PER LINE</small></div>
                    {bulkPlayerGroups.length > 1 && <button type="button" className="bh-secondary-button bh-unified-remove-group" onClick={() => setBulkPlayerGroups(groups => groups.filter(g => g.id !== group.id))}>REMOVE GROUP</button>}
                  </div>
                  <textarea
                    className="bh-input bh-unified-igns"
                    value={group.igns}
                    onChange={e => { setBulkPlayerGroups(groups => groups.map(g => g.id === group.id ? { ...g, igns: e.target.value } : g)); setBulkPlayerError(""); }}
                    placeholder={'Player 1\nPlayer 2\nPlayer 3\nPlayer 4'}
                  />
                  <div className="bh-unified-player-fields">
                    <label>CLASS / NEW CLASS
                      <TypeSelect id={`bh-unified-class-${group.id}`} className="bh-input" value={group.className} onChange={value => setBulkPlayerGroups(groups => groups.map(g => g.id === group.id ? { ...g, className: value } : g))} options={CLASS_OPTIONS} placeholder="Type or select class..." />
                    </label>
                    <label>PREFERRED WEAPON
                      <TypeSelect id={`bh-unified-weapon-${group.id}`} className="bh-input" value={group.weapon} onChange={value => setBulkPlayerGroups(groups => groups.map(g => g.id === group.id ? { ...g, weapon: value } : g))} options={Array.from(new Set(players.map(p => clean(p.weapon)).filter(Boolean)))} placeholder="Type or select preferred weapon..." />
                    </label>
                  </div>
                  <div className="bh-unified-count">{String(group.igns || '').split(/\r?\n/).map(clean).filter(Boolean).length} player(s) in this group</div>
                  <div className="bh-unified-validation">
                    {Array.from(new Set(String(group.igns || '').split(/\r?\n/).map(clean).filter(Boolean))).map(ign => {
                      const existing = players.find(p => clean(p.ign).toLowerCase() === ign.toLowerCase());
                      return <div key={ign.toLowerCase()} className={existing ? "is-existing" : "is-new"}><span>{existing ? "⚠" : "✓"}</span><strong>{ign}</strong><small>{existing ? `ALREADY EXISTS • ${existing.active === false ? "DISABLED" : "ACTIVE"}` : "NEW PLAYER"}</small></div>;
                    })}
                  </div>
                </section>
              ))}

              <button type="button" className="bh-unified-add-group" onClick={() => setBulkPlayerGroups(groups => [...groups, { id: Date.now() + groups.length, igns: "", className: CLASS_OPTIONS[0] || "Swordman", weapon: "" }])}>＋ ADD ANOTHER GROUP</button>
              {bulkPlayerError && <div className="bh-add-player-error bh-unified-error">{bulkPlayerError}</div>}
            </div>

            <div className="bh-add-player-footer">
              <button type="button" className="bh-secondary-button" onClick={() => setAddPlayerModalOpen(false)}>CANCEL</button>
              <button type="button" className="bh-primary-button bh-add-player-save" disabled={bulkPlayerSaving || !bulkPlayerGroups.some(g => String(g.igns || '').trim())} onClick={saveBHPlayers}>
                {bulkPlayerSaving ? "SAVING PLAYERS..." : "＋ SAVE PLAYER(S)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          EDIT PLAYER MODAL
      =================================================== */}

      {editingPlayer && (
        <div
          className="bh-modal-backdrop bh-edit-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingPlayer(null);
          }}
        >
          <div className="bh-modal bh-admin-edit-modal bh-edit-player-modal">
            <div className="bh-edit-modal-header">
              <div className="bh-edit-modal-title-wrap">
                <div className="bh-edit-modal-icon">♙</div>
                <div>
                  <div className="bh-section-kicker">ADMIN</div>
                  <h2>Edit Player</h2>
                  <p>Update the player's roster information.</p>
                </div>
              </div>

              <button
                type="button"
                className="bh-modal-close"
                aria-label="Close edit player"
                onClick={() => setEditingPlayer(null)}
              >
                ×
              </button>
            </div>

            <div className="bh-edit-modal-body">
              <div className="bh-edit-field-card bh-edit-field-full">
                <div className="bh-edit-field-label">
                  <span className="bh-edit-field-icon">♙</span>
                  <span>
                    <strong>IGN</strong>
                    <small>In-game name</small>
                  </span>
                </div>
                <input
                  className="bh-input bh-edit-large-input"
                  value={editingPlayer.ign || ""}
                  onChange={(e) =>
                    setEditingPlayer((current) => ({
                      ...current,
                      ign: e.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </div>

              <div className="bh-edit-field-grid">
                <div className="bh-edit-field-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">◈</span>
                    <span>
                      <strong>CLASS</strong>
                      <small>Player class</small>
                    </span>
                  </div>
                  <TypeSelect id="bh-edit-player-class" className="bh-input bh-edit-large-input" value={editingPlayer.class || ""} onChange={(value) => setEditingPlayer((current) => ({ ...current, class: value }))} options={CLASS_OPTIONS} placeholder="Type or select class..." />
                </div>

                <div className="bh-edit-field-card">
                  <div className="bh-edit-field-label">
                    <span className="bh-edit-field-icon">⚔</span>
                    <span>
                      <strong>WEAPON</strong>
                      <small>Current weapon</small>
                    </span>
                  </div>
                  <input
                    className="bh-input bh-edit-large-input"
                    value={editingPlayer.weapon || ""}
                    onChange={(e) =>
                      setEditingPlayer((current) => ({
                        ...current,
                        weapon: e.target.value,
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="bh-edit-info-strip">
                <span>ADMIN ONLY</span>
                <p>Changes are saved to the player roster immediately.</p>
              </div>
            </div>

            <div className="bh-edit-modal-footer">
              <button
                type="button"
                className="bh-secondary-button"
                onClick={() => setEditingPlayer(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="bh-primary-button bh-edit-save-button"
                onClick={saveEditedPlayer}
              >
                ✓ SAVE PLAYER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          PERMANENT PLAYER DELETE CONFIRMATION
      =================================================== */}

      {deletePlayerTarget && (
        <div
          className="bh-modal-backdrop bh-delete-player-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deletePlayerBusy) {
              setDeletePlayerTarget(null);
              setDeletePlayerPin("");
            }
          }}
        >
          <div className="bh-modal bh-delete-player-modal" role="dialog" aria-modal="true" aria-labelledby="delete-player-title">
            <div className="bh-modal-header bh-delete-player-header">
              <div>
                <div className="bh-section-kicker">DANGER ZONE • ADMIN ONLY</div>
                <h2 id="delete-player-title">Permanently Delete Player</h2>
              </div>
              <button
                type="button"
                className="bh-modal-close"
                disabled={deletePlayerBusy}
                onClick={() => {
                  setDeletePlayerTarget(null);
                  setDeletePlayerPin("");
                }}
              >
                ×
              </button>
            </div>

            <div className="bh-delete-player-warning">
              <div className="bh-delete-player-warning-icon">!</div>
              <div>
                <strong>THIS ACTION CANNOT BE UNDONE</strong>
                <p>
                  You are about to permanently delete <b>{deletePlayerTarget.ign}</b>.
                  This removes the player and all of their attendance history, reward
                  claims, and player-assigned reward records.
                </p>
              </div>
            </div>

            <div className="bh-delete-player-summary">
              <span>PLAYER</span>
              <strong>{deletePlayerTarget.ign}</strong>
              <small>{deletePlayerTarget.class || "—"}{deletePlayerTarget.weapon ? ` • ${deletePlayerTarget.weapon}` : ""}</small>
            </div>

            <div className="bh-form-group bh-delete-player-pin-group">
              <label>ENTER ADMIN DELETE PIN</label>
              <input
                className="bh-input bh-delete-player-pin"
                type="password"
                inputMode="numeric"
                maxLength={5}
                autoFocus
                value={deletePlayerPin}
                placeholder="5-digit PIN"
                disabled={deletePlayerBusy}
                onChange={(e) => setDeletePlayerPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") permanentlyDeletePlayer();
                  if (e.key === "Escape" && !deletePlayerBusy) {
                    setDeletePlayerTarget(null);
                    setDeletePlayerPin("");
                  }
                }}
              />
              <small>Required confirmation PIN</small>
            </div>

            <div className="bh-delete-player-actions">
              <button
                type="button"
                className="bh-secondary-button"
                disabled={deletePlayerBusy}
                onClick={() => {
                  setDeletePlayerTarget(null);
                  setDeletePlayerPin("");
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="bh-delete-player-confirm"
                disabled={deletePlayerBusy || deletePlayerPin.length !== 5}
                onClick={permanentlyDeletePlayer}
              >
                {deletePlayerBusy ? "DELETING..." : "PERMANENTLY DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          EDIT REWARD CLAIM MODAL — ADMIN ONLY
      =================================================== */}

      {editingRewardClaim && isAdmin && (
        <div className="bh-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingRewardClaim(null); }}>
          <div className="bh-modal bh-reward-claim-edit-modal">
            <div className="bh-modal-header"><div><div className="bh-section-kicker">ADMIN ONLY</div><h2>Edit Reward Claim</h2><p className="bh-modal-subtitle">Correct the winner, reward or claim notes. Sonya claims always use the fixed 6.00-point deduction; mini-boss Duck Race claims are free.</p></div><button className="bh-modal-close" onClick={() => setEditingRewardClaim(null)}>×</button></div>
            <div className="bh-reward-form-grid">
              <div className="bh-form-group"><label>PLAYER (IGN)</label><select className="bh-select" value={editingRewardClaim.playerId || ""} onChange={(e) => { const v = e.target.value; const pl = players.find((x) => String(x.id) === String(v)); setEditingRewardClaim((x) => ({ ...x, playerId: v, playerName: pl?.ign || "" })); }}><option value="">Choose player...</option>{players.filter((p) => p.active).map((p) => <option key={String(p.id)} value={String(p.id)}>{p.ign}</option>)}</select></div>
              <div className="bh-form-group"><label>REWARD</label><select className="bh-select" value={editingRewardClaim.rewardId || ""} onChange={(e) => { const r = rewards.find((x) => String(x.id) === String(e.target.value)); setEditingRewardClaim((x) => ({ ...x, rewardId: e.target.value, rewardName: r?.name || x.rewardName || "", bossId: r?.bossId || x.bossId, bossName: r?.bossName || x.bossName, weaponClass: r?.weaponClass || x.weaponClass, points: normalizeBossId(r?.bossId || x.bossId) === "sonya" ? SONYA_REWARD_COST : 0 })); }}><option value="">Select reward...</option>{rewards.filter((r) => r.status !== "disabled").map((r) => <option key={String(r.id)} value={String(r.id)}>{r.bossName} · {r.name}</option>)}</select></div>
              <div className="bh-form-group"><label>BOSS</label><div className="bh-readonly-field"><strong>{editingRewardClaim.bossName || bossLabel(editingRewardClaim.bossId)}</strong><span>{normalizeBossId(editingRewardClaim.bossId) === "sonya" ? "GRAND BOSS" : "DUCK RACE BOSS"}</span></div></div>
              <div className="bh-form-group"><label>WEAPON CLASS</label><div className="bh-readonly-field">{weaponClassIconPath(editingRewardClaim.weaponClass) && <img src={weaponClassIconPath(editingRewardClaim.weaponClass)} alt="" style={{ width: 20, height: 20 }} />}<strong>{editingRewardClaim.weaponClass || "—"}</strong></div></div>
              <div className="bh-form-group"><label>POINTS</label><div className="bh-readonly-field bh-readonly-gold"><strong>{normalizeBossId(editingRewardClaim.bossId) === "sonya" ? "-6.00" : "FREE"}</strong><span>{normalizeBossId(editingRewardClaim.bossId) === "sonya" ? "Fixed Sonya cost" : "No point deduction"}</span></div></div>
              <div className="bh-form-group"><label>CLAIMED AT</label><div className="bh-readonly-field"><strong>{formatDateTime(editingRewardClaim.claimedAt, effectiveTimezone)}</strong></div></div>
              <div className="bh-form-group full"><label>NOTES</label><textarea className="bh-textarea" value={editingRewardClaim.notes || ""} placeholder="Optional claim note..." onChange={(e) => setEditingRewardClaim((x) => ({ ...x, notes: e.target.value }))} /></div>
            </div>
            <div className="bh-modal-actions"><button className="bh-secondary-button" onClick={() => setEditingRewardClaim(null)}>CANCEL</button><button className="bh-primary-button" onClick={saveEditedRewardClaim}>SAVE CLAIM</button></div>
          </div>
        </div>
      )}

      {/* ===================================================
          ADD / EDIT REWARD MODAL
      =================================================== */}

      {editingReward && (
        <div className="bh-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingReward(null); }}>
          <div className="bh-modal bh-reward-edit-modal">
            <div className="bh-modal-header"><div><div className="bh-section-kicker">ADMIN ONLY</div><h2>{editingReward.__new ? "Add New Reward" : "Edit Reward"}</h2><p className="bh-modal-subtitle">Assign a weapon-class reward to an eligible player. Sonya always costs 6.00 points; mini-boss Duck Race rewards are free.</p></div><button className="bh-modal-close" onClick={() => setEditingReward(null)}>×</button></div>
            <div className="bh-reward-form-grid">
              <div className="bh-form-group"><label>REWARD NAME</label><input className="bh-input" value={editingReward.__new ? rewardForm.name : editingReward.name || ""} onChange={(e) => editingReward.__new ? setRewardForm((x) => ({ ...x, name: e.target.value })) : setEditingReward((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Dex Gaunt" /></div>
              <div className="bh-form-group"><label>BOSS</label><TypeSelect id="bh-edit-reward-boss" className="bh-input" value={editingReward.__new ? rewardForm.bossId : editingReward.bossId || "sonya"} onChange={(bossId) => { if (editingReward.__new) setRewardForm((x) => ({ ...x, bossId, cost: bossId === "sonya" ? SONYA_REWARD_COST : 0 })); else setEditingReward((x) => ({ ...x, bossId, cost: bossId === "sonya" ? SONYA_REWARD_COST : 0 })); }} options={bossOptions.map((boss) => ({ value: boss.id, label: boss.name }))} placeholder="Type or select boss..." /></div>
              <div className="bh-form-group"><label>WEAPON CLASS</label><TypeSelect id="bh-edit-reward-class" className="bh-input" value={editingReward.__new ? rewardForm.weaponClass : editingReward.weaponClass || ""} onChange={(value) => editingReward.__new ? setRewardForm((x) => ({ ...x, weaponClass: value })) : setEditingReward((x) => ({ ...x, weaponClass: value }))} options={CLASS_OPTIONS} placeholder="Type or select class..." /></div>
              <div className="bh-form-group"><label>COST</label><div className="bh-readonly-field bh-readonly-gold"><strong>{(editingReward.__new ? rewardForm.bossId : editingReward.bossId) === "sonya" ? "-6.00" : "FREE"}</strong><span>{(editingReward.__new ? rewardForm.bossId : editingReward.bossId) === "sonya" ? "Fixed Sonya cost" : "Duck Race reward — no point deduction"}</span></div></div>
              <div className="bh-form-group"><label>PLAYER / WINNER</label><select className="bh-select" value={editingReward.__new ? rewardForm.playerId : editingReward.playerId || ""} onChange={(e) => { const v = e.target.value; const player = players.find((p) => String(p.id) === String(v)); editingReward.__new ? setRewardForm((x) => ({ ...x, playerId: v })) : setEditingReward((x) => ({ ...x, playerId: v, playerName: player?.ign || "" })); }}><option value="">Unassigned</option>{players.filter((p) => p.active).map((player) => <option key={String(player.id)} value={String(player.id)}>{player.ign} · {safeNumber(playerStats.find((s) => String(s.id) === String(player.id))?.available, 0).toFixed(2)} pts</option>)}</select></div>
              <div className="bh-form-group"><label>STATUS</label><select className="bh-select" value={editingReward.__new ? rewardForm.status : editingReward.status || "available"} onChange={(e) => editingReward.__new ? setRewardForm((x) => ({ ...x, status: e.target.value })) : setEditingReward((x) => ({ ...x, status: e.target.value }))}><option value="available">Available</option><option value="disabled">Disabled</option><option value="claimed">Claimed</option></select></div>
              <div className="bh-form-group full"><label>NOTES</label><textarea className="bh-textarea" value={editingReward.__new ? rewardForm.notes : editingReward.notes || ""} onChange={(e) => editingReward.__new ? setRewardForm((x) => ({ ...x, notes: e.target.value })) : setEditingReward((x) => ({ ...x, notes: e.target.value }))} placeholder="Optional reward note..." /></div>
            </div>
            <div className="bh-modal-actions"><button className="bh-secondary-button" onClick={() => setEditingReward(null)}>CANCEL</button><button className="bh-primary-button" disabled={rewardSaving} onClick={async () => { if (editingReward.__new) { setRewardSaving(true); const ok = await addReward(); setRewardSaving(false); if (ok) { setEditingReward(null); switchActiveTab("rewards"); } } else { await saveEditedReward(); } }}>{editingReward.__new ? "ADD REWARD" : "SAVE REWARD"}</button></div>
          </div>
        </div>
      )}

      {/* ===================================================
          NOTIFICATION DETAIL MODAL
      =================================================== */}
      {selectedNotice && (
        <div className="bh-modal-backdrop bh-notice-detail-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedNotice(null); }}>
          <div className="bh-modal bh-notice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="notice-detail-title">
            <div className="bh-modal-header">
              <div>
                <div className="bh-section-kicker">GUILD ACTIVITY</div>
                <h2 id="notice-detail-title">{selectedNotice.title || "Notification Details"}</h2>
                <p className="bh-modal-subtitle">Full record of this guild activity.</p>
              </div>
              <button type="button" className="bh-modal-close" onClick={() => setSelectedNotice(null)}>×</button>
            </div>

            <div className="bh-activity-detail-grid">
              <div><small>ACTION</small><strong>{selectedNotice.action || selectedNotice.title || "Activity"}</strong></div>
              <div><small>CREATED BY</small><strong>{selectedNotice.createdBy || "System"}</strong></div>
              <div><small>CREATED</small><strong>{formatDateTime(selectedNotice.createdAt || selectedNotice.timestamp, effectiveTimezone)}</strong></div>
              <div><small>LAST UPDATED</small><strong>{formatDateTime(selectedNotice.updatedAt || selectedNotice.createdAt || selectedNotice.timestamp, effectiveTimezone)}</strong></div>
              <div><small>MODULE</small><strong>{String(selectedNotice.module || "Boss Hunt").replace(/^bh-/, "").replace(/[-_]/g, " ")}</strong></div>
              <div><small>STATUS</small><strong>{selectedNotice.status || (noticeDayKey(selectedNotice.createdAt, effectiveTimezone) === todayKey ? "NEW TODAY" : "OLD")}</strong></div>
            </div>

            <div className="bh-activity-detail-block">
              <small>DETAILS</small>
              <p>{selectedNotice.message || "No additional message was recorded."}</p>
            </div>

            <div className="bh-activity-detail-block">
              <small>RECORD MAPPING</small>
              <div className="bh-activity-change-list">
                {(selectedNotice.recipientPlayerName || selectedNotice.playerName || selectedNotice.ign) && <div><b>PLAYER / RECIPIENT</b><span>{selectedNotice.recipientPlayerName || selectedNotice.playerName || selectedNotice.ign}</span></div>}
                {selectedNotice.entityId && <div><b>RECORD</b><span>{displayAuditText(selectedNotice.entityType || "Activity")}</span></div>}
                {(selectedNotice.rewardName || selectedNotice.reward) && <div><b>REWARD</b><span>{displayAuditText(selectedNotice.rewardName || selectedNotice.reward || "Reward")}</span></div>}

                {selectedNotice.scheduleId && <div><b>SCHEDULE</b><span>{selectedNotice.bossName || "Boss Hunt schedule"}</span></div>}
              </div>
            </div>

            <div className="bh-activity-detail-block">
              <small>RECORD</small>
              <ul className="bh-activity-record-list">
                {[
                  ["Player", selectedNotice.playerName || selectedNotice.ign],
                  ["Recipient / owner", selectedNotice.recipientPlayerName],
                  ["Boss", selectedNotice.bossName],
                  ["Reward", selectedNotice.rewardName || selectedNotice.reward],
                  ["Weapon class", selectedNotice.weaponClass || selectedNotice.className],
                  ["Points", selectedNotice.points ?? selectedNotice.pointValue],
                  ["Status", selectedNotice.status],
                  ["Reason", selectedNotice.reason],
                  ["Notes", selectedNotice.notes],
                  ["Changed by", selectedNotice.updatedBy || selectedNotice.createdBy],
                ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "").map(([label, value]) => (
                  <li key={label}><b>{label}:</b> {displayAuditText(value)}</li>
                ))}
              </ul>
            </div>

            {Array.isArray(selectedNotice.changes) && selectedNotice.changes.length > 0 && (
              <div className="bh-activity-detail-block">
                <small>CHANGES</small>
                <div className="bh-activity-change-list">
                  {selectedNotice.changes.map((item, index) => {
                    const change = typeof item === "string" ? { field: "ACTION", from: "", to: item } : item;
                    return <div key={`change-${index}`}><b>{change.field || "CHANGE"}</b><span>{displayAuditText(change.from || "—")} → {displayAuditText(change.to || "—")}</span></div>;
                  })}
                </div>
              </div>
            )}

            {Array.isArray(selectedNotice.details) && selectedNotice.details.length > 0 && (
              <div className="bh-activity-detail-block">
                <small>ACTION DETAILS</small>
                <ul className="bh-activity-record-list">
                  {selectedNotice.details.map((item, index) => { const text = displayAuditText(item); if (!text || /^(claim record|reward id|claim id|schedule id|item id|player id|uid|user id|treasury id)\b/i.test(text)) return null; return <li key={`detail-${index}`}>{text}</li>; })}
                </ul>
              </div>
            )}

            {(selectedNotice.connections?.links?.length || selectedNotice.connectionMap?.length) ? (
              <div className="bh-activity-detail-block">
                <small>LINKED RECORDS</small>
                <div className="bh-activity-change-list">
                  {(selectedNotice.connections?.links || selectedNotice.connectionMap || []).map((link, index) => (
                    <div key={`link-${index}`}><b>{link.label || "LINK"}</b><span>{displayAuditText(link.collection || "Linked record")}{link.playerName ? ` • ${link.playerName}` : ""}{link.rewardName ? ` • ${link.rewardName}` : ""}</span></div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="bh-modal-actions">
              <button type="button" className="bh-secondary-button" onClick={() => setSelectedNotice(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          LOADING
      =================================================== */}

      {loading && (
        <div className="bh-loading-overlay">
          <div className="bh-loading-card">
            <div className="bh-spinner" />

            <strong>
              Loading Boss Hunt...
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
