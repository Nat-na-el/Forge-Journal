
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginWithMT5, syncMT5 } from '../lib/mt5';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('email'); // 'email' | 'mt5'
  const [mt5, setMt5] = useState({ server: '', login: '', password: '' });
  const [progress, setProgress] = useState('');
  const navigate = useNavigate();

  const handleMT5Login = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithMT5(mt5, setProgress);
      setProgress('Importing your trades…');
      await syncMT5(setProgress);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'MetaTrader sign-in failed.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  // Sync Firebase user → local account system
  const syncFirebaseUserToLocalAccount = (user) => {
    const uid = user.uid;
    let accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
    let account = accounts.find(acc => acc.id === uid);
