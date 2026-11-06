import React, { useState } from 'react';
import { X, AlertCircle, Check, Loader2, Plug } from 'lucide-react';
import { connectMT5Account } from '../../lib/mt5client';

// Connect a MetaTrader 5 account (read-only investor password) and import its trades
// as a separate journal account. onClose(success, { accountId, added }) is called when finished.
export default function ConnectMT5Modal({ isOpen, onClose }) {
  const [form, setForm] = useState({ server: '', login: '', password: '' });
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setConnecting(true);
    try {
      if (!form.server.trim()) throw new Error('Server is required');
      if (!/^\d{3,12}$/.test(form.login.trim())) throw new Error('Login must be your MT5 account number');
      if (!form.password) throw new Error('Investor password is required');

      const result = await connectMT5Account(form, setProgress);
      setSuccess(`Connected! Imported ${result.added} trade${result.added === 1 ? '' : 's'}.`);
      setTimeout(() => onClose(true, result), 1800);
    } catch (err) {
      console.error('MT5 connect error:', err);
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <Plug size={20} className="text-blue-400" />
              Connect MT5 Account
            </h3>
            <button
              onClick={() => !connecting && onClose(false)}
              className="text-gray-400 hover:text-gray-200"
              aria-label="Close"
            >
              <X size={24} />
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Import your MetaTrader 5 trades into a new journal account. Use your <b>investor (read-only)
            password</b>, never your trading password. It can only view trades, not place them or move money.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Server</label>
              <input
                type="text"
                value={form.server}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
                placeholder="e.g., Exness-MT5Real9"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Login</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value.replace(/\D/g, '') })}
                placeholder="Your MT5 account number"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Investor password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Read-only investor password"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm flex items-center gap-2">
                <Check size={16} />
                {success}
              </div>
            )}

            {connecting && progress && (
              <div className="text-xs text-gray-400 text-center">{progress}</div>
            )}

            <div className="flex gap-3 pt-2">
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
                  'Connect & import'
                )}
              </button>
              <button
                type="button"
                onClick={() => onClose(false)}
                disabled={connecting}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>

          <div className="mt-4 text-xs text-gray-500 text-center">
            The first connection can take 1–2 minutes. Keep this window open.
          </div>
        </div>
      </div>
    </div>
  );
}
