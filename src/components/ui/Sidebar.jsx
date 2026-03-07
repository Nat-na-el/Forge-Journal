import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  Home,
  BookOpen,
  Activity,
  FileText,
  BarChart3,
  Trophy,
  Users,
  Settings,
  Calculator,
  ChevronDown,
  ChevronUp,
  Plug,
} from "lucide-react";
import { useTheme } from "../../Theme-provider";
import { db, auth } from "../../firebase";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import ConnectMT5Modal from "./ConnectMT5Modal";

export default function Sidebar({
  open,
  setOpen,
  accounts = [],
  currentAccount,
  onSwitchAccount,
  onCreateAccount,
  onShowManage,
}) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountLeverage, setNewAccountLeverage] = useState("100");
  const [createError, setCreateError] = useState("");
  const [connectSuccess, setConnectSuccess] = useState(false);
  const hasAutoCreated = useRef(false);

  // ─── Automatically create a default account if none exist ─────────
  useEffect(() => {
    const createDefaultAccount = async () => {
      const user = auth.currentUser;
      if (!user || accounts.length > 0 || hasAutoCreated.current) return;
      hasAutoCreated.current = true;
      try {
        const defaultAccount = {
          name: "Main Account",
          starting_balance: 10000,
          current_balance: 10000,
          leverage: 100,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        };
        const docRef = await addDoc(
          collection(db, "users", user.uid, "accounts"),
          defaultAccount
        );
        const newAccount = { id: docRef.id, ...defaultAccount };
        onCreateAccount(newAccount);
        onSwitchAccount(docRef.id);
      } catch (error) {
        console.error("Error creating default account:", error);
      }
    };
    createDefaultAccount();
  }, [accounts, onCreateAccount, onSwitchAccount]);

  const toggleSidebar = () => {
    setOpen((prev) => !prev);
    setIsAccountDropdownOpen(false);
  };

  const toggleAccountDropdown = () => {
    if (open) {
      setIsAccountDropdownOpen(!isAccountDropdownOpen);
    }
  };

  // ─── Create new account from modal ────────────────────────────────
  const handleCreateAccount = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to create an account.");
      return;
    }

    const name = newAccountName.trim();
    if (!name) {
      setCreateError("Account name is required.");
      return;
    }

    const balance = parseFloat(newAccountBalance);
    if (isNaN(balance) || balance <= 0) {
      setCreateError("Starting balance must be a positive number.");
      return;
    }

    const leverage = parseFloat(newAccountLeverage);
    if (isNaN(leverage) || leverage < 1) {
      setCreateError("Leverage must be a positive number (at least 1).");
      return;
    }

    try {
      const accountData = {
        name,
        starting_balance: balance,
        current_balance: balance,
        leverage,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };

      const docRef = await addDoc(
        collection(db, "users", user.uid, "accounts"),
        accountData
      );

      const newAccount = { id: docRef.id, ...accountData };
      onCreateAccount(newAccount);
      onSwitchAccount(docRef.id);

      // Reset and close modal
      setNewAccountName("");
      setNewAccountBalance("");
      setNewAccountLeverage("100");
      setCreateError("");
      setShowCreateModal(false);
      setIsAccountDropdownOpen(false);
    } catch (error) {
      console.error("Error creating account:", error);
      setCreateError("Failed to create account. Please try again.");
    }
  };

  const navItems = [
    { to: "/", icon: Home, label: "Dashboard" },
    { to: "/journal", icon: BookOpen, label: "Daily Journal" },
    { to: "/trades", icon: Activity, label: "Trades" },
    { to: "/notebook", icon: FileText, label: "Notebook" },
    { to: "/reports", icon: BarChart3, label: "Reports" },
    { to: "/challenges", icon: Trophy, label: "Challenges" },
    { to: "/mentor", icon: Users, label: "Mentor Mode" },
    { to: "/settings", icon: Settings, label: "Settings" },
    { to: "/backtest", icon: Calculator, label: "Backtest" },
  ];

  return (
    <>
      <div
        className={`fixed left-8 top-20 h-[calc(100vh-2.5rem)]
          bg-amber-50 dark:bg-gray-900
          border-r border-amber-200/80 dark:border-gray-800
          shadow-2xl transition-all duration-300 z-[1000] ${
            open ? "w-48" : "w-16"
          } ${theme === "dark" ? "dark" : ""}`}
        style={{
          minWidth: open ? "12rem" : "4rem",
          boxShadow: "4px 0 10px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-end p-3 pt-2">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all duration-300 flex items-center justify-center"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
          {/* ACCOUNT SECTION */}
          <div className="p-3 border-b border-amber-200/80 dark:border-gray-700">
            <div
              className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                open ? "justify-between" : "justify-center"
              }`}
              onClick={toggleAccountDropdown}
            >
              <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {currentAccount?.name?.charAt(0) || "A"}
                </span>
              </div>
              {open && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-200 flex items-center gap-1">
                      {currentAccount?.name || "Account"}
                      {currentAccount?.mt5Connected && (
                        <span className="text-xs text-green-400" title="MT5 Connected">🔌</span>
                      )}
                    </div>
                    {currentAccount?.starting_balance && (
                      <div className="text-[10px] text-gray-400">
                        ${currentAccount.starting_balance.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    {isAccountDropdownOpen ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </div>
                </>
              )}
            </div>
            {/* ACCOUNT DROPDOWN */}
            {open && isAccountDropdownOpen && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {accounts.length === 0 ? (
                  <div className="text-center p-2 text-xs text-gray-500">
                    No accounts yet
                  </div>
                ) : (
                  accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => {
                        onSwitchAccount(account.id);
                        setIsAccountDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded text-xs font-normal flex justify-between items-center ${
                        currentAccount?.id === account.id
                          ? "bg-gray-700 text-white border-l-2 border-gray-300"
                          : "text-gray-400 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {account.name}
                        {account.mt5Connected && (
                          <span className="text-xs text-green-400" title="MT5 Connected">🔌</span>
                        )}
                      </span>
                      {account.starting_balance && (
                        <span className="text-[10px] text-gray-500">
                          ${account.starting_balance.toLocaleString()}
                        </span>
                      )}
                    </button>
                  ))
                )}
                <div className="pt-2 border-t border-gray-600 space-y-1">
                  <button
                    onClick={() => {
                      setShowCreateModal(true);
                      setIsAccountDropdownOpen(false);
                    }}
                    className="w-full p-2 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded"
                  >
                    + New Account
                  </button>
                  <button
                    onClick={() => {
                      onShowManage();
                      setIsAccountDropdownOpen(false);
                    }}
                    className="w-full p-2 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded"
                  >
                    Manage Accounts
                  </button>
                  
                  {/* Connect MT5 Button - Only show if an account is selected */}
                  {currentAccount && (
                    <button
                      onClick={() => {
                        setShowConnectModal(true);
                        setIsAccountDropdownOpen(false);
                      }}
                      className="w-full p-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center gap-1 mt-2"
                    >
                      <Plug size={12} />
                      {currentAccount.mt5Connected ? 'Update MT5 Connection' : 'Connect MT5'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* NAVIGATION ITEMS */}
          <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
            {navItems.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-lg text-sm transition-all duration-300 ${
                    isActive
                      ? "bg-gray-700 text-white shadow-inner"
                      : "text-gray-400 hover:bg-gray-700 hover:text-white"
                  } ${
                    open ? "justify-start pl-3" : "justify-center items-center"
                  }`.trim()
                }
                style={{
                  marginBottom: index < navItems.length - 1 ? "2px" : "0",
                  minHeight: "48px",
                }}
              >
                <item.icon
                  size={open ? 20 : 24}
                  className={`flex-shrink-0 ${open ? "mr-3" : "mx-auto"}`}
                />
                {open && (
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis font-medium">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      
      {/* CREATE ACCOUNT MODAL (dark themed) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-100 mb-4">Create New Account</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Account Name</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g. Live EURUSD, Demo NAS100"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Starting Balance (USD)</label>
                  <input
                    type="number"
                    value={newAccountBalance}
                    onChange={(e) => setNewAccountBalance(e.target.value)}
                    placeholder="10000"
                    min="0.01"
                    step="0.01"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Leverage (e.g., 100)</label>
                  <input
                    type="number"
                    value={newAccountLeverage}
                    onChange={(e) => setNewAccountLeverage(e.target.value)}
                    placeholder="100"
                    min="1"
                    step="1"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {createError && (
                  <div className="text-sm text-rose-400">{createError}</div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewAccountName("");
                    setNewAccountBalance("");
                    setNewAccountLeverage("100");
                    setCreateError("");
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECT MT5 MODAL */}
      {showConnectModal && currentAccount && (
        <ConnectMT5Modal
          isOpen={showConnectModal}
          onClose={(success) => {
            setShowConnectModal(false);
            if (success) {
              setConnectSuccess(true);
              setTimeout(() => setConnectSuccess(false), 3000);
              // Refresh current account data
              if (onSwitchAccount) {
                onSwitchAccount(currentAccount.id);
              }
            }
          }}
          account={currentAccount}
        />
      )}

      {/* Success Toast */}
      {connectSuccess && (
        <div className="fixed bottom-4 right-4 z-[2000] bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in-up">
          MT5 connected successfully!
        </div>
      )}
    </>
  );
}
