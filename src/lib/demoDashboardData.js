// Deterministic sample trades so the dashboard can be explored (and reviewed)
// without touching Firestore. Nothing here is written to the database.
const PAIRS = [
  ["EURUSD", "Long"],
  ["GBPUSD", "Short"],
  ["NAS100", "Long"],
  ["XAUUSD", "Long"],
  ["US30", "Short"],
  ["USDJPY", "Short"],
  ["AUDUSD", "Long"],
  ["BTCUSD", "Long"],
  ["GBPJPY", "Short"],
  ["USDCAD", "Long"],
];

/**
 * ~3 months of closed trades, including the whole current month so the P&L
 * calendar looks like a live account. Deterministic: same output every call.
 */
export default function demoDashboardTrades() {
  const trades = [];
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let id = 0;
  let seed = 20261112;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (const day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const perDay = rand() < 0.14 ? 0 : rand() < 0.68 ? 1 : 2;
    for (let n = 0; n < perDay; n += 1) {
      const [pair, direction] = PAIRS[Math.floor(rand() * PAIRS.length)];
      const roll = rand();
      const breakeven = roll > 0.94;
      const win = !breakeven && roll < 0.6;
      const magnitude = 45 + rand() * 520;
      const pnl = breakeven
        ? 0
        : Number((win ? magnitude : -magnitude * (0.5 + rand() * 0.55)).toFixed(2));
      const entry = 1.05 + rand() * 0.4;
      const close = new Date(day);
      close.setHours(8 + Math.floor(rand() * 8), Math.floor(rand() * 59), 0, 0);
      const open = new Date(close.getTime() - (18 + rand() * 240) * 60000);
      trades.push({
        id: `demo-${(id += 1)}`,
        pair,
        direction,
        entry: Number(entry.toFixed(5)),
        exit: Number((entry + (win ? 0.004 : -0.003)).toFixed(5)),
        stopLoss: Number((entry - 0.002).toFixed(5)),
        takeProfit: Number((entry + 0.005).toFixed(5)),
        lotSize: Number((0.2 + rand() * 2).toFixed(2)),
        pnl,
        status: "closed",
        openDateTime: open.toISOString(),
        closeDateTime: close.toISOString(),
        createdAt: close.toISOString(),
        updatedAt: close.toISOString(),
        rating: 3 + Math.round(rand() * 2),
      });
    }
  }

  return trades.sort((a, b) => new Date(b.closeDateTime) - new Date(a.closeDateTime));
}
