import React, { useState } from 'react';
import { Sun, Moon, Settings, LogOut, Menu } from 'lucide-react';
import { Button } from './button';
import { useTheme } from '../../Theme-provider';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';
import { auth } from '../../firebase';

export default function Topbar({ onMenuClick }) {
  const { theme, setTheme } = useTheme();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const navigate = useNavigate();

  // Get current account name safely (from localStorage – you can remove if fully migrating accounts)
  const currentId = localStorage.getItem('currentAccountId');
  const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
  const currentAccount = accounts.find((acc) => acc.id === currentId);
  const accountName = currentAccount ? currentAccount.name : 'Guest';

  const handleLogoutConfirm = async () => {
    setShowLogoutDialog(false);
    try {
      await auth.signOut(); // Firebase sign out → triggers onAuthStateChanged in App.js → redirects to Landing
    } catch (error) {
      console.error("Logout error:", error);
      // Optional: show error toast/notification
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  return (
    <>
      <header
        className={`
          fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-50 h-14 sm:h-16 flex items-center justify-between 
          px-2 sm:px-6 
          bg-white/90 dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-800 
          backdrop-blur-xl shadow-[0_4px_12px_rgba(75,94,170,0.3)] 
          border border-gray-200/40 dark:border-gray-400/20 
          rounded-2xl transition-all duration-300
        `}
      >
        {/* Left side – menu button (phones) + Forgex branding */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-md hover:bg-gray-200/70 dark:hover:bg-indigo-600/30 min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
          </button>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center font-bold text-white text-sm sm:text-base">
            F
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">FORGEX</div>
            <div className="text-xs text-gray-500 dark:text-gray-300 -mt-0.5">
              Trading Dashboard
            </div>
          </div>
        </div>

        {/* Right side – buttons & account */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Account name */}
          <div className="hidden sm:flex text-sm font-medium text-gray-700 dark:text-gray-300 px-3 py-1.5 bg-gray-100/70 dark:bg-gray-800/50 rounded-md">
            {accountName}
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`
              p-2 rounded-md transition-all duration-200
              hover:bg-gray-200/70 dark:hover:bg-indigo-600/30
              active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500/40
              min-w-[40px] min-h-[40px] flex items-center justify-center
            `}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 text-yellow-400" />
            ) : (
              <Moon className="h-5 w-5 text-indigo-700" />
            )}
          </button>

          {/* Settings button */}
          <Button
            onClick={handleSettingsClick}
            variant="outline"
            className={`
              border-gray-300 dark:border-gray-600
              hover:bg-gray-100 dark:hover:bg-gray-700
              text-gray-800 dark:text-gray-200
              text-sm sm:text-base
              px-2 sm:px-4 min-w-[40px] sm:min-w-[120px]
            `}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Settings</span>
          </Button>

          {/* Logout */}
          <Button
            variant="destructive"
            onClick={() => setShowLogoutDialog(true)}
            className="text-sm sm:text-base px-2 sm:px-4 min-w-[40px] sm:min-w-[120px]"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="max-w-md bg-white text-slate-900 dark:bg-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle>Confirm Logout – Forgex</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to log out?
            </p>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              className="border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLogoutConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Yes, Log Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
