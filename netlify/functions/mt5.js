// netlify/functions/mt5.js
// "Sign in with MetaTrader 5" backend. Uses MetaApi (metaapi.cloud) to read a trader's
// history with their INVESTOR (read-only) password, then signs them into Firebase.
//
// Netlify environment variables (all required):
//   (MetaApi token is stored in Firestore: collection mt5Config, document secrets, field metaapiToken)
//   FIREBASE_SERVICE_ACCOUNT – the whole service-account JSON (Firebase console → Project settings →
//                              Service accounts → Generate new private key), pasted as one value
//
// Actions (POST JSON { action, ... }). Every call is short so it fits Netlify's 10 s limit;
// the browser polls "status" while MetaApi connects to the broker (usually 30–120 s, first login only).
//   login  { server, login, password } -> { status:"ready", token } | { status:"pending", ticket }
//   status { ticket }                   -> { status:"pending" } | { status:"ready", token }
//   cancel { ticket }                   -> { ok:true }
//   sync   { idToken, since? }          -> { status:"warming" } | { status:"ok", account, trades, deposits }

const crypto = require("crypto");
const admin = require("firebase-admin");

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CREDS = "mt5Credentials"; // server-only collection (client rules must NOT allow access)

// ── helpers ─────────────────────────────────────────────────────────────────
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function initAdmin() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(500, "Server is missing FIREBASE_SERVICE_ACCOUNT.");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

// The MetaApi token is long, and Netlify limits all function env vars to 4 KB in total.
// So it lives in Firestore at mt5Config/secrets { metaapiToken } (server-only; client rules deny it).
// An env var METAAPI_TOKEN still works as a fallback.
let cachedToken = null;
async function getMetaToken() {
  if (process.env.METAAPI_TOKEN) return process.env.METAAPI_TOKEN;
  if (cachedToken) return cachedToken;
  const snap = await admin.firestore().collection("mt5Config").doc("secrets").get();
  const t = snap.exists && snap.data().metaapiToken;
  if (!t) throw new HttpError(500, "MetaApi token is not set (Firestore mt5Config/secrets.metaapiToken).");
  cachedToken = String(t).trim();
  return cachedToken;
}

async function meta(url, { method = "GET", body, headers = {} } = {}) {
  const token = await getMetaToken();
  const res = await fetch(url, {
    method,
    headers: { "auth-token": token, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok && res.status !== 202) {
    throw new HttpError(res.status, (data && data.message) || `MetaApi error ${res.status}`);
  }
  return { status: res.status, data };
}

const accountUrl = (id) => `${PROVISIONING}/users/current/accounts/${id}`;
const clientBase = (acct) => `https://mt-client-api-v1.${acct.region || "vint-hill"}.agiliumtrade.ai`;

const norm = (s) => String(s || "").trim();
const uidFor = (server, login) =>
  "mt5_" + crypto.createHash("sha256").update(`${norm(server).toLowerCase()}|${norm(login)}`).digest("hex").slice(0, 28);

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const safeEq = (a, b) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Short-lived signed ticket so the browser can poll without re-sending the password.
const ticketKey = () => crypto.createHash("sha256").update("mt5-ticket|" + process.env.FIREBASE_SERVICE_ACCOUNT).digest();
function signTicket(payload) {
  const p = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60 * 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketKey()).update(p).digest("base64url");
  return `${p}.${sig}`;
}
function readTicket(t) {
  const [p, sig] = String(t || "").split(".");
  if (!p || !sig) throw new HttpError(400, "Invalid ticket.");
  const good = crypto.createHmac("sha256", ticketKey()).update(p).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw new HttpError(400, "Invalid ticket.");
  const data = JSON.parse(Buffer.from(p, "base64url").toString());
  if (data.exp < Date.now()) throw new HttpError(400, "Ticket expired. Please sign in again.");
  return data;
}

// Best-effort rate limit (resets when the function instance restarts)
const hits = new Map();
function rateLimited(key, max) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

async function deleteMetaAccount(id) {
  if (!id) return;
  try { await meta(accountUrl(id), { method: "DELETE" }); } catch (_) { /* already gone */ }
}

// ── deals → journal trades ─────────────────────────────────────────────────
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const vwap = (deals) => {
  const vol = deals.reduce((s, d) => s + num(d.volume), 0);
  return vol ? deals.reduce((s, d) => s + num(d.price) * num(d.volume), 0) / vol : 0;
};
const localStamp = (d) => String(d.brokerTime || d.time || "").replace(" ", "T").slice(0, 16);

function pairDeals(deals, orders = []) {
  let deposits = 0;
  const byPos = new Map();
  for (const d of deals) {
    if (d.type === "DEAL_TYPE_BALANCE") { deposits += num(d.profit); continue; }
    if (d.type !== "DEAL_TYPE_BUY" && d.type !== "DEAL_TYPE_SELL") continue;
    if (!d.positionId) continue;
    if (!byPos.has(d.positionId)) byPos.set(d.positionId, []);
    byPos.get(d.positionId).push(d);
  }
  const ordersByPos = new Map();
  for (const o of orders) {
    if (!o.positionId) continue;
    if (!ordersByPos.has(o.positionId)) ordersByPos.set(o.positionId, []);
    ordersByPos.get(o.positionId).push(o);
  }

  const trades = [];
  for (const [positionId, list] of byPos) {
    list.sort((a, b) => new Date(a.time) - new Date(b.time));
    const ins = list.filter((d) => d.entryType === "DEAL_ENTRY_IN");
    const outs = list.filter((d) => d.entryType && d.entryType !== "DEAL_ENTRY_IN");
    const first = ins[0] || list[0];
    const long = ins.length ? ins[0].type === "DEAL_TYPE_BUY" : first.type === "DEAL_TYPE_SELL"; // a closing SELL means it was long
    const inVol = ins.reduce((s, d) => s + num(d.volume), 0);
    const outVol = outs.reduce((s, d) => s + num(d.volume), 0);
    const closed = outs.length > 0 && (!ins.length || outVol >= inVol - 1e-9);
    const pnl = list.reduce((s, d) => s + num(d.profit) + num(d.swap) + num(d.commission) + num(d.fee), 0);

    const entry = vwap(ins);
    const exit = closed ? vwap(outs) : 0;
    const sorted = (ordersByPos.get(positionId) || []).sort((a, b) => new Date(a.time) - new Date(b.time));
    const withLevels = sorted.find((o) => num(o.stopLoss) || num(o.takeProfit)) || {};
    const sl = num(withLevels.stopLoss);
    const tp = num(withLevels.takeProfit);
    const risk = entry && sl ? (long ? entry - sl : sl - entry) : 0;
    const reward = entry && tp ? (long ? tp - entry : entry - tp) : 0;

    trades.push({
      id: `mt5_${positionId}`,
      mt5PositionId: String(positionId),
      partial: ins.length === 0, // opened before the fetched window
      pair: String(first.symbol || "").toUpperCase(),
      direction: long ? "Long" : "Short",
      entry,
      exit,
      stopLoss: sl,
      takeProfit: tp,
      lotSize: Math.round(inVol * 100) / 100 || Math.round(outVol * 100) / 100,
      pnl: closed ? Math.round(pnl * 100) / 100 : 0,
      rr: risk > 0 && reward > 0 ? (reward / risk).toFixed(2) : "",
      status: closed ? "executed" : "pending",
      openDateTime: ins.length ? localStamp(ins[0]) : localStamp(first),
      closeDateTime: closed ? localStamp(outs[outs.length - 1]) : null,
      commission: Math.round(list.reduce((s, d) => s + num(d.commission) + num(d.fee), 0) * 100) / 100,
      swap: Math.round(list.reduce((s, d) => s + num(d.swap), 0) * 100) / 100,
      source: "mt5",
    });
  }
  trades.sort((a, b) => (a.openDateTime < b.openDateTime ? -1 : 1));
  return { trades, deposits: Math.round(deposits * 100) / 100 };
}

async function pageAll(url) {
  const out = [];
  for (let offset = 0, i = 0; i < 10; i++, offset += 1000) {
    const { data } = await meta(`${url}?offset=${offset}&limit=1000`);
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// ── actions ─────────────────────────────────────────────────────────────────
async function actionLogin(body, ip) {
  const server = norm(body.server);
  const login = norm(body.login);
  const password = String(body.password || "");
  if (!server || !/^\d{3,12}$/.test(login) || !password) throw new HttpError(400, "Enter your server, account number and investor password.");

  const uid = uidFor(server, login);
  if (rateLimited(`${ip}|${uid}`, 8)) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");

  const db = admin.firestore();
  const ref = db.collection(CREDS).doc(uid);
  const snap = await ref.get();
  const saved = snap.exists ? snap.data() : null;

  // Known account + same password → instant sign-in
  if (saved && saved.verified && saved.salt && safeEq(saved.hash, hashPw(password, saved.salt))) {
    const token = await admin.auth().createCustomToken(uid, { mt5: true });
    return { status: "ready", token, uid };
  }

  // First time (or password changed): connect through MetaApi to prove the password is real.
  if (saved && saved.accountId) await deleteMetaAccount(saved.accountId);

  const transactionId = crypto.randomUUID().replace(/-/g, "");
  let created;
  for (let i = 0; i < 4; i++) {
    created = await meta(`${PROVISIONING}/users/current/accounts`, {
      method: "POST",
      headers: { "transaction-id": transactionId },
      body: {
        name: `forge-${login}`,
        type: "cloud-g2",
        login,
        password,
        server,
        platform: "mt5",
        magic: 0,
        application: "MetaApi",
        reliability: "regular",
      },
    });
    if (created.status !== 202) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const accountId = created && created.data && created.data.id;
  if (!accountId) throw new HttpError(502, "MetaApi is still preparing the account. Please try again in a moment.");

  const salt = crypto.randomBytes(16).toString("hex");
  await ref.set({ server, login, salt, hash: hashPw(password, salt), accountId, verified: false, updatedAt: Date.now() });
  return { status: "pending", ticket: signTicket({ uid, accountId }) };
}

async function actionStatus(body) {
  const { uid, accountId } = readTicket(body.ticket);
  const ref = admin.firestore().collection(CREDS).doc(uid);

  let acct;
  try {
    acct = (await meta(accountUrl(accountId))).data;
  } catch (e) {
    if (e.status === 404) throw new HttpError(410, "Connection was cancelled. Please sign in again.");
    throw e;
  }
  if (acct.state === "DEPLOY_FAILED") {
    await deleteMetaAccount(accountId);
    await ref.delete();
    throw new HttpError(422, "Could not deploy this account. Check the server name.");
  }
  if (acct.connectionStatus !== "CONNECTED") {
    return { status: "pending", state: acct.state, connection: acct.connectionStatus || "DISCONNECTED" };
  }

  // Connected. Refuse master passwords: investor mode must be on.
  const info = (await meta(`${clientBase(acct)}/users/current/accounts/${accountId}/account-information`)).data || {};
  if (info.investorMode === false) {
    await deleteMetaAccount(accountId);
    await ref.delete();
    throw new HttpError(422, "That looks like your MASTER (trading) password. For safety, sign in with your INVESTOR (read-only) password.");
  }

  await ref.update({ verified: true, updatedAt: Date.now() });
  const token = await admin.auth().createCustomToken(uid, { mt5: true });
  return { status: "ready", token, uid };
}

async function actionCancel(body) {
  const { uid, accountId } = readTicket(body.ticket);
  const ref = admin.firestore().collection(CREDS).doc(uid);
  const snap = await ref.get();
  if (snap.exists && !snap.data().verified) {
    await deleteMetaAccount(accountId);
    await ref.delete();
  }
  return { ok: true };
}

async function actionSync(body) {
  if (!body.idToken) throw new HttpError(401, "Not signed in.");
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(body.idToken); } catch { throw new HttpError(401, "Session expired. Sign in again."); }
  const uid = decoded.uid;
  if (!uid.startsWith("mt5_")) throw new HttpError(403, "This sign-in is not linked to MetaTrader.");

  const snap = await admin.firestore().collection(CREDS).doc(uid).get();
  if (!snap.exists || !snap.data().verified) throw new HttpError(403, "MetaTrader account is not verified.");
  const { accountId } = snap.data();

  const acct = (await meta(accountUrl(accountId))).data;
  if (acct.state !== "DEPLOYED") {
    await meta(`${accountUrl(accountId)}/deploy`, { method: "POST" });
    return { status: "warming" };
  }
  if (acct.connectionStatus !== "CONNECTED") return { status: "warming" };

  const base = `${clientBase(acct)}/users/current/accounts/${accountId}`;
  const start = body.since && !isNaN(Date.parse(body.since)) ? new Date(body.since) : new Date(Date.now() - 365 * 86400000);
  const range = `${start.toISOString()}/${new Date(Date.now() + 86400000).toISOString()}`;

  const [info, deals, orders] = await Promise.all([
    meta(`${base}/account-information`).then((r) => r.data || {}),
    pageAll(`${base}/history-deals/time/${range}`),
    pageAll(`${base}/history-orders/time/${range}`).catch(() => []),
  ]);
  const { trades, deposits } = pairDeals(deals, orders);

  return {
    status: "ok",
    account: {
      balance: info.balance,
      equity: info.equity,
      currency: info.currency,
      leverage: info.leverage,
      name: info.name,
      server: info.server,
      login: info.login,
      broker: info.broker,
    },
    trades,
    deposits,
  };
}

exports.pairDeals = pairDeals; // exported for tests

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  try {
    initAdmin();
    const body = JSON.parse(event.body || "{}");
    const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "ip").split(",")[0];
    switch (body.action) {
      case "login": return json(200, await actionLogin(body, ip));
      case "status": return json(200, await actionStatus(body));
      case "cancel": return json(200, await actionCancel(body));
      case "sync": return json(200, await actionSync(body));
      default: return json(400, { error: "Unknown action" });
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("mt5 function error:", e);
    return json(status, { error: status === 500 && !(e instanceof HttpError) ? "Server error. Please try again." : e.message });
  }
};
