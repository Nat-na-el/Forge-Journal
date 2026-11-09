import React, { useState } from 'react';
import { X, AlertCircle, Check, Loader2, Plug } from 'lucide-react';
import { connectMT5Account } from '../../lib/mt5client';
import { CARD, HEAD, MUTED, DIVIDER, FIELD, POS_T } from '../../lib/uiTokens';

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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`${CARD} max-h-[95vh] w-full max-w-md overflow-y-auto p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className={`flex items-center gap-2 text-lg font-bold ${HEAD}`}>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: '#6C47FF14', color: '#6C47FF' }}
            >
              <Plug size={16} />
            </span>
            Connect MT5 account
          </h3>
          <button
            onClick={() => !connecting && onClose(false)}
            className={`rounded-lg p-1 transition-colors hover:bg-[#f7f8fc] dark:hover:bg-[#101024] ${MUTED}`}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p className={`mb-4 text-sm leading-relaxed ${MUTED}`}>
          Import your MetaTrader 5 trades into a new journal account. Use your <b>investor (read-only)
          password</b>, never your trading password. It can only view trades, not place them or move money.
        </p>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Server</label>
            <input
              type="text"
              value={form.server}
              onChange={(e) => setForm({ ...form, server: e.target.value })}
              placeholder="e.g., Exness-MT5Real9"
              className={FIELD}
              disabled={connecting}
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Login</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value.replace(/\D/g, '') })}
              placeholder="Your MT5 account number"
              className={FIELD}
              disabled={connecting}
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Investor password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Read-only investor password"
              className={FIELD}
              disabled={connecting}
              autoComplete="off"
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-[#f2556e]/30 bg-[#f2556e]/10 p-3 text-sm text-[#d93a57] dark:text-[#ff6b86]">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className={`flex items-center gap-2 rounded-lg border border-[#22c493]/30 bg-[#22c493]/10 p-3 text-sm ${POS_T}`}>
              <Check size={16} />
              {success}
            </div>
          )}

          {connecting && progress && (
            <div className={`text-center text-xs ${MUTED}`}>{progress}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={connecting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting…
                </>
              ) : (
                'Connect & import'
              )}
            </button>
            <button
              type="button"
              onClick={() => onClose(false)}
              disabled={connecting}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${DIVIDER} ${HEAD} hover:bg-[#f7f8fc] dark:hover:bg-[#101024]`}
            >
              Cancel
            </button>
          </div>
        </form>

        <div className={`mt-4 text-center text-xs ${MUTED}`}>
          The first connection can take 1–2 minutes. Keep this window open.
        </div>
      </div>
    </div>
  );
}
