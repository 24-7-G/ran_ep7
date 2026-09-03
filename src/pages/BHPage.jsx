import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "../firebase";

import {
  ADMIN_UID,
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

import sonyaImage from "../bosses/sonya.png";
import geomancerImage from "../bosses/geomancer.png";
import giantHawkImage from "../bosses/giant-hawk.png";
import reflectorImage from "../bosses/reflector.png";

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

function formatTime(date, timezone = PRIMARY_TIMEZONE) {
  const d = safeToDate(date);
  if (!d) return "—";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
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

  const result = [];

  const getWeekday = (dateKey) => {
    const d = zonedLocalToDate(dateKey, "12:00", displayTimezone);
    return d ? d.getUTCDay() : -1;
  };

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

  const addOccurrence = (sourceRaid, dateKey, hour, minute) => {
    if (!visibleKeys.has(dateKey)) return;

    const timezone =
      clean(sourceRaid?.timezone) ||
      displayTimezone ||
      PRIMARY_TIMEZONE;

    const spawnAt = zonedLocalToDate(
      dateKey,
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      timezone
    );

    if (!spawnAt) return;

    const raidId = canonicalRaidId(sourceRaid);
    const bossId = normalizeBossId(
      sourceRaid?.id ??
      sourceRaid?.bossId ??
      sourceRaid?.name
    );

    if (!raidId || !bossId) return;

    result.push({
      id: `${raidId}-${spawnAt.getTime()}`,
      occurrenceKey: `${raidId}-${spawnAt.getTime()}`,
      scheduleId: raidId,
      bossId,
      bossName:
        clean(
          sourceRaid?.name ??
          sourceRaid?.bossName ??
          sourceRaid?.title
        ) || bossLabel(bossId),
      points: bossPointsFromScoring(scoring, bossId),
      spawnAt,
      dateKey: dateKeyFromDate(spawnAt, displayTimezone),
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

    const { hour, minute } = parseTime(raid);
    const type = lower(raid.scheduleType);
    const raidDays = Array.isArray(raid.days) ? raid.days : [];

    for (const dateKey of visibleKeys) {
      let shouldAdd = false;

      if (type === "weekly") {
        const weekday = getWeekday(dateKey);
        shouldAdd = raidDays.length
          ? raidDays.some(
            (day) => normalizeWeekday(day) === weekday
          )
          : false;
      } else if (type === "interval") {
        const anchorDateKey = clean(raid.anchorDate);
        if (!anchorDateKey || !raid.intervalHours) continue;

        const base = zonedLocalToDate(
          anchorDateKey,
          `${String(raid.anchorHour).padStart(2, "0")}:${String(raid.anchorMinute).padStart(2, "0")}`,
          clean(raid.timezone) ||
          displayTimezone ||
          PRIMARY_TIMEZONE
        );

        const target = zonedLocalToDate(
          dateKey,
          `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          clean(raid.timezone) ||
          displayTimezone ||
          PRIMARY_TIMEZONE
        );

        if (!base || !target) continue;

        const intervalMs =
          Number(raid.intervalHours) *
          60 *
          60 *
          1000;

        if (intervalMs <= 0) continue;

        const delta = target.getTime() - base.getTime();
        const quotient = delta / intervalMs;

        shouldAdd =
          quotient >= 0 &&
          Math.abs(quotient - Math.round(quotient)) < 1e-8;
      } else {
        // Daily schedules occur every day at their configured time.
        shouldAdd = true;
      }

      if (shouldAdd) {
        addOccurrence(raid, dateKey, hour, minute);
      }
    }
  }

  const unique = new Map();

  for (const occurrence of result) {
    const key =
      `${occurrence.bossId}|${occurrence.spawnAt.getTime()}`;

    if (!unique.has(key)) {
      unique.set(key, occurrence);
    }
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

  return {
    id: String(snapshot.id),
    ...data,
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
    createdAt:
      data.createdAt || null,
    updatedAt:
      data.updatedAt || null,
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

function normalizeNotice(
  snapshot
) {
  const data =
    snapshot.data() || {};

  return {
    id: String(snapshot.id),
    ...data,
    module:
      clean(data.module) ||
      "bh-attendance",
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
}) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

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

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visiblePlayers = filteredPlayers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
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
            <div className="bh-picker-v6-detail bh-picker-v6-id">
              <div><b>{String(selected.id || "—")}</b><small>PLAYER ID</small></div>
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
                const alreadyRecorded = attendanceRows.some(
                  (row) => attendanceMatchesPlayer(row, value) && occurrenceMatchesRow(row, occurrence)
                );
                const checked = selectedScheduledSpawns.includes(occurrence.occurrenceKey);
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
                      <small>{occurrence.timeKey}</small>
                      <b>{occurrence.bossName}</b>
                      <strong>+{safeNumber(occurrence.points, 0).toFixed(2)} pts</strong>
                    </span>
                    <span className="bh-picker-v6-boss-check">{alreadyRecorded ? "✓" : checked ? "✓" : ""}</span>
                    {alreadyRecorded && <em>RECORDED</em>}
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
              const number = (safePage - 1) * PAGE_SIZE + index + 1;
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
            <span>{filteredPlayers.length ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredPlayers.length)} of ${filteredPlayers.length}` : "0 players"}</span>
            {filteredPlayers.length > PAGE_SIZE && (
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

export default function BHPage() {
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
  ] = useState("schedule");

  const [
    displayTimezone,
    setDisplayTimezone,
  ] = useState(
    PRIMARY_TIMEZONE
  );

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
    cost: 1,
    playerId: "",
    status: "available",
    spawnAt: "",
    notes: "",
  });

  const [
    rewardSaving,
    setRewardSaving,
  ] = useState(false);

  const [
    editingReward,
    setEditingReward,
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
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(
            user || null
          );

          setIsAdmin(
            !!user &&
            user.uid ===
            ADMIN_UID
          );
        }
      );

    return unsubscribe;
  }, []);

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

  const effectiveTimezone =
    displayTimezone ===
      "Automatic"
      ? browserTimezone
      : displayTimezone;

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
                false
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
      );
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
      return rewards.filter(
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
      );
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
      );
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
    }) => {
      try {
        await addDoc(
          collection(
            db,
            "guildNotices"
          ),
          {
            module,
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
          }
        );
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
                false
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
        }

        if (added) {
          await createGuildNotice(
            {
              title:
                "Boss Hunt Attendance Recorded",

              message:
                `${player.ign} was marked present for ${added} scheduled boss hunt spawn${added === 1
                  ? ""
                  : "s"
                }.`,

              type: "success",
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
              "Boss Hunt Points Override",

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
          }
        );

        setSuccess(
          "Manual attendance added."
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
          "Could not save manual attendance."
        );
      } finally {
        setAttendanceSaving(
          false
        );
      }
    };

  /* =========================================================
     ADD PLAYER
  ========================================================= */

  const addPlayer =
    async () => {
      if (!isAdmin) return;

      const ign =
        clean(
          newPlayerIgn
        );

      if (!ign) {
        setError(
          "Enter an IGN."
        );
        return;
      }

      const duplicate =
        players.some(
          (player) =>
            lower(
              player.ign
            ) ===
            lower(ign)
        );

      if (duplicate) {
        setError(
          "That IGN already exists."
        );
        return;
      }

      try {
        await addDoc(
          collection(
            db,
            "players"
          ),
          {
            ign,

            class:
              clean(
                newPlayerClass
              ),

            weapon:
              clean(
                newPlayerWeapon
              ),

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
          }
        );

        await createGuildNotice(
          {
            title:
              "Player Added",

            message:
              `${ign} was added to the guild roster.`,

            type: "success",
          }
        );

        setNewPlayerIgn("");
        setNewPlayerWeapon("");

        setSuccess(
          `Player ${ign} added.`
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not add player."
        );
      }
    };

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
          message: `A player and all associated attendance, reward claims, and assigned reward records were permanently deleted by ${getCurrentUpdaterName()}.`,
          type: "warning",
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

      const cost =
        safeNumber(
          rewardForm.cost,
          0
        );

      if (cost <= 0) {
        setError(
          "Reward cost must be greater than zero."
        );
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

        await addDoc(
          collection(
            db,
            "bhRewards"
          ),
          {
            name,

            bossId:
              normalizeBossId(
                rewardForm.bossId
              ),

            bossName:
              bossLabel(
                rewardForm.bossId
              ),

            cost,

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
          }
        );

        await createGuildNotice(
          {
            title:
              "New Boss Hunt Reward",

            message:
              `${name} was added to the reward list for ${cost.toFixed(
                2
              )} points.`,

            type: "success",
          }
        );

        setRewardForm({
          name: "",
          bossId:
            DEFAULT_BOSS_LIST[0]
              ?.id ||
            "sonya",
          cost: 1,
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
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not add reward."
        );
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

            cost:
              safeNumber(
                editingReward.cost,
                0
              ),

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

        await createGuildNotice(
          {
            title:
              "Reward Updated",

            message:
              `${editingReward.name} was updated by ${getCurrentUpdaterName()}.`,

            type: "info",
          }
        );

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

  const claimReward =
    async (reward) => {
      if (!currentUser) {
        setError(
          "You must be signed in to claim a reward."
        );
        return;
      }

      if (!reward.playerId) {
        setError(
          "This reward is not assigned to a player."
        );
        return;
      }

      if (
        reward.status !==
        "available"
      ) {
        setError(
          "This reward is not currently available."
        );
        return;
      }

      const stats =
        playerStats.find(
          (player) =>
            String(
              player.id
            ) ===
            String(
              reward.playerId
            )
        );

      if (!stats) {
        setError(
          "Player could not be found."
        );
        return;
      }

      const cost =
        safeNumber(
          reward.cost,
          0
        );

      if (
        stats.available <
        cost
      ) {
        setError(
          `${stats.ign} only has ${stats.available.toFixed(
            2
          )} available points.`
        );

        return;
      }

      try {
        await addDoc(
          collection(
            db,
            "bhRewardClaims"
          ),
          {
            playerId:
              String(
                stats.id
              ),

            playerName:
              stats.ign,

            rewardId:
              String(
                reward.id
              ),

            rewardName:
              reward.name,

            bossId:
              reward.bossId,

            bossName:
              reward.bossName,

            points:
              cost,

            status:
              "claimed",

            claimedAt:
              serverTimestamp(),

            claimedBy:
              getCurrentUpdaterName(),

            claimedByUid:
              currentUser?.uid ||
              null,
          }
        );

        await updateDoc(
          doc(
            db,
            "bhRewards",
            String(
              reward.id
            )
          ),
          {
            status:
              "claimed",

            updatedAt:
              serverTimestamp(),

            updatedBy:
              getCurrentUpdaterName(),
          }
        );

        await createGuildNotice(
          {
            title:
              "Reward Claimed",

            message:
              `${stats.ign} claimed ${reward.name} for ${cost.toFixed(
                2
              )} points.`,

            type: "success",
          }
        );

        setSuccess(
          `${reward.name} claimed for ${cost.toFixed(
            2
          )} points.`
        );

        await loadAllData();
        await reloadGuildNotices();
      } catch (err) {
        console.error(err);

        setError(
          err?.message ||
          "Could not claim reward."
        );
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

    const player = players.find(
      (p) => String(p.id) === String(claim.playerId || "")
    );

    setEditingRewardClaim({
      ...claim,
      id: String(claim.id || ""),
      playerId: String(claim.playerId || ""),
      playerName: claim.playerName || player?.ign || "",
      rewardId: String(claim.rewardId || ""),
      rewardName: claim.rewardName || "Sonya Weapon",
      bossId: "sonya",
      bossName: "Sonya",
      points: SONYA_REWARD_COST,
      status: "claimed",
      notes: claim.notes || "",
    });
  };

  const saveEditedRewardClaim = async () => {
    if (!isAdmin || !editingRewardClaim) return;

    const player = players.find(
      (p) => String(p.id) === String(editingRewardClaim.playerId || "")
    );

    if (!player) {
      setError("Please select a valid player.");
      return;
    }

    try {
      const claimId = String(editingRewardClaim.id || "");
      const existingClaim = rewardClaims.find(
        (claim) => String(claim.id) === claimId
      );

      const payload = {
        playerId: String(player.id),
        playerName: player.ign || "",
        rewardId: String(editingRewardClaim.rewardId || ""),
        rewardName: clean(editingRewardClaim.rewardName) || "Sonya Weapon",
        bossId: "sonya",
        bossName: "Sonya",
        points: SONYA_REWARD_COST,
        status: "claimed",
        notes: clean(editingRewardClaim.notes),
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUpdaterName(),
      };

      if (existingClaim) {
        await updateDoc(
          doc(db, "bhRewardClaims", claimId),
          payload
        );
      } else if (editingRewardClaim.rewardId) {
        // Legacy claim stored only on the reward document. Keep the reward
        // claimed and update its assigned player/name instead.
        await updateDoc(
          doc(db, "bhRewards", String(editingRewardClaim.rewardId)),
          {
            playerId: String(player.id),
            playerName: player.ign || "",
            name: payload.rewardName,
            bossId: "sonya",
            bossName: "Sonya",
            cost: SONYA_REWARD_COST,
            status: "claimed",
            notes: payload.notes,
            updatedAt: serverTimestamp(),
            updatedBy: getCurrentUpdaterName(),
          }
        );
      } else {
        throw new Error("This reward claim could not be located.");
      }

      await createGuildNotice({
        title: "Reward Claim Updated",
        message: `${player.ign}\'s Sonya weapon claim was updated by ${getCurrentUpdaterName()}.`,
        type: "info",
      });

      setEditingRewardClaim(null);
      setSuccess("Reward claim updated.");
      await loadAllData();
      await reloadGuildNotices();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not update reward claim.");
    }
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
            ? (clean(row.comment) || "Manual attendance override")
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
      (a, b) =>
        (b.dateTime?.getTime() || 0) - (a.dateTime?.getTime() || 0)
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

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="bh-page">
      <div className="bh-page-header">
        <div>
          <div className="bh-eyebrow">
            RAN ONLINE EP7 CLASSIC
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

        <div className="bh-view-status">
          {isAdmin
            ? "ADMIN"
            : "VIEW ONLY"}
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

      {/* ===================================================
          SUMMARY CARDS
      =================================================== */}

      <div className="bh-summary-grid">
        <div className="bh-summary-card">
          <div className="bh-summary-label">
            PLAYERS
          </div>

          <div className="bh-summary-value">
            {totalPlayers}
          </div>

          <div className="bh-summary-sub">
            Registered roster
          </div>
        </div>

        <div className="bh-summary-card">
          <div className="bh-summary-label">
            THIS SPAWN
          </div>

          <div className="bh-summary-value">
            {selectedScheduleSpawnCount}
          </div>

          <div className="bh-summary-sub">
            {selectedScheduleDate
              ? formatLongDate(
                zonedLocalToDate(
                  selectedScheduleDate,
                  "12:00",
                  effectiveTimezone
                ),
                effectiveTimezone
              )
              : "Today"}
          </div>
        </div>

        <div className="bh-summary-card">
          <div className="bh-summary-label">
            REWARDS
          </div>

          <div className="bh-summary-value">
            {totalAvailableRewardCount}
          </div>

          <div className="bh-summary-sub">
            Available rewards
          </div>
        </div>

        <div className="bh-summary-card">
          <div className="bh-summary-label">
            ELIGIBLE
          </div>

          <div className="bh-summary-value">
            {eligiblePlayers.length}
          </div>

          <div className="bh-summary-sub">
            At{" "}
            {BH_CLAIM_THRESHOLD.toFixed(
              1
            )}
            +
          </div>
        </div>
      </div>

      {/* ===================================================
          REWARDS + NOTIFICATIONS
      =================================================== */}

      {/* ===================================================
          GUILD NOTICE BOARD
      =================================================== */}

      <section className="bh-notice-board">
        <div className="bh-notice-board-header">
          <div>
            <div className="bh-section-kicker">
              GUILD NOTIFICATIONS
            </div>

            <h2>
              Guild Notice Board
            </h2>

            <p>
              New notices stay NEW for the rest of today.
              After the local calendar date changes, they move to OLD.
            </p>
          </div>

          <div className="bh-notice-board-counts">
            <div className="bh-notice-count bh-notice-count-new">
              <strong>{guildNotices.filter((notice) => {
                const d = safeToDate(notice.createdAt);
                if (!d) return false;

                const today = new Intl.DateTimeFormat("en-CA", {
                  timeZone: effectiveTimezone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(d);

                return today === todayKey;
              }).length}</strong>
              <span>NEW TODAY</span>
            </div>

            <div className="bh-notice-count">
              <strong>{guildNotices.filter((notice) => {
                const d = safeToDate(notice.createdAt);
                if (!d) return false;

                const noticeDay = new Intl.DateTimeFormat("en-CA", {
                  timeZone: effectiveTimezone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(d);

                return noticeDay !== todayKey;
              }).length}</strong>
              <span>OLD</span>
            </div>
          </div>
        </div>

        {(() => {
          const newNotices = guildNotices.filter((notice) => {
            const d = safeToDate(notice.createdAt);
            if (!d) return false;

            const noticeDay = new Intl.DateTimeFormat("en-CA", {
              timeZone: effectiveTimezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(d);

            return noticeDay === todayKey;
          });

          const oldNotices = guildNotices.filter((notice) => {
            const d = safeToDate(notice.createdAt);
            if (!d) return false;

            const noticeDay = new Intl.DateTimeFormat("en-CA", {
              timeZone: effectiveTimezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(d);

            return noticeDay !== todayKey;
          });

          return (
            <>
              <div className="bh-notice-board-section">
                <div className="bh-notice-board-section-title">
                  NEW TODAY
                </div>

                {newNotices.length ? (
                  <div className="bh-notice-board-list">
                    {newNotices.slice(0, 6).map((notice) => (
                      <div
                        key={notice.id}
                        className={`bh-notice-board-item bh-notice-${notice.type}`}
                      >
                        <div className="bh-notice-board-item-main">
                          <strong>{notice.title}</strong>
                          <span>{notice.message}</span>
                        </div>

                        <div className="bh-notice-board-item-meta">
                          <b>NEW</b>
                          <span>
                            {formatDateTime(
                              notice.createdAt,
                              effectiveTimezone
                            )}
                          </span>
                          <span>
                            by {notice.createdBy || "System"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bh-notice-board-empty">
                    No new notices today.
                  </div>
                )}
              </div>

              <div className="bh-notice-board-section">
                <div className="bh-notice-board-section-title">
                  OLD NOTICES
                </div>

                {oldNotices.length ? (
                  <div className="bh-notice-board-list">
                    {oldNotices.slice(0, 6).map((notice) => (
                      <div
                        key={notice.id}
                        className={`bh-notice-board-item bh-notice-old bh-notice-${notice.type}`}
                      >
                        <div className="bh-notice-board-item-main">
                          <strong>{notice.title}</strong>
                          <span>{notice.message}</span>
                        </div>

                        <div className="bh-notice-board-item-meta">
                          <b>OLD</b>
                          <span>
                            {formatDateTime(
                              notice.createdAt,
                              effectiveTimezone
                            )}
                          </span>
                          <span>
                            by {notice.createdBy || "System"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bh-notice-board-empty">
                    No old notices.
                  </div>
                )}
              </div>
            </>
          );
        })()}

        <button
          className="bh-secondary-button"
          onClick={() =>
            setActiveTab("notices")
          }
        >
          VIEW ALL NOTIFICATIONS
        </button>
      </section>

      {/* ===================================================
          REWARD CENTER
      =================================================== */}

      <section className="bh-reward-center">
        <div className="bh-reward-center-header">
          <div>
            <div className="bh-section-kicker">
              REWARD CENTER
            </div>

            <h2>
              Boss Hunt Rewards
            </h2>

            <p>
              Rewards are grouped by boss with total, claimed and unclaimed counts.
            </p>
          </div>

          <div className="bh-reward-summary-cards">
            <div className="bh-reward-summary-card">
              <strong>{totalRewardCount}</strong>
              <span>Total rewards available</span>
            </div>

            <div className="bh-reward-summary-card">
              <strong>
                {totalClaimedRewardCount}
              </strong>
              <span>Claimed</span>
            </div>

            <div className="bh-reward-summary-card">
              <strong>{totalUnclaimedRewardCount}</strong>
              <span>Unclaimed</span>
            </div>
          </div>
        </div>

        <div className="bh-reward-boss-table">
          <div className="bh-reward-boss-head">
            <span>BOSS</span>
            <span>TOTAL REWARDS</span>
            <span>CLAIMED</span>
            <span>UNCLAIMED</span>
          </div>

          {rewardBossSummary.map((boss) => (
            <div
              className="bh-reward-boss-row"
              key={boss.id}
            >
              <div className="bh-reward-boss-cell bh-reward-boss-name">
                <img
                  src={bossImagePath(boss.id)}
                  alt={boss.name}
                  className="bh-reward-boss-image"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />

                <strong>{boss.name}</strong>
              </div>

              <div className="bh-reward-boss-cell">
                <strong>{boss.total}</strong>
              </div>

              <div className="bh-reward-boss-cell bh-reward-claimed">
                <strong>{boss.claimed}</strong>
              </div>

              <div className="bh-reward-boss-cell bh-reward-unclaimed">
                <strong>{boss.unclaimed}</strong>
              </div>
            </div>
          ))}
        </div>

        <button
          className="bh-secondary-button bh-reward-view-button"
          onClick={() =>
            setActiveTab("rewards")
          }
        >
          VIEW REWARDS
        </button>
      </section>

      {/* ===================================================
          BOSS INFORMATION
      =================================================== */}

      <section className="bh-panel">
        <div className="bh-panel-header">
          <div>
            <div className="bh-section-kicker">
              BOSS INFORMATION
            </div>

            <h2>
              Boss Hunt Scoring
            </h2>
          </div>
        </div>

        <div className="bh-boss-grid">
          {bossOptions.map(
            (boss) => (
              <div
                key={
                  boss.id
                }
                className="bh-boss-card"
              >
                <div className="bh-boss-name">
                  {
                    boss.name
                  }
                </div>

                <div className="bh-boss-points">
                  {safeNumber(
                    boss.points,
                    0
                  ).toFixed(
                    2
                  )}
                </div>

                <div className="bh-boss-points-label">
                  points
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* ===================================================
          TABS
      =================================================== */}

      <div className="bh-tabs">
        <button
          className={
            activeTab ===
              "schedule"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "schedule"
            )
          }
        >
          ACTUAL SCHEDULE
        </button>

        <button
          className={
            activeTab ===
              "players"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "players"
            )
          }
        >
          PLAYERS & HISTORY
        </button>

        <button
          className={
            activeTab ===
              "rewards"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "rewards"
            )
          }
        >
          REWARDS
        </button>

        <button
          className={
            activeTab ===
              "notices"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "notices"
            )
          }
        >
          NOTIFICATIONS
        </button>

        {isAdmin && (
          <button
            className={
              activeTab ===
                "admin"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveTab(
                "admin"
              )
            }
          >
            ADMIN
          </button>
        )}
      </div>

      {/* ===================================================
          ACTUAL SCHEDULE
      =================================================== */}

      {activeTab ===
        "schedule" && (
          <section className="bh-panel">
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

              <div className="bh-timezone-control">
                <label>
                  DISPLAY TIMEZONE
                </label>

                <select
                  className="bh-select"
                  value={
                    displayTimezone
                  }
                  onChange={(e) =>
                    setDisplayTimezone(
                      e.target.value
                    )
                  }
                >
                  {TIMEZONES.map(
                    (tz) => (
                      <option
                        key={
                          tz.value
                        }
                        value={
                          tz.value
                        }
                      >
                        {
                          tz.label
                        }
                      </option>
                    )
                  )}
                </select>
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
                                    setSelectedScheduleDate(
                                      dateKey
                                    );

                                    if (
                                      isAdmin
                                    ) {
                                      openAttendanceModal(
                                        dateKey,
                                        occurrence
                                      );
                                    }
                                  }}
                                >
                                  <div className="bh-occurrence-time">
                                    {
                                      occurrence.timeKey
                                    }
                                  </div>

                                  <div className="bh-occurrence-boss">
                                    {
                                      occurrence.bossName
                                    }
                                  </div>

                                  <div className="bh-occurrence-points">
                                    +
                                    {safeNumber(
                                      occurrence.points,
                                      0
                                    ).toFixed(
                                      2
                                    )}
                                  </div>

                                  <div className="bh-occurrence-status">
                                    {recordedCount
                                      ? `${recordedCount} recorded`
                                      : "No attendance"}
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

      {/* ===================================================
          PLAYERS
      =================================================== */}

      {activeTab === "players" && (
        <section className="bh-panel bh-players-dashboard bh-players-dashboard-v8">
          <div className="bh-players-hero bh-players-hero-v8">
            <div className="bh-players-title-wrap bh-players-title-wrap-v8">
              <div className="bh-players-emblem bh-players-emblem-v8" aria-hidden="true">
                <span>♟</span>
              </div>
              <div>
                <div className="bh-section-kicker">PLAYER ROSTER</div>
                <h2>Players &amp; History</h2>
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

              <div className="bh-player-stat bh-player-stat-purple bh-player-stat-v8">
                <div className="bh-player-stat-icon">⚔</div>
                <div>
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
                      LAST UPDATED<br />DATE &amp; TIME
                    </th>
                    <th rowSpan="2" className="bh-v6-update-head">
                      UPDATED BY<br />ADMIN
                    </th>
                    <th rowSpan="2" className="bh-v6-actions-head">ACTIONS</th>
                  </tr>
                  <tr className="bh-v6-sub-row">
                    {DEFAULT_BOSS_LIST.map((boss) => (
                      <th key={boss.id}>
                        {boss.name.toUpperCase()}<small>({safeNumber(boss.points, 0).toFixed(1)} PT)</small>
                      </th>
                    ))}
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
                          <td key={boss.id} className="bh-v6-attendance-cell">
                            <strong>{safeNumber(player.attendanceByBoss?.[boss.id], 0).toFixed(2)}</strong>
                          </td>
                        ))}

                        <td className="bh-v6-total-cell">
                          <strong>{safeNumber(player.points, 0).toFixed(2)}</strong>
                        </td>

                        <td className="bh-v6-sonya-count-cell">
                          <strong>{safeNumber(player.sonyaClaimsCount, 0)}</strong>
                        </td>

                        <td className="bh-v6-deduction-cell">
                          <strong>{player.sonyaDeducted > 0 ? `-${safeNumber(player.sonyaDeducted, 0).toFixed(2)}` : "0.00"}</strong>
                        </td>

                        <td className="bh-v6-balance-cell">
                          <strong>{safeNumber(player.available, 0).toFixed(2)}</strong>
                        </td>

                        <td className="bh-v6-updated-cell">
                          <span>◫ {formatDate(player.latestUpdatedAt, effectiveTimezone)}</span>
                          <span>◷ {formatTime(player.latestUpdatedAt, effectiveTimezone)}</span>
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
        </section>
      )}

      {/* ===================================================
          REWARDS
      =================================================== */}

      {activeTab ===
        "rewards" && (
          <section className="bh-panel">
            <div className="bh-panel-header">
              <div>
                <div className="bh-section-kicker">
                  REWARD CENTER
                </div>

                <h2>
                  Boss Hunt Rewards
                </h2>

                <p>
                  Rewards use
                  attendance points.
                  Claim history is
                  preserved.
                </p>
              </div>
            </div>

            <div className="bh-filter-row">
              <input
                className="bh-input"
                value={
                  rewardSearch
                }
                placeholder="Search reward, player or boss..."
                onChange={(e) => {
                  setRewardSearch(
                    e.target.value
                  );

                  setRewardPage(
                    1
                  );
                }}
              />

              <select
                className="bh-select"
                value={
                  rewardBossFilter
                }
                onChange={(e) => {
                  setRewardBossFilter(
                    e.target.value
                  );

                  setRewardPage(
                    1
                  );
                }}
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

              <select
                className="bh-select"
                value={
                  rewardStatusFilter
                }
                onChange={(e) => {
                  setRewardStatusFilter(
                    e.target.value
                  );

                  setRewardPage(
                    1
                  );
                }}
              >
                <option value="all">
                  All Status
                </option>

                <option value="available">
                  Available
                </option>

                <option value="claimed">
                  Claimed
                </option>

                <option value="disabled">
                  Disabled
                </option>
              </select>
            </div>

            <TableScroller>
              <table className="bh-table">
                <thead>
                  <tr>
                    <th>
                      REWARD
                    </th>

                    <th>
                      BOSS
                    </th>

                    <th>
                      COST
                    </th>

                    <th>
                      PLAYER
                    </th>

                    <th>
                      STATUS
                    </th>

                    <th>
                      ACTIONS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleRewards.map(
                    (reward) => {
                      const stats =
                        playerStats.find(
                          (p) =>
                            String(
                              p.id
                            ) ===
                            String(
                              reward.playerId
                            )
                        );

                      const canClaim =
                        reward.status ===
                        "available" &&
                        stats &&
                        stats.available >=
                        reward.cost;

                      return (
                        <tr
                          key={
                            String(
                              reward.id
                            )
                          }
                        >
                          <td>
                            <strong>
                              {
                                reward.name
                              }
                            </strong>

                            {reward.notes && (
                              <div className="bh-muted">
                                {
                                  reward.notes
                                }
                              </div>
                            )}
                          </td>

                          <td>
                            {
                              reward.bossName
                            }
                          </td>

                          <td>
                            {safeNumber(
                              reward.cost,
                              0
                            ).toFixed(
                              2
                            )}
                          </td>

                          <td>
                            {
                              reward.playerName ||
                              "Unassigned"
                            }
                          </td>

                          <td>
                            <span
                              className={`bh-status-pill bh-status-${reward.status}`}
                            >
                              {
                                reward.status
                              }
                            </span>
                          </td>

                          <td>
                            <div className="bh-action-row">
                              {reward.playerId &&
                                reward.status ===
                                "available" && (
                                  <button
                                    className="bh-small-button"
                                    disabled={
                                      !canClaim
                                    }
                                    onClick={() =>
                                      claimReward(
                                        reward
                                      )
                                    }
                                  >
                                    CLAIM
                                  </button>
                                )}

                              {isAdmin && (
                                <button
                                  className="bh-small-button"
                                  onClick={() =>
                                    setEditingReward(
                                      {
                                        ...reward,
                                      }
                                    )
                                  }
                                >
                                  EDIT
                                </button>
                              )}
                            </div>

                            {reward.playerId &&
                              stats &&
                              reward.status ===
                              "available" && (
                                <div className="bh-muted">
                                  Available:{" "}
                                  {stats.available.toFixed(
                                    2
                                  )}
                                </div>
                              )}
                          </td>
                        </tr>
                      );
                    }
                  )}

                  {!visibleRewards.length && (
                    <tr>
                      <td
                        colSpan="6"
                        className="bh-empty-cell"
                      >
                        No rewards
                        found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroller>

            <div className="bh-pagination">
              <button
                disabled={
                  rewardPage <=
                  1
                }
                onClick={() =>
                  setRewardPage(
                    (p) =>
                      Math.max(
                        1,
                        p - 1
                      )
                  )
                }
              >
                PREVIOUS
              </button>

              <span>
                Page{" "}
                {rewardPage} of{" "}
                {
                  rewardPageCount
                }
              </span>

              <button
                disabled={
                  rewardPage >=
                  rewardPageCount
                }
                onClick={() =>
                  setRewardPage(
                    (p) =>
                      Math.min(
                        rewardPageCount,
                        p + 1
                      )
                  )
                }
              >
                NEXT
              </button>
            </div>

            <div className="bh-subsection">
              <div className="bh-subsection-header">
                <h3>
                  Reward Claim
                  History
                </h3>
              </div>

              <TableScroller>
                <table className="bh-table">
                  <thead>
                    <tr>
                      <th>
                        DATE
                      </th>

                      <th>
                        PLAYER
                      </th>

                      <th>
                        REWARD
                      </th>

                      <th>
                        BOSS
                      </th>

                      <th>
                        POINTS
                      </th>

                      <th>
                        CLAIMED BY
                      </th>

                      {isAdmin && (
                        <th>ACTIONS</th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {rewardClaims
                      .slice(
                        0,
                        50
                      )
                      .map(
                        (
                          claim
                        ) => (
                          <tr
                            key={
                              String(
                                claim.id
                              )
                            }
                          >
                            <td>
                              {formatDateTime(
                                claim.claimedAt,
                                effectiveTimezone
                              )}
                            </td>

                            <td>
                              {
                                claim.playerName
                              }
                            </td>

                            <td>
                              {
                                claim.rewardName
                              }
                            </td>

                            <td>
                              {
                                claim.bossName
                              }
                            </td>

                            <td>
                              <strong className="bh-reward-claim-deduction">
                                -{SONYA_REWARD_COST.toFixed(2)}
                              </strong>
                            </td>

                            <td>
                              {
                                claim.claimedBy ||
                                "—"
                              }
                            </td>

                            {isAdmin && (
                              <td>
                                <div className="bh-history-v4-actions">
                                  <button type="button" onClick={() => openEditRewardClaim(claim)}>EDIT</button>
                                  <button type="button" className="danger" onClick={() => deleteRewardClaim(claim)}>DELETE</button>
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      )}

                    {!rewardClaims.length && (
                      <tr>
                        <td
                          colSpan={isAdmin ? 7 : 6}
                          className="bh-empty-cell"
                        >
                          No reward
                          claims
                          yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableScroller>
            </div>
          </section>
        )}

      {/* ===================================================
          NOTIFICATIONS
      =================================================== */}

      {activeTab ===
        "notices" && (
          <section className="bh-panel">
            <div className="bh-panel-header">
              <div>
                <div className="bh-section-kicker">
                  GUILD NOTIFICATIONS
                </div>

                <h2>
                  Activity &
                  Notifications
                </h2>

                <p>
                  Changes to
                  attendance, points,
                  overrides, rewards
                  and players appear
                  here.
                </p>
              </div>

              <button
                className="bh-secondary-button"
                onClick={
                  reloadGuildNotices
                }
              >
                REFRESH
              </button>
            </div>

            <div className="bh-notices-list">
              {guildNotices.map(
                (notice) => (
                  <div
                    key={
                      notice.id
                    }
                    className={`bh-notice-card bh-notice-${notice.type}`}
                  >
                    <div className="bh-notice-card-main">
                      <div className="bh-notice-card-title">
                        {
                          notice.title
                        }
                      </div>

                      <div className="bh-notice-card-message">
                        {
                          notice.message
                        }
                      </div>
                    </div>

                    <div className="bh-notice-card-meta">
                      <span>
                        {formatDateTime(
                          notice.createdAt,
                          effectiveTimezone
                        )}
                      </span>

                      <span>
                        {
                          notice.createdBy ||
                          "System"
                        }
                      </span>
                    </div>
                  </div>
                )
              )}

              {!guildNotices.length && (
                <div className="bh-empty-state">
                  No notifications
                  yet.
                </div>
              )}
            </div>
          </section>
        )}

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

                  <select
                    className="bh-select"
                    value={
                      newPlayerClass
                    }
                    onChange={(e) =>
                      setNewPlayerClass(
                        e.target.value
                      )
                    }
                  >
                    {CLASS_OPTIONS.map(
                      (
                        className
                      ) => (
                        <option
                          key={
                            className
                          }
                          value={
                            className
                          }
                        >
                          {
                            className
                          }
                        </option>
                      )
                    )}
                  </select>
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
                        type="number"
                        min="0"
                        step="0.01"
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
                                safeNumber(
                                  e
                                    .target
                                    .value,
                                  0
                                ),
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
                            e.target
                              .value,
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
                    type="number"
                    min="0"
                    step="0.01"
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
                            e.target
                              .value,
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
          FLOATING ADD ATTENDANCE
      =================================================== */}

      {isAdmin && (
        <button
          className="bh-floating-add"
          onClick={() =>
            openAttendanceModal()
          }
        >
          + ADD NEW ATTENDANCE
        </button>
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

              {isAdmin && <span className="bh-add-attendance-v6-admin">⚙ ADMIN ONLY</span>}

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
                MANUAL OVERRIDE
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
                MANUAL OVERRIDE
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
                        POINTS OVERRIDE
                      </label>

                      <input
                        className="bh-input"
                        type="number"
                        step="0.01"
                        value={
                          overridePoints
                        }
                        onChange={(e) =>
                          setOverridePoints(
                            e.target
                              .value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="bh-override-warning">
                    Manual override
                    records the exact
                    selected date,
                    time, boss and
                    points. It does
                    not modify the Raid
                    Schedule.
                  </div>

                  <div className="bh-form-group">
                    <label>
                      OVERRIDE COMMENT
                    </label>

                    <textarea
                      className="bh-textarea"
                      value={
                        overrideComment
                      }
                      placeholder="Explain why this attendance or point value is being overridden."
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
                        : "SAVE OVERRIDE"}
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
                  <div>
                    <h2>{historyPlayer.ign}</h2>
                    <p>
                      {historyPlayer.class || "Unknown class"}
                      {historyPlayer.weapon ? ` • ${historyPlayer.weapon}` : ""}
                    </p>
                  </div>
                </div>
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
                <span>✦</span>
                <div><small>ATTENDANCE EARNED</small><strong>{safeNumber(historyPlayer.points, 0).toFixed(2)}</strong><em>All-time attendance</em></div>
              </div>
              <div className="bh-history-v4-stat purple">
                <span>⚔</span>
                <div><small>SONYA CLAIMS</small><strong>{safeNumber(historyPlayer.sonyaClaimsCount, 0)}</strong><em>−6.00 pts per Sonya claim</em></div>
              </div>
              <div className="bh-history-v4-stat gold">
                <span>◈</span>
                <div><small>REWARD BALANCE</small><strong>{safeNumber(historyPlayer.available, 0).toFixed(2)}</strong><em>Earned minus Sonya claims</em></div>
              </div>
              <div className="bh-history-v4-stat violet">
                <span>▤</span>
                <div><small>TOTAL LOG ENTRIES</small><strong>{historyActivityRows.length}</strong><em>Attendance + reward history</em></div>
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
                        <td><div className="bh-history-v4-datetime"><strong>{row.dateKey || "—"}</strong><span>{row.timeKey || "—"}</span></div></td>
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
                    type="number"
                    step="0.01"
                    min="0"
                    value={editAttendancePoints}
                    onChange={(e) => setEditAttendancePoints(e.target.value)}
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
                  <select
                    className="bh-select bh-edit-large-input"
                    value={editingPlayer.class || ""}
                    onChange={(e) =>
                      setEditingPlayer((current) => ({
                        ...current,
                        class: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select class...</option>
                    {CLASS_OPTIONS.map((className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ))}
                  </select>
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
        <div
          className="bh-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setEditingRewardClaim(null);
            }
          }}
        >
          <div className="bh-modal bh-reward-claim-edit-modal">
            <div className="bh-modal-header">
              <div>
                <div className="bh-section-kicker">ADMIN</div>
                <h2>Edit Reward Claim</h2>
                <p className="bh-modal-subtitle">
                  Update the Sonya weapon claim record. A Sonya claim always deducts 6.00 points.
                </p>
              </div>

              <button
                type="button"
                className="bh-modal-close"
                onClick={() => setEditingRewardClaim(null)}
              >
                ×
              </button>
            </div>

            <div className="bh-form-group">
              <label>PLAYER (IGN)</label>
              <select
                className="bh-select"
                value={editingRewardClaim.playerId || ""}
                onChange={(e) =>
                  setEditingRewardClaim((current) => ({
                    ...current,
                    playerId: String(e.target.value),
                  }))
                }
              >
                <option value="">Select player...</option>
                {players.map((player) => (
                  <option key={String(player.id)} value={String(player.id)}>
                    {player.ign}
                  </option>
                ))}
              </select>
            </div>

            <div className="bh-form-group">
              <label>REWARD</label>
              <input
                className="bh-input"
                value={editingRewardClaim.rewardName || "Sonya Weapon"}
                onChange={(e) =>
                  setEditingRewardClaim((current) => ({
                    ...current,
                    rewardName: e.target.value,
                  }))
                }
              />
            </div>

            <div className="bh-form-group">
              <label>BOSS</label>
              <div className="bh-readonly-field">
                <span>⚔</span>
                <strong>Sonya</strong>
              </div>
            </div>

            <div className="bh-form-group">
              <label>POINTS DEDUCTED</label>
              <div className="bh-readonly-field bh-readonly-gold">
                <strong>-6.00</strong>
                <span>Fixed Sonya weapon cost</span>
              </div>
            </div>

            <div className="bh-form-group">
              <label>NOTES</label>
              <textarea
                className="bh-textarea"
                value={editingRewardClaim.notes || ""}
                placeholder="Optional claim note..."
                onChange={(e) =>
                  setEditingRewardClaim((current) => ({
                    ...current,
                    notes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="bh-modal-actions">
              <button
                type="button"
                className="bh-secondary-button"
                onClick={() => setEditingRewardClaim(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="bh-primary-button"
                onClick={saveEditedRewardClaim}
              >
                SAVE CLAIM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          EDIT REWARD MODAL
      =================================================== */}

      {editingReward && (
        <div
          className="bh-modal-backdrop"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setEditingReward(
                null
              );
            }
          }}
        >
          <div className="bh-modal">
            <div className="bh-modal-header">
              <div>
                <div className="bh-section-kicker">
                  ADMIN
                </div>

                <h2>
                  Edit Reward
                </h2>
              </div>

              <button
                className="bh-modal-close"
                onClick={() =>
                  setEditingReward(
                    null
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="bh-form-group">
              <label>
                REWARD
              </label>

              <input
                className="bh-input"
                value={
                  editingReward.name ||
                  ""
                }
                onChange={(e) =>
                  setEditingReward(
                    (
                      current
                    ) => ({
                      ...current,
                      name:
                        e.target
                          .value,
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
                  editingReward.bossId ||
                  ""
                }
                onChange={(e) =>
                  setEditingReward(
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
                type="number"
                min="0"
                step="0.01"
                value={
                  editingReward.cost ??
                  0
                }
                onChange={(e) =>
                  setEditingReward(
                    (
                      current
                    ) => ({
                      ...current,
                      cost:
                        e.target
                          .value,
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
                  editingReward.playerId ||
                  ""
                }
                onChange={(e) =>
                  setEditingReward(
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
                  editingReward.status ||
                  "available"
                }
                onChange={(e) =>
                  setEditingReward(
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

                <option value="claimed">
                  Claimed
                </option>
              </select>
            </div>

            <div className="bh-form-group">
              <label>
                NOTES
              </label>

              <textarea
                className="bh-textarea"
                value={
                  editingReward.notes ||
                  ""
                }
                onChange={(e) =>
                  setEditingReward(
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

            <div className="bh-modal-actions">
              <button
                className="bh-secondary-button"
                onClick={() =>
                  setEditingReward(
                    null
                  )
                }
              >
                CANCEL
              </button>

              <button
                className="bh-primary-button"
                onClick={
                  saveEditedReward
                }
              >
                SAVE REWARD
              </button>
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
