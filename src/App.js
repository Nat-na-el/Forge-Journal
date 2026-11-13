import useIsMobile from "./hooks/useIsMobile";
import BottomNav from "./components/ui/BottomNav";
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ThemeProvider } from "./Theme-provider";
import Sidebar from "./components/ui/Sidebar";
import Topbar from "./components/ui/Topbar";
import Dashboard from "./pages/Dashboard";
import DailyJournal from "./pages/DailyJournal";
import Trades from "./pages/Trades";
import Playbooks from "./pages/Playbooks";
import Notebook from "./pages/Notebook";
import Reports from "./pages/Reports";
import Challenges from "./pages/Challenges";
import MentorMode from "./pages/MentorMode";
import SettingsPage from "./pages/SettingsPage";
import Backtest from "./pages/Backtest";
import Replay from "./pages/Replay";
import Spaces from "./pages/Spaces";
import Pricing from "./pages/Pricing";
import AddTrade from "./components/ui/AddTrade";
import QuantitativeAnalysis from "./pages/QuantitativeAnalysis";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Landing from "./pages/Landing";
import AccountSelectionPage from "./pages/AccountSelectionPage";
import AddAccountPage from "./pages/AddAccountPage";
import CustomAccountPage from "./pages/CustomAccountPage";
import MT5ConnectPage from "./pages/MT5ConnectPage";
import { db, auth } from "./firebase";
import { clearAccountData } from "./lib/firestoreData";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

// ────────────────────────────────────────────────
// Shared look (Tradezella-style – same palette as Dashboard / Journal / Sidebar)
// ────────────────────────────────────────────────
const ACCENT = "#6C47FF";

// Read once at module load: lets the dashboard demo screen render without a
// Firebase session for local design review (also used by the Demo Data menu).
const PREVIEW_MODE =
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "production" &&
  new URLSearchParams(window.location.search).get("preview") === "1";
const MODAL_PANEL =
  "w-full rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white";
const FIELD =
  "w-full rounded-lg border border-[#e6e8f2] bg-white px-3 py-2.5 text-sm text-[#14142b] outline-none transition focus:border-[#6C47FF] focus:ring-2 focus:ring-[#6C47FF]/30 disabled:opacity-60 dark:border-[#262645] dark:bg-[#101024] dark:text-white";
const LABEL = "mb-1.5 block text-xs font-semibold text-[#6b7090] dark:text-[#8a8fb5]";
const BTN_PRIMARY =
  "rounded-lg bg-[#6C47FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50";
const BTN_GHOST =
  "rounded-lg border border-[#e6e8f2] px-4 py-2.5 text-sm font-semibold text-[#3b3f5e] transition-colors hover:bg-[#f1f2f8] disabled:opacity-50 dark:border-[#262645] dark:text-[#c9ccea] dark:hover:bg-[#1e1e3a]";

// ────────────────────────────────────────────────
// EditBalancePNL – now includes leverage
// ────────────────────────────────────────────────
function EditBalancePNL({ onSaved }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", startingBalance: 10000, leverage: 100 });
  const [isNewAccount, setIsNewAccount] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    if (location.state?.accountId) {
      setIsNewAccount(false);
      const loadAccount = async () => {
        const accountRef = doc(db, "users", user.uid, "accounts", location.state.accountId);
        const accountSnap = await getDoc(accountRef);
        if (accountSnap.exists()) {
          const data = accountSnap.data();
          setForm({
            name: data.name,
            startingBalance: data.starting_balance || 10000,
            leverage: data.leverage || 100,
          });
        }
      };
      loadAccount();
    } else {
      setIsNewAccount(true);
      setForm({
        name: `Account ${Date.now().toString().slice(-4)}`,
        startingBalance: 10000,
        leverage: 100,
      });
    }
  }, [location, navigate]);

  const saveAccount = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const user = auth.currentUser;
    if (!user) {
      alert("Not logged in");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isNewAccount) {
        const accountRef = await addDoc(collection(db, "users", user.uid, "accounts"), {
          name: form.name.trim(),
          starting_balance: Number(form.startingBalance),
          current_balance: Number(form.startingBalance),
          leverage: Number(form.leverage) || 100,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        localStorage.setItem("currentAccountId", accountRef.id);
        navigate("/dashboard", { replace: true });
      } else {
        const accountRef = doc(db, "users", user.uid, "accounts", location.state.accountId);
        await updateDoc(accountRef, {
          name: form.name.trim(),
          starting_balance: Number(form.startingBalance),
          leverage: Number(form.leverage) || 100,
        });
        navigate("/dashboard", { replace: true });
      }
      if (onSaved) onSaved();
    } catch (err) {
      console.error("Account save error:", err);
      alert("Error saving account: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={`${MODAL_PANEL} max-w-md p-6`}>
        <h3 className="mb-6 text-lg font-bold">
          {isNewAccount ? "Create new account" : "Edit account"}
        </h3>
        <form onSubmit={saveAccount} className="space-y-5">
          <div>
            <label className={LABEL}>
              Account Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={FIELD}
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className={LABEL}>
              Starting Balance ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.startingBalance}
              onChange={(e) => setForm({ ...form, startingBalance: Number(e.target.value) })}
              className={FIELD}
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className={LABEL}>
              Leverage (e.g., 100 for 100:1)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={form.leverage}
              onChange={(e) => setForm({ ...form, leverage: Number(e.target.value) })}
              className={FIELD}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate("/dashboard", { replace: true })}
              className={BTN_GHOST}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={BTN_PRIMARY}
            >
              {isSubmitting ? "Saving..." : isNewAccount ? "Create Account" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Main AppContent
// ────────────────────────────────────────────────
function AppContent() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(() => window.innerWidth >= 768);

  // Close the drawer when switching to a phone-sized screen
  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (PREVIEW_MODE) {
        const demo = { id: "demo", name: "Demo Account", currency: "USD", starting_balance: 10000 };
        setAccounts([demo]);
        setCurrentAccount(demo);
        setLoading(false);
        return;
      }
      if (user) {
        loadAccounts(user);
      } else {
        setAccounts([]);
        setCurrentAccount(null);
        setLoading(false);
        if (!["/", "/login", "/register"].includes(location.pathname)) {
          navigate("/login", { replace: true });
        }
      }
    });
    return unsubscribe;
  }, [location.pathname, navigate]);

  const loadAccounts = async (user) => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "users", user.uid, "accounts"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      let loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // MetaTrader users get their account created by the sync, not a blank default
      if (loaded.length === 0 && !user.uid.startsWith("mt5_")) {
        const defaultData = {
          name: "Main Account",
          starting_balance: 10000,
          current_balance: 10000,
          leverage: 100,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        };
        const ref = await addDoc(
          collection(db, "users", user.uid, "accounts"),
          defaultData
        );
        loaded = [{ id: ref.id, ...defaultData }];
      }

      setAccounts(loaded);

      const savedId = localStorage.getItem("currentAccountId");
      let selected = loaded.find(a => a.id === savedId);
      if (!selected && loaded.length > 0) {
        selected = loaded[0];
        localStorage.setItem("currentAccountId", selected.id);
      }
      setCurrentAccount(selected);
    } catch (err) {
      console.error("Load accounts error:", err);
    } finally {
      setLoading(false);
    }
  };

  // The Add Trade workflow creates/link accounts on its own pages. When it
  // finishes it fires this event so the shell refreshes the account switcher
  // without a full reload or a loading flash.
  useEffect(() => {
    const refresh = async () => {
      const user = auth.currentUser;
      if (!user || PREVIEW_MODE) return;
      try {
        const snapshot = await getDocs(
          query(collection(db, "users", user.uid, "accounts"), orderBy("createdAt", "desc"))
        );
        const loaded = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setAccounts(loaded);
        const savedId = localStorage.getItem("currentAccountId");
        const selected = loaded.find((a) => a.id === savedId) || loaded[0] || null;
        setCurrentAccount(selected);
      } catch (err) {
        console.error("Refresh accounts error:", err);
      }
    };
    window.addEventListener("forgex:accounts-changed", refresh);
    return () => window.removeEventListener("forgex:accounts-changed", refresh);
  }, []);

  const switchAccount = (accountId) => {
    localStorage.setItem("currentAccountId", accountId);
    const acc = accounts.find(a => a.id === accountId);
    if (acc) setCurrentAccount(acc);
    navigate("/dashboard", { replace: true });
  };

  const deleteAccount = async (accountId) => {
    if (!window.confirm("Delete this account? All data will be lost!")) return false;
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await deleteDoc(doc(db, "users", user.uid, "accounts", accountId));
      const updated = accounts.filter(a => a.id !== accountId);
      setAccounts(updated);

      if (currentAccount?.id === accountId) {
        const next = updated[0] || null;
        if (next) localStorage.setItem("currentAccountId", next.id);
        else localStorage.removeItem("currentAccountId");
        setCurrentAccount(next);
      }
      return true;
    } catch (err) {
      console.error("Delete account error:", err);
      return false;
    }
  };

  const resetAccount = async (accountId) => {
    if (!window.confirm("Reset all trades/notes/journals for this account?")) return false;
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await clearAccountData(user.uid, accountId);

      await updateDoc(doc(db, "users", user.uid, "accounts", accountId), {
        current_balance: accounts.find(a => a.id === accountId)?.starting_balance || 10000,
      });

      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, current_balance: a.starting_balance || 10000 } : a
      );
      setAccounts(updated);
      return true;
    } catch (err) {
      console.error("Reset account error:", err);
      return false;
    }
  };

  const renameAccount = async (accountId, newName) => {
    const user = auth.currentUser;
    if (!user || !newName.trim()) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "accounts", accountId), {
        name: newName.trim(),
      });
      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, name: newName.trim() } : a
      );
      setAccounts(updated);
      if (currentAccount?.id === accountId) {
        setCurrentAccount({ ...currentAccount, name: newName.trim() });
      }
    } catch (err) {
      console.error("Rename error:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[#f4f5fa] dark:bg-[#0b0b19]">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
          style={{ borderTopColor: ACCENT }}
        />
        <p className="text-sm font-medium text-[#6b7090] dark:text-[#8a8fb5]">
          Loading your accounts…
        </p>
      </div>
    );
  }

  const isLoggedIn = !!auth.currentUser || PREVIEW_MODE;

  // Sidebar is flush with the left edge: 12rem open, 4rem collapsed (drawer on phones)
  const sidebarWidth = isMobile ? "0rem" : open ? "12rem" : "4rem";

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5fa] text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7]">
      {isLoggedIn ? (
        <>
          <Topbar
            onMenuClick={() => setOpen((o) => !o)}
            sidebarOpen={open}
            currentAccount={currentAccount}
          />
          <div className="flex flex-1 pt-14">
            <Sidebar
              open={open}
              setOpen={setOpen}
              accounts={accounts}
              currentAccount={currentAccount}
              onSwitchAccount={switchAccount}
            />
            <div
              className="min-w-0 flex-1 transition-[margin,max-width] duration-300"
              style={{
                marginLeft: sidebarWidth,
                maxWidth: `calc(100vw - ${sidebarWidth})`,
              }}
            >
              <main
                className="relative overflow-y-auto overflow-x-hidden"
                style={{ height: "calc(100dvh - 3.5rem)" }}
              >
                <div
                  className="mx-0 mb-0 border-none bg-transparent p-1 sm:mx-2 sm:p-3"
                  style={{
                    minHeight: "calc(100dvh - 3.5rem)",
                    paddingBottom: isMobile ? "calc(4.5rem + env(safe-area-inset-bottom))" : undefined,
                  }}
                >
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard currentAccount={currentAccount} />} />
                    <Route path="/journal" element={<DailyJournal currentAccount={currentAccount} />} />
                    <Route path="/trades" element={<Trades currentAccount={currentAccount} />} />
                    <Route path="/playbooks" element={<Playbooks currentAccount={currentAccount} />} />
                    <Route path="/notebook" element={<Notebook currentAccount={currentAccount} />} />
                    <Route path="/reports" element={<Reports currentAccount={currentAccount} />} />
                    <Route path="/challenges" element={<Challenges currentAccount={currentAccount} />} />
                    <Route path="/mentor" element={<MentorMode currentAccount={currentAccount} />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/backtest" element={<Backtest currentAccount={currentAccount} />} />
                    <Route path="/replay" element={<Replay currentAccount={currentAccount} />} />
                    <Route path="/spaces" element={<Spaces currentAccount={currentAccount} />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/quantitative-analysis" element={<QuantitativeAnalysis />} />
                    <Route path="/edit-balance-pnl" element={<EditBalancePNL />} />
                    <Route path="/trades/new" element={<AddTrade currentAccount={currentAccount} />} />
                    <Route path="/add-trade" element={<AccountSelectionPage onDeleteAccount={deleteAccount} onResetAccount={resetAccount} onRenameAccount={renameAccount} />} />
                    <Route path="/add-trade/add-account" element={<AddAccountPage />} />
                    <Route path="/add-trade/custom-account" element={<CustomAccountPage />} />
                    <Route path="/add-trade/mt5" element={<MT5ConnectPage />} />
                    <Route path="*" element={<Dashboard currentAccount={currentAccount} />} />
                  </Routes>
                </div>
              </main>
            </div>

            {isMobile && <BottomNav onMenuClick={() => setOpen((o) => !o)} />}

          </div>
        </>
      ) : (
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}
