export default function Header({
  page,
  setPage,
  user,
  isAdmin,
  onLogin,
  onLogout,
}) {
  const nav = [
    ["raid", "RAID SCHEDULE"],
    ["bh", "BH ATTENDANCE"],
    ["cw", "CW ATTENDANCE"],
    ["treasury", "TREASURY"],
  ];

  if (isAdmin) {
    nav.push(["admin", "ADMIN"]);
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        {/* BRAND */}
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

        {/* NAVIGATION */}
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={
                page === id
                  ? "nav-button active"
                  : "nav-button"
              }
              onClick={() => setPage(id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* USER AREA */}
        <div className="header-user">
          {user ? (
            <>
              <span
                className={
                  isAdmin
                    ? "user-badge admin"
                    : "user-badge"
                }
              >
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