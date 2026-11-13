// src/lib/mt5client.js – connect a MetaTrader 5 account (investor password) and import its trades
// into the signed-in user's journal as its own account. Talks to /.netlify/functions/mt5 (MetaApi).
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const ENDPOINT = "/.netlify/functions/mt5";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Netlify caps each function call at a few seconds, and MetaApi can occasionally take
// longer than that while a fresh account is being provisioned. Those replies are
// transient: the safe move is to retry the same request instead of failing the flow.
const isTransient = (e) =>
  /did not respond in time|Failed to fetch|NetworkError|Request failed \(5(02|03|04)\)/i.test(
    e?.message || ""
  );

const TOTAL_TIMEOUT_MS = 6 * 60 * 1000; // MetaApi + broker demo servers can be slow
const SETUP_TIMEOUT_MS = 6 * 60 * 1000;
const POLL_MS = 5000;

async function call(payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, idToken: await user.getIdToken() }),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data.error || `Request failed (${res.status})`;
    // MetaApi forces "high reliability" on cloud-g2 accounts, which needs a funded balance.
    if (/top up your account|insufficient balance|action is not allowed|payment required/i.test(raw)) {
      throw new Error(
        "MetaApi needs credits to host MT5 connections. Add credit at app.metaapi.cloud, then try again. (Or use 'Create one manually instead' to add trades without MT5.)"
      );
    }
    throw new Error(raw);
  }
  return data;
}

export const mt5AccountId = (login) => `mt5-${login}`;

/**
 * Connect an MT5 account with its INVESTOR (read-only) password, then import its trades.
 * The first connection can take 1–2 minutes while MetaApi links to the broker.
 * onProgress(message) receives status text. Resolves with { added, updated, accountId }.
 */
export async function connectMT5Account({ server, login, password }, onProgress = () => {}) {
  const payload = { action: "connect", server: server.trim(), login: String(login).trim(), password };
  onProgress("Checking credentials…");
  let r;
  const firstStart = Date.now();
  for (;;) {
    try {
      r = await call(payload);
      break;
    } catch (e) {
      // A slow cold start / broker lookup can exceed Netlify's per-call limit. The
      // request uses a fixed transaction id, so retrying cannot create duplicates.
      if (!isTransient(e)) throw e;
      if (Date.now() - firstStart > TOTAL_TIMEOUT_MS) throw e;
      onProgress("MetaApi is slow to respond — still checking…");
      await sleep(POLL_MS);
    }
  }

  // MetaApi may need a while to look up the broker server; keep asking (same request, safe to repeat)
  const setupStart = Date.now();
  while (r.status === "creating") {
    if (Date.now() - setupStart > SETUP_TIMEOUT_MS) {
      throw new Error("MetaApi is taking too long to set up the account. Check the server name and try again.");
    }
    onProgress("Setting up your account with MetaApi… this can take a minute the first time.");
    await sleep(POLL_MS);
    try {
      r = await call(payload);
    } catch (e) {
      if (!isTransient(e)) throw e;
      onProgress("MetaApi is slow to respond — still trying…");
    }
  }

  if (r.status === "pending") {
    const ticket = r.ticket;
    const startedAt = Date.now();
    let lastState = "";
    onProgress("Connecting to your broker… this can take a minute the first time.");
    try {
      while (r.status === "pending") {
        if (Date.now() - startedAt > TOTAL_TIMEOUT_MS) {
          throw new Error(
            lastState
              ? `MetaApi couldn't connect to ${server} (broker said: ${lastState}). Check the server name, account number and investor password.`
              : "Couldn't connect. Check the server name, account number and investor password."
          );
        }
        await sleep(4000);
        try {
          r = await call({ action: "status", ticket });
          if (r.state || r.connection) lastState = `${r.state || ""} / ${r.connection || ""}`.trim();
        } catch (e) {
          if (!isTransient(e)) throw e;
          onProgress("MetaApi is slow to respond — still connecting…");
        }
      }
    } catch (e) {
      call({ action: "cancel", ticket }).catch(() => {});
      throw e;
    }
  }

  return syncMT5Account({ login: payload.login, server: payload.server }, onProgress);
}

/**
 * Pull trades for an already-connected MT5 account into Firestore.
 * Safe to run repeatedly: trades are keyed by MT5 position id; your notes are never overwritten.
 * Resolves with { added, updated, accountId }.
 */
export async function syncMT5Account({ login, server }, onProgress = () => {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");

  let result;
  const startedAt = Date.now();
  for (;;) {
    onProgress("Fetching trades from MetaTrader…");
    try {
      result = await call({ action: "sync", login: String(login) });
    } catch (e) {
      if (!isTransient(e)) throw e;
      result = { status: "warming" };
      onProgress("MetaApi is slow to respond — still fetching…");
    }
    if (result.status === "ok") break;
    if (Date.now() - startedAt > 2 * 60 * 1000) throw new Error("MetaTrader is taking too long to respond. Try again shortly.");
    onProgress("Waking up your MetaTrader connection…");
    await sleep(4000);
  }

  const { account, trades, deposits } = result;
  const accountId = mt5AccountId(login);
  const accRef = doc(db, "users", user.uid, "accounts", accountId);
  const accSnap = await getDoc(accRef);

  const totalPnl = trades.reduce((s, t) => s + (t.status === "executed" ? t.pnl : 0), 0);
  const base = {
    current_balance: account.balance ?? 0,
    leverage: account.leverage || 100,
    mt5Server: account.server || server || "",
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

  return { added, updated, accountId };
}
