import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  formatDateTimeWithTimezone,
  timezoneAbbreviation,
  useGlobalDisplayTimezone,
} from "../lib/displayTimezone";
import "./Announcements.css";

const TYPE_META = {
  EVENT: { label: "EVENT", icon: "▣" },
  IMPORTANT: { label: "IMPORTANT", icon: "!" },
  GENERAL: { label: "GENERAL", icon: "◆" },
  MAINTENANCE: { label: "MAINTENANCE", icon: "⚒" },
  UPDATE: { label: "UPDATE", icon: "↻" },
};

function asDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (value?.seconds != null) return new Date(Number(value.seconds) * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isVisible(item, now = Date.now()) {
  if (item.active === false) return false;
  const start = asDate(item.startAt)?.getTime();
  const end = asDate(item.endAt)?.getTime();
  if (start != null && now < start) return false;
  if (end != null && now >= end) return false;
  return true;
}

function typeMeta(type) {
  return TYPE_META[String(type || "GENERAL").toUpperCase()] || TYPE_META.GENERAL;
}

export default function Announcements() {
  const { resolvedTimezone } = useGlobalDisplayTimezone();
  const [rows, setRows] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "announcements"),
      (snap) => {
        setRows(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoadError("");
      },
      (error) => setLoadError(error?.message || "Unable to load announcements.")
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const activeRows = useMemo(() => rows
    .filter((item) => isVisible(item, now))
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const aStart = asDate(a.startAt)?.getTime() || asDate(a.updatedAt)?.getTime() || 0;
      const bStart = asDate(b.startAt)?.getTime() || asDate(b.updatedAt)?.getTime() || 0;
      return bStart - aStart;
    }), [rows, now]);

  if (loadError || !activeRows.length) return null;

  return (
    <section className="announcement-board" aria-label="Guild announcements">
      <div className="announcement-board-header">
        <div>
          <span className="announcement-megaphone" aria-hidden="true">◢</span>
          <div>
            <div className="announcement-kicker">GUILD INFORMATION</div>
            <h2>ANNOUNCEMENTS</h2>
          </div>
        </div>
        <span className="announcement-timezone">TIMES SHOWN IN {timezoneAbbreviation(new Date(), resolvedTimezone) || resolvedTimezone}</span>
      </div>

      <div className="announcement-list">
        {activeRows.map((item) => {
          const meta = typeMeta(item.type);
          const start = asDate(item.startAt);
          const end = asDate(item.endAt);
          return (
            <article className={`announcement-item announcement-type-${String(item.type || "GENERAL").toLowerCase()}`} key={item.id}>
              <div className="announcement-type-icon" aria-hidden="true">{meta.icon}</div>
              <div className="announcement-copy">
                <div className="announcement-title-row">
                  {item.pinned && <span className="announcement-pin">★ PINNED</span>}
                  <span className="announcement-type-badge">{meta.label}</span>
                  <h3>{item.title || "Guild Announcement"}</h3>
                </div>
                <div className="announcement-message">{item.message || ""}</div>
                <div className="announcement-dates">
                  {start && <span>START: {formatDateTimeWithTimezone(start, resolvedTimezone)}</span>}
                  {end ? <span>ENDS: {formatDateTimeWithTimezone(end, resolvedTimezone)}</span> : <span>NO END DATE • ALWAYS VISIBLE WHILE ACTIVE</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
