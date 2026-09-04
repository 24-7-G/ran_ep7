import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { ADMIN_UID } from "./lib/constants";
import Header from "./components/Header";
import Modal from "./components/Modal";
import RaidPage from "./pages/RaidPage";
import BHPage from "./pages/BHPage";
import CWPage from "./pages/CWPage";
import TreasuryPage from "./pages/TreasuryPage";
import { DisplayTimezoneProvider } from "./lib/displayTimezone";

export default function App() {
  const [page, setPage] = useState("raid");
  const [user, setUser] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const isAdmin = user?.uid === ADMIN_UID;

  async function login(e) {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setLoginOpen(false);
      setPassword("");
    } catch (err) {
      setError(err?.message || "Login failed.");
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <DisplayTimezoneProvider>
      <Header {...{page,setPage,user,isAdmin}} onLogin={() => setLoginOpen(true)} onLogout={logout} />
      <main className="app-main">
        {page === "raid" && <RaidPage user={user} isAdmin={isAdmin} />}
        {page === "bh" && <BHPage user={user} isAdmin={isAdmin} />}
        {page === "cw" && <CWPage user={user} isAdmin={isAdmin} />}
        {page === "treasury" && <TreasuryPage user={user} isAdmin={isAdmin} />}
      </main>

      <Modal open={loginOpen} title="ADMIN LOGIN" onClose={() => setLoginOpen(false)}>
        <form className="form-stack" onSubmit={login}>
          <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="button primary" type="submit">SIGN IN</button>
        </form>
      </Modal>
    </DisplayTimezoneProvider>
  );
}