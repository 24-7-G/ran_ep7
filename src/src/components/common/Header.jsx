import { TIMEZONES } from "../../lib/constants";
import { useGlobalDisplayTimezone } from "../../lib/displayTimezone";

export default function Header({
  page,
  setPage,
  user,
  isAdmin,
  onLogin,
  onLogout,
  onAdmin,
}) {
  // Treasury is intentionally NOT a top-level page anymore.
  // It lives inside the combined Clan War module.
  const nav = [
    ["raid", "RAID SCHEDULE", "calendar"],
    ["bh", "BH ATTENDANCE", "boss"],
    ["cw", "CW ATTENDANCE", "swords"],
    ["tickets", "GUILD QUESTIONS", "question"],
  ];

  const NavIcon = ({ type }) => {
    if (type === "calendar") return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9h17M7 13h3M14 13h3M7 16.5h3"/></svg>
    );
    if (type === "boss") return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 4.1 4.6.8-3.3 3.2.7 4.5-4.2-2-4.2 2 .7-4.5-3.3-3.2 4.6-.8L12 3z"/><path d="M8 17.5h8M9.5 20h5"/></svg>
    );
    if (type === "swords") return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l6.5 6.5M19 4l-6.5 6.5M5 20l6.5-6.5M19 20l-6.5-6.5M4 4l3.5.5L20 17v3h-3L4 7.5zM20 4l-3.5.5L4 17v3h3L20 7.5z"/></svg>
    );
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 0 1 4.8 1c0 1.8-2.4 2-2.4 3.6M12 17.2h.01"/></svg>
    );
  };

  const { displayTimezone, setDisplayTimezone } = useGlobalDisplayTimezone();

  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className="brand"
          onClick={() => setPage("raid")}
          aria-label="Go to Raid Schedule"
        >
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" className="brand-logo-svg">
              <path d="M32 4 48 20 32 36 16 20 32 4Z" />
              <path d="M32 14 38 20 32 26 26 20 32 14Z" />
              <path d="M32 28 44 40 32 52 20 40 32 28Z" />
              <path d="M32 35 37 40 32 45 27 40 32 35Z" />
            </svg>
          </span>
          <span className="brand-text">
            <strong>RAN ONLINE</strong>
            <small>EP7 CLASSIC</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(([id, label, icon]) => (
            <button
              type="button"
              key={id}
              className={page === id ? "nav-button active" : "nav-button"}
              onClick={() => setPage(id)}
            >
              <span className="nav-icon"><NavIcon type={icon} /></span>
              <span className="nav-label">{label}</span>
              <span className="nav-sub">{id === "raid" ? "World Boss Timer" : id === "bh" ? "Players & Rewards" : id === "cw" ? "Castle War Records" : "Guides & Info"}</span>
            </button>
          ))}
        </nav>

        <div className="header-timezone">
          <label htmlFor="global-display-timezone"><span className="timezone-icon" aria-hidden="true">◎</span> DISPLAY TIMEZONE</label>
          <select
            id="global-display-timezone"
            value={displayTimezone}
            onChange={(event) => setDisplayTimezone(event.target.value)}
          >
            {TIMEZONES.map((timezone) => (
              <option key={timezone.value} value={timezone.value}>
                {timezone.label}
              </option>
            ))}
          </select>
        </div>

        <div className="header-user">
          {user ? (
            <>
              {isAdmin ? (
                <button type="button" className="user-badge admin user-badge-button" onClick={onAdmin} title="Open Administrator Portal">
                  <span className="user-badge-icon" aria-hidden="true">♛</span>
                  ADMIN
                </button>
              ) : (
                <span className="user-badge">
                  <span className="user-badge-icon" aria-hidden="true">♛</span>
                  USER
                </span>
              )}
              <button
                type="button"
                className="button button-small header-logout-button"
                onClick={onLogout}
              >
                <span className="logout-icon" aria-hidden="true">⇥</span>
                LOGOUT
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button-small admin-login-button"
              onClick={onLogin}
            >
              ADMIN LOGIN
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
