import { TIMEZONES } from "../../lib/constants";
import { useGlobalDisplayTimezone } from "../../lib/displayTimezone";
import ranVIcon from "../../assets/ran-v-icon.png";

export default function Header({
  page,
  setPage,
  user,
  isAdmin,
  onLogin,
  onLogout,
  onAdmin,
  onGuide,
}) {
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
            <img src={ranVIcon} className="brand-logo-image" alt="" />
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
              <span className="nav-sub">
                {id === "raid" ? "World Boss Timer" : id === "bh" ? "Players & Rewards" : id === "cw" ? "Castle War Records" : "Guides & Info"}
              </span>
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
              <option key={timezone.value} value={timezone.value}>{timezone.label}</option>
            ))}
          </select>
        </div>

        <div className="header-user">
          <button
            type="button"
            className="button button-small guide-button"
            onClick={onGuide}
            title={isAdmin ? "Open the Administrator Step-by-Step Manual" : "Open the User Step-by-Step Manual"}
            aria-label={isAdmin ? "Open administrator step-by-step manual" : "Open user step-by-step manual"}
          >
            <span aria-hidden="true">?</span> GUIDE
          </button>

          {user ? (
            <>
              {isAdmin ? (
                <button type="button" className="user-badge admin user-badge-button" onClick={onAdmin} title="Open Administrator Portal">
                  <img src={ranVIcon} className="role-v-icon" alt="" aria-hidden="true" />
                  ADMIN
                </button>
              ) : (
                <span className="user-badge">
                  <img src={ranVIcon} className="role-v-icon" alt="" aria-hidden="true" />
                  USER
                </span>
              )}
              <button type="button" className="button button-small header-logout-button" onClick={onLogout}>
                <span className="logout-icon" aria-hidden="true">⇥</span> LOGOUT
              </button>
            </>
          ) : (
            <button type="button" className="button button-small admin-login-button" onClick={onLogin}>
              ADMIN LOGIN
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
