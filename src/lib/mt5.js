// src/lib/mt5.js – "Sign in with MetaTrader 5" client helpers (talks to /.netlify/functions/mt5)
import { signInWithCustomToken } from "firebase/auth";
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const ENDPOINT = "/.netlify/functions/mt5";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(payload) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const mt5AccountId = (login) => `mt5-${login}`;

/**
 * Sign in with server + account number + investor password.
 * First login connects through MetaApi (can take 1–2 min); later logins are instant.
 * onProgress(message) is called with status text. Resolves with the Firebase user.
 */
export async function loginWithMT5({ server, login, password }, onProgress = () => {}) {
  onProgress("Checking credentials…");
  let r = await call({ action: "login", server, login, password });

  if (r.status === "pending") {
    const ticket = r.ticket;
    const startedAt = Date.now();
    onProgress("Connecting to your broker… this can take a minute the first time.");
    try {
      while (r.status === "pending") {
