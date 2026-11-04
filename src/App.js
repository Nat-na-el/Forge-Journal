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
import Notebook from "./pages/Notebook";
import Reports from "./pages/Reports";
import Challenges from "./pages/Challenges";
import MentorMode from "./pages/MentorMode";
import SettingsPage from "./pages/SettingsPage";
import Backtest from "./pages/Backtest";
import AddTrade from "./components/ui/AddTrade";
import QuantitativeAnalysis from "./pages/QuantitativeAnalysis";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Landing from "./pages/Landing";
import { db, auth } from "./firebase";
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
// ManageAccountsModal – unchanged
// ────────────────────────────────────────────────
function ManageAccountsModal({
  accounts,
  onClose,
  onDeleteAccount,
  onResetAccount,
  onRenameAccount,
  onCreateAccount,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const deleteAccount = (accountId) => {
    if (!window.confirm("Delete this account? All data will be lost!")) return;
    onDeleteAccount(accountId);
  };

  const resetAccount = (accountId) => {
    if (!window.confirm("Reset all trades/notes/journals for this account?")) return;
    onResetAccount(accountId);
  };

  if (accounts.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            Manage Accounts – Forgex
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="space-y-3 mb-4">
          {accounts.map((account) => (
            <div key={account.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {editingId === account.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 p-1 border rounded dark:bg-gray-600"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          onRenameAccount(account.id, editName || account.name);
                          setEditingId(null);
                          setEditName("");
                        }}
                        className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">
                          {account.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium block">{account.name}</span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                          <div>${Number(account.starting_balance || 0).toLocaleString()} start</div>
                          <div>Created: {account.createdAt?.toDate?.()?.toLocaleDateString() || "—"}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => {
                      setEditingId(account.id);
                      setEditName(account.name);
                    }}
                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => resetAccount(account.id)}
                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                  >
                    🔄
                  </button>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => deleteAccount(account.id)}
                      className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onCreateAccount}
          className="w-full p-2 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm"
        >
          + Create New Account
        </button>
      </div>
    </div>
  );
}

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-md">
        <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          {isNewAccount ? "Create New Account – Forgex" : "Edit Account"}
        </h3>
        <form onSubmit={saveAccount} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full p-3 rounded-lg border bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Starting Balance ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.startingBalance}
              onChange={(e) => setForm({ ...form, startingBalance: Number(e.target.value) })}
              className="w-full p-3 rounded-lg border bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Leverage (e.g., 100 for 100:1)
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={form.leverage}
              onChange={(e) => setForm({ ...form, leverage: Number(e.target.value) })}
              className="w-full p-3 rounded-lg border bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate("/dashboard", { replace: true })}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
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
  const [showManageModal, setShowManageModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
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

      if (loaded.length === 0) {
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

  const createAccount = () => {
    navigate("/edit-balance-pnl");
  };

  const switchAccount = (accountId) => {
    localStorage.setItem("currentAccountId", accountId);
    const acc = accounts.find(a => a.id === accountId);
    if (acc) setCurrentAccount(acc);
    navigate("/dashboard", { replace: true });
  };

  const deleteAccount = async (accountId) => {
    if (!window.confirm("Delete this account? All data will be lost!")) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "accounts", accountId));
      const updated = accounts.filter(a => a.id !== accountId);
      setAccounts(updated);

      if (currentAccount?.id === accountId || updated.length === 0) {
        localStorage.removeItem("currentAccountId");
        setCurrentAccount(null);
        navigate("/dashboard", { replace: true });
      } else {
        switchAccount(updated[0].id);
      }
    } catch (err) {
      console.error("Delete account error:", err);
    }
  };

  const resetAccount = async (accountId) => {
    if (!window.confirm("Reset all trades/notes/journals for this account?")) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const subCollections = ["trades", "journals", "notes"];
      for (const sub of subCollections) {
        const subSnap = await getDocs(collection(db, "users", user.uid, "accounts", accountId, sub));
        subSnap.forEach(async (d) => await deleteDoc(d.ref));
      }

      await updateDoc(doc(db, "users", user.uid, "accounts", accountId), {
        current_balance: accounts.find(a => a.id === accountId)?.starting_balance || 10000,
      });

      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, current_balance: a.starting_balance || 10000 } : a
      );
      setAccounts(updated);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Reset account error:", err);
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
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Rename error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-indigo-500"></div>
        <p className="ml-4 text-xl text-gray-300">Loading your accounts...</p>
      </div>
    );
  }

  const isLoggedIn = !!auth.currentUser;

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-100">
      {isLoggedIn ? (
        <>
          <div className="fixed top-0 left-0 right-0 h-12 z-50">
            <Topbar onMenuClick={() => setOpen((o) => !o)} />
          </div>
          <div className="flex flex-1 pt-12">
            <Sidebar
              open={open}
              setOpen={setOpen}
              accounts={accounts}
              currentAccount={currentAccount}
              onSwitchAccount={switchAccount}
              onCreateAccount={createAccount}
              onShowManage={() => setShowManageModal(true)}
            />
            <div
              className="flex-1 min-w-0 transition-all duration-300"
              style={
                isMobile
                  ? { marginLeft: 0, maxWidth: "100vw" }
                  : {
                      marginLeft: open ? "calc(12rem + 8px)" : "calc(6rem + 8px)",
                      maxWidth: open
                        ? "calc(100vw - 12rem - 8px)"
                        : "calc(100vw - 6rem - 8px)",
                    }
              }
            >
              <main
                className="overflow-y-auto overflow-x-hidden relative"
                style={{
                  height: "calc(100dvh - 3rem)",
                  paddingTop: "1.5rem",
                }}
              >
                <div
                  className="bg-transparent border-none p-1 sm:p-3 mx-0 sm:mx-2 mb-0"
                  style={{
                    minHeight: "calc(100dvh - 4.5rem)",
                    paddingBottom: isMobile ? "calc(4.5rem + env(safe-area-inset-bottom))" : undefined,
                  }}
                >
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard currentAccount={currentAccount} />} />
                    <Route path="/journal" element={<DailyJournal currentAccount={currentAccount} />} />
                    <Route path="/trades" element={<Trades currentAccount={currentAccount} />} />
                    <Route path="/notebook" element={<Notebook currentAccount={currentAccount} />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/challenges" element={<Challenges />} />
                    <Route path="/mentor" element={<MentorMode />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/backtest" element={<Backtest currentAccount={currentAccount} />} />
                    <Route path="/quantitative-analysis" element={<QuantitativeAnalysis />} />
                    <Route path="/edit-balance-pnl" element={<EditBalancePNL />} />
                    <Route path="/trades/new" element={<AddTrade />} />
                    <Route path="*" element={<Dashboard currentAccount={currentAccount} />} />
                  </Routes>
                </div>
              </main>
            </div>

            {isMobile && <BottomNav onMenuClick={() => setOpen((o) => !o)} />}

            {showManageModal && (
              <ManageAccountsModal
                accounts={accounts}
                onClose={() => setShowManageModal(false)}
                onDeleteAccount={deleteAccount}
                onResetAccount={resetAccount}
                onRenameAccount={renameAccount}
                onCreateAccount={createAccount}
              />
            )}
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
