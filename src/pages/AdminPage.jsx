import { ADMIN_UID } from "../lib/constants";
export default function AdminPage({user}) {
  return <div className="page"><section className="page-heading"><div><div className="page-kicker">CONTROL PANEL</div><h1>Admin</h1><p>Authenticated administrator controls.</p></div></section><section className="section-card"><h2>Administrator</h2><div className="admin-info"><span>UID</span><code>{user?.uid}</code></div><div className="admin-info"><span>Expected Admin UID</span><code>{ADMIN_UID}</code></div></section></div>;
}