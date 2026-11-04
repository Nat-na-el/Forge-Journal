
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Sync Firebase user → local account system
  const syncFirebaseUserToLocalAccount = (user) => {
    const uid = user.uid;
    let accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
    let account = accounts.find(acc => acc.id === uid);

    if (!account) {
      account = {
        id: uid,
        name: user.displayName || (email ? email.split('@')[0] : "Trader"),
        startingBalance: 10000,
        totalPnL: 0,
        createdAt: new Date().toISOString(),
      };
      accounts.push(account);
      localStorage.setItem("accounts", JSON.stringify(accounts));
      localStorage.setItem(`${uid}_trades`, JSON.stringify([]));
      localStorage.setItem(`${uid}_notes`, JSON.stringify([]));
      localStorage.setItem(`${uid}_journals`, JSON.stringify([]));
      localStorage.setItem(`dashboard_${uid}`, JSON.stringify({}));
    }

    localStorage.setItem("currentAccountId", uid);
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      syncFirebaseUserToLocalAccount(userCredential.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      syncFirebaseUserToLocalAccount(result.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Google login failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-3 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5 sm:p-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-900 dark:text-white">
          Tradeass Login
        </h1>

        {error && (
          <p className="text-red-500 text-center mb-6 bg-red-50 dark:bg-red-950/30 p-3 rounded">
            {error}
          </p>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-5">
          <div>
            <Label htmlFor="email" className="text-gray-700 dark:text-gray-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="mt-1"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="mt-1"
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in with Email"}
          </Button>
        </form>

        <div className="my-6 text-center text-gray-500 dark:text-gray-400">or</div>

        <Button
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full flex items-center justify-center gap-3 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          disabled={loading}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.44-3.39-7.44-7.565s3.345-7.565 7.44-7.565c2.33 0 3.918.98 4.82 1.83l3.28-3.16C18.72 1.45 15.66 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.87 11.52-11.74 0-.79-.085-1.39-.185-1.99H12.24z"
            />
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </Button>

        <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-indigo-600 hover:underline font-medium"
            disabled={loading}
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}
