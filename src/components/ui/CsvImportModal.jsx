// src/components/ui/CsvImportModal.jsx
import React, { useRef, useState } from "react";
import { collection, addDoc, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./button";

// ─── Column aliases (case-insensitive) ───────────────────────────────────────
const ALIASES = {
  openDateTime: [
    "opendatetime", "open date", "open time", "opentime", "entry time", "entrytime",
    "date", "datetime", "time", "open", "entry date", "entrydate", "opened"
  ],
  closeDateTime: [
    "closedatetime", "close date", "close time", "closetime", "exit time", "exittime",
    "closed", "exit date", "exitdate"
  ],
  pair: [
    "pair", "symbol", "instrument", "ticker", "asset", "market", "product"
  ],
  direction: [
    "direction", "side", "type", "action", "buy/sell", "buysell", "long/short", "position"
  ],
  entry: [
    "entry", "entry price", "entryprice", "open price", "openprice", "price in", "avg entry"
  ],
  exit: [
    "exit", "exit price", "exitprice", "close price", "closeprice", "price out", "avg exit"
  ],
  stopLoss: [
    "stoploss", "stop loss", "sl", "stop", "s/l"
  ],
  takeProfit: [
    "takeprofit", "take profit", "tp", "target", "t/p"
  ],
  pnl: [
    "pnl", "p&l", "profit", "net pnl", "netpnl", "net p&l", "pl", "profit/loss", "result"
  ],
  rr: [
    "rr", "r:r", "risk reward", "risk:reward", "r multiple", "rmultiple"
  ],
  lotSize: [
    "lotsize", "lot size", "lots", "size", "quantity", "qty", "volume", "contracts"
  ],
  notes: [
    "notes", "note", "comment", "comments", "description", "remarks"
  ],
  status: [
    "status", "state"
  ],
  confluences: [
    "confluences", "tags", "tag", "setup", "strategy", "playbook", "confluence"
  ],
};

const normalize = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const findField = (header) => {
  const n = normalize(header);
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((a) => n === a || n.includes(a))) return field;
  }
  return null;
};

// Simple CSV parser that handles quoted fields
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let cell = "";
      if (text[i] === '"') {
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              cell += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            cell += text[i++];
          }
        }
      } else {
        while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          cell += text[i++];
        }
      }
      row.push(cell.trim());
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "\r") i++;
      if (text[i] === "\n") {
        i++;
        break;
      }
      break;
    }
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const cleaned = String(v).replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const normalizeDirection = (v) => {
  const s = String(v || "").toLowerCase().trim();
  if (["long", "buy", "b", "l"].includes(s)) return "Long";
  if (["short", "sell", "s"].includes(s)) return "Short";
  return s ? (s.startsWith("b") || s.startsWith("l") ? "Long" : "Short") : "Long";
};

const normalizeDateTime = (v) => {
  if (!v) return "";
  const s = String(v).trim();
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.length === 10 ? `${s}T00:00` : s.slice(0, 16);
  }
  // MM/DD/YYYY or DD/MM/YYYY → try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, "0");
    return `\( {d.getFullYear()}- \){pad(d.getMonth() + 1)}-\( {pad(d.getDate())}T \){pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return s;
};

export default function CsvImportModal({ currentAccount, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState("upload"); // upload | preview | importing | done
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setError("CSV needs a header row and at least one data row.");
        return;
      }

      const hdrs = parsed[0];
      const dataRows = parsed.slice(1);

      // Auto-map columns
      const map = {};
      hdrs.forEach((h, idx) => {
        const field = findField(h);
        if (field && !map[field]) map[field] = idx;
      });

      setHeaders(hdrs);
      setMapping(map);
      setRows(dataRows);

      // Build preview (first 8 rows)
      const mappedPreview = dataRows.slice(0, 8).map((row) => mapRow(row, map));
      setPreview(mappedPreview);
      setStep("preview");
    } catch (err) {
      console.error(err);
      setError("Failed to read CSV: " + (err.message || "unknown error"));
    }
  };

  const mapRow = (row, map) => {
    const get = (field) => {
      const idx = map[field];
      return idx !== undefined ? row[idx] ?? "" : "";
    };

    const direction = normalizeDirection(get("direction"));
    const entry = toNumber(get("entry"));
    const exit = toNumber(get("exit"));
    const sl = toNumber(get("stopLoss"));
    const tp = toNumber(get("takeProfit"));
    const pnl = toNumber(get("pnl"));
    const lot = toNumber(get("lotSize")) || 0.1;
    const tagsRaw = get("confluences");
    const tags = tagsRaw
      ? String(tagsRaw)
          .split(/[;,|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    return {
      openDateTime: normalizeDateTime(get("openDateTime")),
      closeDateTime: normalizeDateTime(get("closeDateTime")) || null,
      pair: String(get("pair") || "").toUpperCase().trim(),
      direction,
      entry,
      exit,
      stopLoss: sl,
      takeProfit: tp,
      pnl,
      rr: get("rr") ? String(get("rr")) : "",
      lotSize: lot,
      notes: String(get("notes") || "").trim(),
      status: String(get("status") || "executed").toLowerCase().includes("pend") ? "pending" : "executed",
      confluences: tags,
      screenshotUrl: "",
    };
  };

  const changeMapping = (field, headerIdx) => {
    const next = { ...mapping, [field]: headerIdx === "" ? undefined : Number(headerIdx) };
    setMapping(next);
    setPreview(rows.slice(0, 8).map((r) => mapRow(r, next)));
  };

  const doImport = async () => {
    const user = auth.currentUser;
    if (!user || !currentAccount?.id) {
      setError("You must be logged in and have an account selected.");
      return;
    }
    if (!mapping.pair && !mapping.pnl) {
      setError("At least map a Pair/Symbol column (and ideally P&L).");
      return;
    }

    setStep("importing");
    setError("");
    setProgress(0);

    const tradesRef = collection(db, "users", user.uid, "accounts", currentAccount.id, "trades");
    const mapped = rows.map((r) => mapRow(r, mapping)).filter((t) => t.pair);

    const BATCH_SIZE = 400; // Firestore limit is 500
    let count = 0;

    try {
      for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
        const chunk = mapped.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((trade) => {
          const ref = doc(tradesRef);
          batch.set(ref, {
            ...trade,
            createdAt: serverTimestamp(),
            importedAt: serverTimestamp(),
            source: "csv",
          });
        });

        await batch.commit();
        count += chunk.length;
        setProgress(Math.round((count / mapped.length) * 100));
        setImportedCount(count);
      }

      setStep("done");
      onImported?.(count);
    } catch (err) {
      console.error("Import failed:", err);
      setError("Import failed: " + (err.message || "unknown error"));
      setStep("preview");
    }
  };

  const requiredOk = mapping.pair !== undefined;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e6e8f2] px-5 py-4 dark:border-[#262645]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6C47FF]/15">
              <FileSpreadsheet className="h-5 w-5 text-[#6C47FF]" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Import trades from CSV</h3>
              <p className="text-xs text-[#6b7090] dark:text-[#8a8fb5]">
                {currentAccount?.name || "Account"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[#6b7090] hover:bg-[#e6e8f2] dark:hover:bg-[#262645]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* STEP: Upload */}
          {step === "upload" && (
            <div
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#c8cbe0] bg-[#f7f8fc] py-14 transition hover:border-[#6C47FF] hover:bg-[#6C47FF]/5 dark:border-[#3a3a5c] dark:bg-[#101024]"
            >
              <Upload className="h-10 w-10 text-[#6C47FF]" />
              <div className="text-center">
                <p className="font-semibold">Click to upload CSV</p>
                <p className="mt-1 text-xs text-[#6b7090] dark:text-[#8a8fb5]">
                  Supports common broker & journal exports
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {/* STEP: Preview + Mapping */}
          {step === "preview" && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{fileName}</span>
                <span className="text-[#6b7090] dark:text-[#8a8fb5]">
                  {rows.length} rows detected
                </span>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["pair", "Pair / Symbol *"],
                  ["direction", "Direction"],
                  ["openDateTime", "Open Date/Time"],
                  ["closeDateTime", "Close Date/Time"],
                  ["entry", "Entry Price"],
                  ["exit", "Exit Price"],
                  ["stopLoss", "Stop Loss"],
                  ["takeProfit", "Take Profit"],
                  ["pnl", "P&L"],
                  ["lotSize", "Lot / Size"],
                  ["rr", "R:R"],
                  ["notes", "Notes"],
                  ["confluences", "Tags / Setup"],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className="mb-1 block text-xs font-semibold text-[#6b7090] dark:text-[#8a8fb5]">
                      {label}
                    </label>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(e) => changeMapping(field, e.target.value)}
                      className="w-full rounded-lg border border-[#e6e8f2] bg-white px-2 py-2 text-sm outline-none focus:border-[#6C47FF] dark:border-[#262645] dark:bg-[#101024]"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-[#e6e8f2] dark:border-[#262645]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f7f8fc] dark:bg-[#101024]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Pair</th>
                      <th className="px-3 py-2 font-semibold">Dir</th>
                      <th className="px-3 py-2 font-semibold">Entry</th>
                      <th className="px-3 py-2 font-semibold">Exit</th>
                      <th className="px-3 py-2 font-semibold">P&L</th>
                      <th className="px-3 py-2 font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((t, i) => (
                      <tr key={i} className="border-t border-[#e6e8f2] dark:border-[#262645]">
                        <td className="px-3 py-2 font-medium">{t.pair || "—"}</td>
                        <td className="px-3 py-2">{t.direction}</td>
                        <td className="px-3 py-2">{t.entry || "—"}</td>
                        <td className="px-3 py-2">{t.exit || "—"}</td>
                        <td className={`px-3 py-2 font-semibold ${t.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {t.pnl}
                        </td>
                        <td className="px-3 py-2 text-[#6b7090]">{t.openDateTime || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Back
                </Button>
                <Button
                  onClick={doImport}
                  disabled={!requiredOk}
                  style={{ backgroundColor: "#6C47FF" }}
                  className="text-white hover:brightness-110 disabled:opacity-50"
                >
                  Import {rows.length} trades
                </Button>
              </div>
            </>
          )}

          {/* STEP: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="h-10 w-10 animate-spin text-[#6C47FF]" />
              <p className="font-medium">Importing trades…</p>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645]">
                <div
                  className="h-full rounded-full bg-[#6C47FF] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-[#6b7090]">
                {importedCount} / {rows.length}
              </p>
            </div>
          )}

          {/* STEP: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="h-7 w-7 text-emerald-500" />
              </div>
              <p className="text-lg font-bold">Import complete</p>
              <p className="text-sm text-[#6b7090]">
                Successfully imported <strong>{importedCount}</strong> trades.
              </p>
              <Button
                onClick={onClose}
                style={{ backgroundColor: "#6C47FF" }}
                className="mt-2 text-white hover:brightness-110"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
