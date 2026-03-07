// src/components/ui/ConnectMT5Modal.jsx
import React, { useState } from 'react';
import { X, AlertCircle, Check, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';

export default function ConnectMT5Modal({ isOpen, onClose, account }) {
  const [form, setForm] = useState({
    server: '',
    login: '',
    password: ''
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setConnecting(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      // Test connection to MT5 via your Fly.io backend
      const testResponse = await fetch('https://mt-nodejs.fly.dev/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: form.server,
          login: form.login,
          password: form.password
        })
      });

      if (!testResponse.ok) {
        throw new Error('Invalid MT5 credentials');
      }

      // Save credentials to Firestore (in production, encrypt these!)
      const accountRef = doc(db, 'users', user.uid, 'accounts', account.id);
      await updateDoc(accountRef, {
        mt5Server: form.server,
        mt5Login: form.login,
        mt5Password: form.password,
        mt5Connected: true,
        mt5ConnectedAt: new Date().toISOString()
      });

      setSuccess('MT5 account connected successfully!');
      setTimeout(() => {
        onClose(true); // Pass true to indicate success
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-100">
              Connect MT5 Account
            </h3>
            <button
              onClick={() => onClose(false)}
              className="text-gray-400 hover:text-gray-200"
            >
              <X size={24} />
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Enter your MT5 credentials to automatically sync trades from your broker.
            This will be saved securely and you won't need to keep your laptop running.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Server</label>
              <input
                type="text"
                value={form.server}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
                placeholder="e.g., GoatFunded-Server"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Login</label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                placeholder="Your MT5 login number"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Your MT5 password"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm flex items-center gap-2">
                <Check size={16} />
                {success}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={connecting}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {connecting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
              <button
                type="button"
                onClick={() => onClose(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
