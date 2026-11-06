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
        if (Date.now() - startedAt > 4 * 60 * 1000) {
          throw new Error("Couldn't connect. Check the server name, account number and investor password.");
        }
        await sleep(4000);
        r = await call({ action: "status", ticket });
      }
    } catch (e) {
      call({ action: "cancel", ticket }).catch(() => {});
      throw e;
    }
  }

  const cred = await signInWithCustomToken(auth, r.token);
  localStorage.setItem("mt5Session", JSON.stringify({ server: server.trim(), login: String(login).trim() }));
  return cred.user;
}

/**
 * Pull trades from MetaTrader (via MetaApi) into Firestore for the signed-in MT5 user.
 * Safe to run repeatedly: trades are keyed by MT5 position id; notes you wrote are never overwritten.
 * Resolves with { added, updated, accountId }.
 */
export async function syncMT5(onProgress = () => {}) {
  const user = auth.currentUser;
  if (!user || !user.uid.startsWith("mt5_")) throw new Error("Sign in with MetaTrader to sync.");
  const session = JSON.parse(localStorage.getItem("mt5Session") || "{}");

  let result;
  const startedAt = Date.now();
  for (;;) {
    onProgress("Fetching trades from MetaTrader…");
    const idToken = await user.getIdToken();
    result = await call({ action: "sync", idToken });
    if (result.status === "ok") break;
    if (Date.now() - startedAt > 2 * 60 * 1000) throw new Error("MetaTrader is taking too long to respond. Try again shortly.");
    onProgress("Waking up your MetaTrader connection…");
    await sleep(4000);
  }

  const { account, trades, deposits } = result;
  const login = account.login || session.login || "account";
  const accountId = mt5AccountId(login);
  const accRef = doc(db, "users", user.uid, "accounts", accountId);
  const accSnap = await getDoc(accRef);

  const totalPnl = trades.reduce((s, t) => s + (t.status === "executed" ? t.pnl : 0), 0);
  const base = {
    current_balance: account.balance ?? 0,
    leverage: account.leverage || 100,
    mt5Server: account.server || session.server || "",
    mt5Login: Number(login) || login,
    mt5Connected: true,
    mt5LastSync: new Date().toISOString(),
    mt5AccountInfo: {
      balance: account.balance ?? 0,
      equity: account.equity ?? 0,
      currency: account.currency || "USD",
      broker: account.broker || "",
    },
  };
  if (!accSnap.exists()) {
    await setDoc(accRef, {
      name: `MT5 ${login}`,
      starting_balance: deposits > 0 ? deposits : Math.round(((account.balance ?? 0) - totalPnl) * 100) / 100,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      ...base,
    });
  } else {
    await updateDoc(accRef, base);
  }

  // Import trades
  const tradesCol = collection(db, "users", user.uid, "accounts", accountId, "trades");
  const existing = new Map((await getDocs(tradesCol)).docs.map((d) => [d.id, d.data()]));
  let added = 0;
  let updated = 0;
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };

  for (const t of trades) {
    const { id, partial, ...fields } = t;
    const prev = existing.get(id);
    if (!prev) {
      if (partial) continue; // can't build a full trade without its entry
      batch.set(doc(tradesCol, id), {
        ...fields,
        notes: "",
        confluences: [],
        screenshotUrl: "",
        createdAt: serverTimestamp(),
      });
      added++; ops++;
    } else if (prev.status === "pending" && fields.status === "executed") {
      // an open trade got closed since the last sync – fill in the result, keep the user's notes
      batch.update(doc(tradesCol, id), {
        exit: fields.exit, pnl: fields.pnl, status: "executed", closeDateTime: fields.closeDateTime,
        commission: fields.commission, swap: fields.swap, rr: prev.rr || fields.rr,
      });
      updated++; ops++;
    }
    if (ops >= 400) await flush();
  }
  await flush();

  localStorage.setItem("currentAccountId", accountId);
  return { added, updated, accountId };
}
