}

function initAdmin() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(500, "Server is missing FIREBASE_SERVICE_ACCOUNT.");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

async function meta(url, { method = "GET", body, headers = {} } = {}) {
  if (!process.env.METAAPI_TOKEN) throw new HttpError(500, "Server is missing METAAPI_TOKEN.");
  const res = await fetch(url, {
    method,
    headers: { "auth-token": process.env.METAAPI_TOKEN, "Content-Type": "application/json", ...headers },
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
