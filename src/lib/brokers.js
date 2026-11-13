// src/lib/brokers.js
// Trading platforms this app can import from. `integration` says which
// connection screen handles the platform:
//   "mt5"    -> MetaTrader link (server + investor password)
//   "custom" -> generic template (name the account, log trades by hand or CSV)
// Marks are our own letter tiles, not broker artwork.

export const BROKERS = [
  // Popular row (matches the order shown in the picker reference)
  { id: "ctrader", name: "cTrader", mark: "cT", bg: "#E03A2F", fg: "#ffffff", integration: "custom", popular: true },
  { id: "topstepx", name: "TopstepX", mark: "T", bg: "#F2F3F8", fg: "#0b0b14", integration: "custom", popular: true },
  { id: "tradelocker", name: "TradeLocker", mark: "TL", bg: "#3D5AFE", fg: "#ffffff", integration: "custom", popular: true },
  { id: "interactive-brokers", name: "Interactive Brokers", mark: "IB", bg: "#C8102E", fg: "#ffffff", integration: "custom", popular: true },
  { id: "mt4", name: "MetaTrader 4", mark: "M4", bg: "#1F6FEB", fg: "#ffffff", integration: "mt5", popular: true },
  { id: "mt5", name: "MetaTrader 5", mark: "M5", bg: "#1F6FEB", fg: "#ffffff", integration: "mt5", popular: true },
  { id: "thinkorswim", name: "Thinkorswim", mark: "TS", bg: "#00A86B", fg: "#ffffff", integration: "custom", popular: true },
  { id: "tradovate", name: "Tradovate", mark: "TV", bg: "#2F6FED", fg: "#ffffff", integration: "custom", popular: true },

  // Long tail, reachable through search
  { id: "tastytrade", name: "Tastytrade", mark: "TT", bg: "#5A31F4", fg: "#ffffff", integration: "custom" },
  { id: "tc2000", name: "TC2000", mark: "TC", bg: "#F5A623", fg: "#0b0b14", integration: "custom" },
  { id: "td-direct", name: "TD Direct Investing", mark: "TD", bg: "#008A00", fg: "#ffffff", integration: "custom" },
  { id: "tefs", name: "TEFS Evolution", mark: "TE", bg: "#7E57C2", fg: "#ffffff", integration: "custom" },
  { id: "tradestation", name: "TradeStation", mark: "TS", bg: "#16A34A", fg: "#ffffff", integration: "custom" },
  { id: "tradezero", name: "TradeZero", mark: "TZ", bg: "#00C48C", fg: "#0b0b14", integration: "custom" },
  { id: "tradingview", name: "TradingView Paper Trading", mark: "TV", bg: "#2962FF", fg: "#ffffff", integration: "custom" },
  { id: "webull", name: "Webull", mark: "W", bg: "#00B0F0", fg: "#0b0b14", integration: "custom" },
  { id: "zerodha", name: "Zerodha", mark: "Z", bg: "#FF5722", fg: "#ffffff", integration: "custom" },
  { id: "exness", name: "Exness", mark: "EX", bg: "#FFC107", fg: "#0b0b14", integration: "custom" },
  { id: "ic-markets", name: "IC Markets", mark: "IC", bg: "#0B7285", fg: "#ffffff", integration: "custom" },
  { id: "pepperstone", name: "Pepperstone", mark: "P", bg: "#E64A19", fg: "#ffffff", integration: "custom" },
  { id: "oanda", name: "OANDA", mark: "O", bg: "#00A0DF", fg: "#ffffff", integration: "custom" },
  { id: "ig", name: "IG", mark: "IG", bg: "#E4002B", fg: "#ffffff", integration: "custom" },
  { id: "xm", name: "XM", mark: "XM", bg: "#00A651", fg: "#ffffff", integration: "custom" },
  { id: "fbs", name: "FBS", mark: "FB", bg: "#FF6B00", fg: "#ffffff", integration: "custom" },
  { id: "fp-markets", name: "FP Markets", mark: "FP", bg: "#1E88E5", fg: "#ffffff", integration: "custom" },
  { id: "ninjatrader", name: "NinjaTrader", mark: "NT", bg: "#00A5DF", fg: "#ffffff", integration: "custom" },
  { id: "bloomberg", name: "Bloomberg Terminal", mark: "BB", bg: "#111111", fg: "#ffffff", integration: "custom" },
];

export const POPULAR_BROKERS = BROKERS.filter((b) => b.popular);

export const findBroker = (name = "") => {
  const needle = String(name).trim().toLowerCase();
  if (!needle) return null;
  return (
    BROKERS.find((b) => b.name.toLowerCase() === needle) ||
    BROKERS.find((b) => needle.includes(b.name.toLowerCase())) ||
    BROKERS.find((b) => b.id === needle) ||
    null
  );
};
