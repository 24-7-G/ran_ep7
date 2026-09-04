import { TIMEZONES } from "../lib/constants";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";

export default function Header({
  page,
  setPage,
  user,
  isAdmin,
  onLogin,
  onLogout,
}) {
  // Treasury is intentionally NOT a top-level page anymore.
  // It lives inside the combined Clan War module.
  const nav = [
    ["raid", "RAID SCHEDULE"],
    ["bh", "BH ATTENDANCE"],
    ["cw", "CW ATTENDANCE"],
    ["tickets", "GUILD QUESTIONS"],
  ];

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
          <span className="brand-mark">24/7`G</span>
          <span className="brand-text">
            <strong>RAN ONLINE</strong>
            <small>EP7 CLASSIC</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={page === id ? "nav-button active" : "nav-button"}
              onClick={() => setPage(id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="header-timezone">
          <label htmlFor="global-display-timezone">DISPLAY TIMEZONE</label>
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
              <span className={isAdmin ? "user-badge admin" : "user-badge"}>
                {isAdmin ? "ADMIN" : "USER"}
              </span>
              <button
                type="button"
                className="button button-small"
                onClick={onLogout}
              >
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
