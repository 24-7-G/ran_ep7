import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";
import "./TicketPage.css";

const ADMIN_UID = "oKGRQDdmiXUFuyRPDw5QsPBmsAD2";
const PAGE_SIZE = 10;

const CATEGORIES = [
  "ACCOUNT / PLAYER",
  "CLAN WAR",
  "BOSS HUNT",
  "REWARDS",
  "SCHEDULE",
  "TREASURY",
  "WEBSITE",
  "OTHER",
];

const PRIORITIES = {
  urgent: { label: "URGENT", className: "urgent" },
  high: { label: "HIGH", className: "high" },
  normal: { label: "NORMAL", className: "normal" },
  low: { label: "LOW", className: "low" },
};

const STATUSES = {
  new: { label: "NEW", className: "new" },
  pending: { label: "PENDING", className: "pending" },
  investigating: { label: "INVESTIGATING", className: "investigating" },
  resolved: { label: "RESOLVED", className: "resolved" },
};

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function actor(user) {
  return user?.email || user?.displayName || user?.uid || "Guest";
}

function isAdminUser(user, isAdmin) {
  return Boolean(isAdmin || user?.uid === ADMIN_UID);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && value.seconds != null) {
    return new Date(Number(value.seconds) * 1000);
  }
  return null;
}

function formatDateTime(value, timezone) {
  const date = toDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

async function hashPin(pin) {
  const value = new TextEncoder().encode(String(pin));
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function statusInfo(status) {
  return STATUSES[status] || STATUSES.new;
}

function priorityInfo(priority) {
  return PRIORITIES[priority] || PRIORITIES.normal;
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="ticket-modal-bg" onMouseDown={onClose}>
      <div
        className={`ticket-modal ${wide ? "ticket-modal-wide" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ticket-modal-head">
          <div>
            <div className="ticket-kicker">GUILD QUESTIONS</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="ticket-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ticket-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className={`ticket-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Empty({ children }) {
  return <div className="ticket-empty">{children}</div>;
}

function IgnPicker({ players, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = React.useRef(null);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) =>
      normalize(a.ign || a.name).localeCompare(normalize(b.ign || b.name))
    );
  }, [players]);

  const selected = sortedPlayers.find(
    (player) => normalize(player.ign || player.name) === normalize(value)
  );
  const selectedIgn = selected ? clean(selected.ign || selected.name) : clean(value);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return sortedPlayers;
    return sortedPlayers.filter((player) =>
      normalize(player.ign || player.name).includes(q)
    );
  }, [sortedPlayers, query]);

  const visible = filtered.slice(0, 5);

  useEffect(() => {
    function handleOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function selectIgn(ign) {
    onChange(ign);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && visible.length === 1) {
      event.preventDefault();
      selectIgn(clean(visible[0].ign || visible[0].name));
    }
  }

  return (
    <div className="ticket-ign-picker" ref={rootRef}>
      <div className={`ticket-ign-control ${open ? "open" : ""}`}>
        <span className="ticket-ign-icon" aria-hidden="true">⌕</span>
        <input
          type="text"
          value={open ? query : selectedIgn}
          disabled={disabled}
          placeholder="Type or select your IGN..."
          autoComplete="off"
          required
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Your IGN"
        />
        {selectedIgn && (
          <button
            type="button"
            className="ticket-ign-clear"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            aria-label="Clear IGN"
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="ticket-ign-toggle"
          disabled={disabled}
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
          }}
          aria-label="Open registered IGN list"
        >
          ▾
        </button>
      </div>

      {open && !disabled && (
        <div className="ticket-ign-menu">
          <div className="ticket-ign-menu-head">
            <span>REGISTERED PLAYERS</span>
            <strong>{filtered.length > 5 ? `5 / ${filtered.length}` : `${filtered.length} / ${sortedPlayers.length}`}</strong>
          </div>

          <div className="ticket-ign-list">
            {visible.length ? visible.map((player) => {
              const ign = clean(player.ign || player.name);
              const isSelected = normalize(ign) === normalize(value);
              return (
                <button
                  type="button"
                  className={`ticket-ign-option ${isSelected ? "selected" : ""}`}
                  key={player.id}
                  onClick={() => selectIgn(ign)}
                >
                  <span>{ign}</span>
                  {isSelected && <b>✓</b>}
                </button>
              );
            }) : (
              <div className="ticket-ign-empty">No registered IGN matches “{query}”.</div>
            )}
          </div>

          <div className="ticket-ign-menu-foot">
            {filtered.length > 5
              ? "SHOWING FIRST 5 • TYPE MORE TO NARROW"
              : "TYPE TO SEARCH • CLICK TO SELECT • ENTER FOR ONE MATCH"}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TicketPage({ user, isAdmin }) {
  const admin = isAdminUser(user, isAdmin);
  const { resolvedTimezone } = useGlobalDisplayTimezone();

  const [players, setPlayers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [message, setMessage] = useState("");

  const [view, setView] = useState("active");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [ignFilter, setIgnFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [saving, setSaving] = useState(false);

  const [pinPrompt, setPinPrompt] = useState(null);
  const [pin, setPin] = useState("");

  const blankForm = {
    ign: "",
    category: CATEGORIES[0],
    priority: "normal",
    subject: "",
    question: "",
    pin: "",
    pinConfirm: "",
  };

  const [form, setForm] = useState(blankForm);
  const [adminForm, setAdminForm] = useState({
    status: "new",
    priority: "normal",
    answer: "",
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "cwPlayers"),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.active !== false)
          .sort((a, b) =>
            normalize(a.ign || a.name).localeCompare(normalize(b.ign || b.name))
          );
        setPlayers(next);
        setLoadingPlayers(false);
      },
      (error) => {
        console.error("Unable to load registered players:", error);
        setLoadingPlayers(false);
        setMessage(error?.message || "Unable to load the guild roster.");
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "guildTickets"),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        next.sort((a, b) => {
          const ad = toDate(a.updatedAt || a.createdAt)?.getTime() || 0;
          const bd = toDate(b.updatedAt || b.createdAt)?.getTime() || 0;
          return bd - ad;
        });
        setTickets(next);
        setLoadingTickets(false);
      },
      (error) => {
        console.error("Unable to load guild questions:", error);
        setLoadingTickets(false);
        setMessage(error?.message || "Unable to load guild questions.");
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    setPage(1);
  }, [view, search, ignFilter, priorityFilter, sort]);

  const counts = useMemo(() => {
    const count = (values) => tickets.filter((ticket) => values.includes(ticket.status)).length;
    return {
      all: tickets.length,
      active: count(["new", "pending", "investigating"]),
      new: count(["new"]),
      pending: count(["pending"]),
      investigating: count(["investigating"]),
      resolved: count(["resolved"]),
    };
  }, [tickets]);

  const visibleTickets = useMemo(() => {
    const q = normalize(search);
    const result = tickets.filter((ticket) => {
      const status = ticket.status || "new";
      if (view === "active" && status === "resolved") return false;
      if (view === "resolved" && status !== "resolved") return false;
      if (view === "new" && status !== "new") return false;
      if (view === "pending" && status !== "pending") return false;
      if (view === "investigating" && status !== "investigating") return false;
      if (ignFilter && normalize(ticket.ign) !== normalize(ignFilter)) return false;
      if (priorityFilter !== "all" && (ticket.priority || "normal") !== priorityFilter) return false;
      if (!q) return true;
      return [
        ticket.ign,
        ticket.category,
        ticket.subject,
        ticket.question,
        ticket.answer,
        ticket.createdBy,
        ticket.updatedBy,
      ].some((value) => normalize(value).includes(q));
    });

    result.sort((a, b) => {
      const ad = toDate(a.updatedAt || a.createdAt)?.getTime() || 0;
      const bd = toDate(b.updatedAt || b.createdAt)?.getTime() || 0;
      return sort === "oldest" ? ad - bd : bd - ad;
    });
    return result;
  }, [tickets, view, ignFilter, priorityFilter, search, sort]);

  const pageCount = Math.max(1, Math.ceil(visibleTickets.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedTickets = visibleTickets.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function resetForm() {
    setForm({ ...blankForm });
  }

  function openSubmit() {
    resetForm();
    setSelectedTicket(null);
    setModal("submit");
    setMessage("");
  }

  function openTicket(ticket) {
    setSelectedTicket(ticket);
    setAdminForm({
      status: ticket.status || "new",
      priority: ticket.priority || "normal",
      answer: "",
    });
    setModal("detail");
  }

  function requestPin(ticket, action) {
    setPin("");
    setPinPrompt({ ticket, action });
    setMessage("");
  }

  async function confirmPin(event) {
    event.preventDefault();
    if (!pinPrompt || saving) return;

    if (!/^\d{6}$/.test(pin)) {
      setMessage("Enter the 6-digit ticket PIN.");
      return;
    }

    setSaving(true);
    try {
      const suppliedHash = await hashPin(pin);
      if (!pinPrompt.ticket?.pinHash || suppliedHash !== pinPrompt.ticket.pinHash) {
        setMessage("Incorrect ticket PIN.");
        return;
      }

      const ticket = pinPrompt.ticket;
      const action = pinPrompt.action;
      setPinPrompt(null);

      if (action === "edit") {
        setSelectedTicket(ticket);
        setForm({
          ign: ticket.ign || "",
          category: ticket.category || CATEGORIES[0],
          priority: ticket.priority || "normal",
          subject: ticket.subject || "",
          question: ticket.question || "",
          pin: "",
          pinConfirm: "",
        });
        setModal("edit");
      }

      if (action === "delete") {
        const confirmed = window.confirm(
          `Delete this question for ${ticket.ign || "this player"}? This cannot be undone.`
        );
        if (!confirmed) return;
        await deleteDoc(doc(db, "guildTickets", ticket.id));
        setSelectedTicket(null);
        setModal(null);
        setMessage("Guild question deleted.");
      }
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Unable to verify ticket PIN.");
    } finally {
      setSaving(false);
    }
  }

  async function submitTicket(event) {
    event.preventDefault();
    if (saving) return;

    const ign = clean(form.ign);
    const subject = clean(form.subject);
    const question = clean(form.question);

    if (!ign || !subject || !question) {
      setMessage("Choose your IGN and complete the subject and question.");
      return;
    }
    if (!/^\d{6}$/.test(form.pin)) {
      setMessage("Your ticket PIN must be exactly 6 digits.");
      return;
    }
    if (form.pin !== form.pinConfirm) {
      setMessage("The two PIN entries do not match.");
      return;
    }
    if (!players.some((player) => normalize(player.ign || player.name) === normalize(ign))) {
      setMessage("Choose an IGN from the registered guild roster.");
      return;
    }

    setSaving(true);
    try {
      const pinHash = await hashPin(form.pin);
      await addDoc(collection(db, "guildTickets"), {
        ign,
        ignLower: normalize(ign),
        category: form.category,
        priority: form.priority,
        subject,
        question,
        pinHash,
        status: "new",
        answer: "",
        replies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: user?.uid || null,
        createdBy: actor(user),
      });
      setModal(null);
      resetForm();
      setMessage(`Question submitted for ${ign}. Keep your 6-digit PIN for future edits or deletion.`);
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Unable to submit guild question.");
    } finally {
      setSaving(false);
    }
  }

  async function editTicket(event) {
    event.preventDefault();
    if (!selectedTicket || saving) return;

    const subject = clean(form.subject);
    const question = clean(form.question);
    if (!subject || !question) {
      setMessage("Subject and question are required.");
      return;
    }
    if (!players.some((player) => normalize(player.ign || player.name) === normalize(form.ign))) {
      setMessage("Choose an IGN from the registered guild roster.");
      return;
    }

    if (form.pin && (!/^\d{6}$/.test(form.pin) || form.pin !== form.pinConfirm)) {
      setMessage("A replacement PIN must be exactly 6 digits and match confirmation.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        ign: clean(form.ign),
        ignLower: normalize(form.ign),
        category: form.category,
        priority: form.priority,
        subject,
        question,
        updatedAt: serverTimestamp(),
        updatedBy: actor(user),
        updatedByUid: user?.uid || null,
      };

      if (form.pin) values.pinHash = await hashPin(form.pin);

      await updateDoc(doc(db, "guildTickets", selectedTicket.id), values);
      setModal(null);
      setSelectedTicket(null);
      resetForm();
      setMessage("Guild question updated.");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Unable to update guild question.");
    } finally {
      setSaving(false);
    }
  }

  async function adminUpdateTicket(event) {
    event.preventDefault();
    if (!admin || !selectedTicket || saving) return;

    const answer = clean(adminForm.answer);
    const nextStatus = adminForm.status;
    const previousStatus = selectedTicket.status || "new";

    if (!answer && nextStatus === previousStatus && adminForm.priority === (selectedTicket.priority || "normal")) {
      setMessage("Add an answer, change the status, or change the priority.");
      return;
    }

    setSaving(true);
    try {
      const replies = Array.isArray(selectedTicket.replies) ? [...selectedTicket.replies] : [];
      if (answer) {
        replies.push({
          author: actor(user),
          authorUid: user?.uid || null,
          text: answer,
          createdAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(db, "guildTickets", selectedTicket.id), {
        status: nextStatus,
        priority: adminForm.priority,
        answer: answer || selectedTicket.answer || "",
        replies,
        updatedAt: serverTimestamp(),
        updatedBy: actor(user),
        updatedByUid: user?.uid || null,
        resolvedAt: nextStatus === "resolved" ? serverTimestamp() : null,
      });

      setAdminForm({ status: nextStatus, priority: adminForm.priority, answer: "" });
      setMessage(
        previousStatus !== nextStatus
          ? `Question moved to ${statusInfo(nextStatus).label}.`
          : answer
            ? "Admin response saved."
            : "Question updated."
      );
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Unable to update guild question.");
    } finally {
      setSaving(false);
    }
  }

  async function adminDeleteTicket(ticket) {
    if (!admin || !ticket || saving) return;
    const confirmed = window.confirm(`Delete “${ticket.subject || "Untitled question"}”?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, "guildTickets", ticket.id));
      setSelectedTicket(null);
      setModal(null);
      setMessage("Question deleted by admin.");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Unable to delete question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ticket-page">
      <section className="ticket-hero">
        <div>
          <div className="ticket-kicker">GUILD SUPPORT • QUESTIONS & ANSWERS</div>
          <h1>{admin ? "Guild Question Admin Portal" : "Guild Questions"}</h1>
          <p>
            Ask the guild administration a question, follow its status, and keep the complete answer history in one place.
          </p>
        </div>
        <button type="button" className="ticket-primary" onClick={openSubmit}>
          + SUBMIT QUESTION
        </button>
      </section>

      {message && (
        <div className="ticket-message" role="status">
          {message}
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <section className="ticket-stats">
        <Stat label="ALL QUESTIONS" value={counts.all.toLocaleString("en-US")} />
        <Stat label="NEW" value={counts.new.toLocaleString("en-US")} tone="new" />
        <Stat label="IN PROGRESS" value={(counts.pending + counts.investigating).toLocaleString("en-US")} tone="pending" />
        <Stat label="RESOLVED" value={counts.resolved.toLocaleString("en-US")} tone="resolved" />
      </section>

      <section className="ticket-board">
        <div className="ticket-board-head">
          <div>
            <div className="ticket-kicker">{admin ? "ADMIN QUEUE" : "SUPPORT QUEUE"}</div>
            <h2>{admin ? "Guild Question Admin Portal" : "Guild Questions"}</h2>
            <p>Registered IGN required. A private 6-digit PIN controls player editing and deletion.</p>
          </div>
          <div className="ticket-board-tools">
            <select value={ignFilter} onChange={(event) => setIgnFilter(event.target.value)} aria-label="Filter by IGN">
              <option value="">ALL IGNS</option>
              {players.map((player) => {
                const ign = clean(player.ign || player.name);
                return <option key={player.id} value={ign}>{ign}</option>;
              })}
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter by priority">
              <option value="all">ALL PRIORITIES</option>
              {Object.entries(PRIORITIES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort questions">
              <option value="newest">LATEST → OLDEST</option>
              <option value="oldest">OLDEST → LATEST</option>
            </select>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions..." aria-label="Search questions" />
          </div>
        </div>

        <div className="ticket-tabs">
          {[
            ["active", `ACTIVE ${counts.active}`],
            ["new", `NEW ${counts.new}`],
            ["pending", `PENDING ${counts.pending}`],
            ["investigating", `INVESTIGATING ${counts.investigating}`],
            ["resolved", `RESOLVED ${counts.resolved}`],
          ].map(([id, label]) => (
            <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="ticket-list">
          {loadingTickets ? (
            <Empty>Loading guild questions...</Empty>
          ) : !pagedTickets.length ? (
            <Empty>No questions found for this filter.</Empty>
          ) : (
            pagedTickets.map((ticket) => {
              const status = statusInfo(ticket.status || "new");
              const priority = priorityInfo(ticket.priority || "normal");
              return (
                <article className="ticket-row" key={ticket.id}>
                  <div className={`ticket-status-dot ${status.className}`} />
                  <div className="ticket-row-main">
                    <div className="ticket-row-top">
                      <span className={`ticket-status ${status.className}`}>{status.label}</span>
                      <span className="ticket-category">{ticket.category || "OTHER"}</span>
                      <span className={`ticket-priority ${priority.className}`}>{priority.label}</span>
                      <span className="ticket-time">{formatDateTime(ticket.updatedAt || ticket.createdAt, resolvedTimezone)}</span>
                    </div>
                    <h3>{ticket.subject || "Untitled question"}</h3>
                    <p>{ticket.question || "No question text."}</p>
                    <div className="ticket-meta">
                      <strong>{ticket.ign || "Unknown IGN"}</strong>
                      {ticket.updatedBy && <span>Updated by {ticket.updatedBy}</span>}
                    </div>
                  </div>
                  <div className="ticket-row-actions">
                    <button type="button" onClick={() => openTicket(ticket)}>VIEW</button>
                    {!admin && (
                      <>
                        <button type="button" onClick={() => requestPin(ticket, "edit")}>EDIT</button>
                        <button type="button" className="danger" onClick={() => requestPin(ticket, "delete")}>DELETE</button>
                      </>
                    )}
                    {admin && (
                      <button type="button" className="danger" onClick={() => adminDeleteTicket(ticket)}>DELETE</button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="ticket-pagination">
          <span>PAGE {currentPage} / {pageCount} • {visibleTickets.length} QUESTIONS</span>
          <div>
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← PREVIOUS</button>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>NEXT →</button>
          </div>
        </div>
      </section>

      <section className="ticket-rules">
        <div>
          <span className="ticket-kicker">PLAYER ACCESS</span>
          <h3>Choose your registered IGN</h3>
          <p>Questions can only be attached to an active IGN from the guild roster.</p>
        </div>
        <div>
          <span className="ticket-kicker">PIN SECURITY</span>
          <h3>Keep your 6-digit PIN</h3>
          <p>The portal asks for your PIN before a player ticket can be edited or deleted.</p>
        </div>
        <div>
          <span className="ticket-kicker">ADMIN WORKFLOW</span>
          <h3>NEW → PENDING → INVESTIGATING → RESOLVED</h3>
          <p>Administrators can answer questions, change priority, change status, and maintain the reply history.</p>
        </div>
      </section>

      {pinPrompt && (
        <Modal
          title={pinPrompt.action === "delete" ? "VERIFY PIN • DELETE QUESTION" : "VERIFY PIN • EDIT QUESTION"}
          onClose={() => setPinPrompt(null)}
        >
          <form className="ticket-form" onSubmit={confirmPin}>
            <div className="ticket-form-note">
              Enter the 6-digit PIN created when this question was submitted. The PIN is never displayed back to you.
            </div>
            <label>
              TICKET PIN
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
            </label>
            <div className="ticket-form-actions">
              <button type="button" onClick={() => setPinPrompt(null)}>CANCEL</button>
              <button type="submit" className={pinPrompt.action === "delete" ? "danger" : "primary"} disabled={saving}>
                {saving ? "VERIFYING..." : pinPrompt.action === "delete" ? "VERIFY & DELETE" : "VERIFY & EDIT"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "submit" && (
        <Modal title="SUBMIT GUILD QUESTION" onClose={() => setModal(null)} wide>
          <form className="ticket-form" onSubmit={submitTicket}>
            <div className="ticket-form-note">
              No account login is required. Select your registered IGN and create a 6-digit PIN. Save the PIN because the portal cannot recover it for you.
            </div>
            <div className="ticket-form-grid">
              <label>
                YOUR IGN
                <IgnPicker
                  players={players}
                  value={form.ign}
                  onChange={(ign) => setForm({ ...form, ign })}
                  disabled={loadingPlayers}
                />
              </label>
              <label>
                CATEGORY
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                PRIORITY
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {Object.entries(PRIORITIES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
                </select>
              </label>
              <label>
                SUBJECT
                <input value={form.subject} maxLength={120} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Short description" required />
              </label>
            </div>
            <label>
              QUESTION
              <textarea value={form.question} maxLength={4000} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="Explain what you need help with..." required rows={7} />
            </label>
            <div className="ticket-form-grid">
              <label>
                CREATE 6-DIGIT PIN
                <input inputMode="numeric" maxLength={6} value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="000000" required />
              </label>
              <label>
                CONFIRM PIN
                <input inputMode="numeric" maxLength={6} value={form.pinConfirm} onChange={(event) => setForm({ ...form, pinConfirm: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="000000" required />
              </label>
            </div>
            <div className="ticket-form-actions">
              <button type="button" onClick={() => setModal(null)}>CANCEL</button>
              <button type="submit" className="primary" disabled={saving || loadingPlayers}>{saving ? "SUBMITTING..." : "SUBMIT QUESTION"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "edit" && selectedTicket && (
        <Modal title={`EDIT QUESTION • ${selectedTicket.ign || "PLAYER"}`} onClose={() => setModal(null)} wide>
          <form className="ticket-form" onSubmit={editTicket}>
            <div className="ticket-form-note">Your PIN was verified. You may update the question and optionally replace the PIN.</div>
            <div className="ticket-form-grid">
              <label>
                YOUR IGN
                <IgnPicker
                  players={players}
                  value={form.ign}
                  onChange={(ign) => setForm({ ...form, ign })}
                  disabled={loadingPlayers}
                />
              </label>
              <label>
                CATEGORY
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                PRIORITY
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {Object.entries(PRIORITIES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
                </select>
              </label>
              <label>
                SUBJECT
                <input value={form.subject} maxLength={120} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
              </label>
            </div>
            <label>
              QUESTION
              <textarea value={form.question} maxLength={4000} onChange={(event) => setForm({ ...form, question: event.target.value })} rows={7} required />
            </label>
            <div className="ticket-form-grid">
              <label>
                REPLACE PIN <span className="muted">OPTIONAL</span>
                <input inputMode="numeric" maxLength={6} value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="Leave blank to keep current" />
              </label>
              <label>
                CONFIRM NEW PIN
                <input inputMode="numeric" maxLength={6} value={form.pinConfirm} onChange={(event) => setForm({ ...form, pinConfirm: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="Only needed when replacing" />
              </label>
            </div>
            <div className="ticket-form-actions">
              <button type="button" onClick={() => setModal(null)}>CANCEL</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? "SAVING..." : "SAVE CHANGES"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detail" && selectedTicket && (
        <Modal title="QUESTION DETAILS" onClose={() => setModal(null)} wide>
          <div className="ticket-detail-head">
            <div>
              <div className="ticket-detail-badges">
                <span className={`ticket-status ${statusInfo(selectedTicket.status || "new").className}`}>{statusInfo(selectedTicket.status || "new").label}</span>
                <span className={`ticket-priority ${priorityInfo(selectedTicket.priority || "normal").className}`}>{priorityInfo(selectedTicket.priority || "normal").label}</span>
                <span className="ticket-category">{selectedTicket.category || "OTHER"}</span>
              </div>
              <h3>{selectedTicket.subject || "Untitled question"}</h3>
              <p><strong>{selectedTicket.ign || "Unknown IGN"}</strong> • Submitted {formatDateTime(selectedTicket.createdAt, resolvedTimezone)}</p>
            </div>
          </div>

          <div className="ticket-detail-question">
            <span className="ticket-kicker">QUESTION</span>
            <p>{selectedTicket.question || "No question text."}</p>
          </div>

          {selectedTicket.answer && (
            <div className="ticket-detail-answer">
              <span className="ticket-kicker">LATEST ANSWER</span>
              <p>{selectedTicket.answer}</p>
            </div>
          )}

          <div className="ticket-replies">
            <div className="ticket-section-title">REPLY HISTORY</div>
            {Array.isArray(selectedTicket.replies) && selectedTicket.replies.length ? (
              selectedTicket.replies.map((reply, index) => (
                <div className="ticket-reply" key={`${selectedTicket.id}-reply-${index}`}>
                  <div>
                    <strong>{reply.author || "Admin"}</strong>
                    <span>{formatDateTime(reply.createdAt, resolvedTimezone)}</span>
                  </div>
                  <p>{reply.text}</p>
                </div>
              ))
            ) : (
              <Empty>No replies yet.</Empty>
            )}
          </div>

          {admin ? (
            <form className="ticket-admin-form" onSubmit={adminUpdateTicket}>
              <div className="ticket-section-title">ADMIN ACTION</div>
              <div className="ticket-form-grid">
                <label>
                  STATUS
                  <select value={adminForm.status} onChange={(event) => setAdminForm({ ...adminForm, status: event.target.value })}>
                    {Object.entries(STATUSES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
                  </select>
                </label>
                <label>
                  PRIORITY
                  <select value={adminForm.priority} onChange={(event) => setAdminForm({ ...adminForm, priority: event.target.value })}>
                    {Object.entries(PRIORITIES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
                  </select>
                </label>
              </div>
              <label>
                ANSWER / REPLY
                <textarea value={adminForm.answer} onChange={(event) => setAdminForm({ ...adminForm, answer: event.target.value })} rows={6} placeholder="Write the guild administration response..." />
              </label>
              <div className="ticket-form-actions">
                <button type="button" onClick={() => adminDeleteTicket(selectedTicket)} className="danger">DELETE</button>
                <button type="submit" className="primary" disabled={saving}>{saving ? "SAVING..." : "SAVE ADMIN UPDATE"}</button>
              </div>
            </form>
          ) : (
            <div className="ticket-form-actions">
              <button type="button" onClick={() => requestPin(selectedTicket, "edit")}>EDIT WITH PIN</button>
              <button type="button" className="danger" onClick={() => requestPin(selectedTicket, "delete")}>DELETE WITH PIN</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
