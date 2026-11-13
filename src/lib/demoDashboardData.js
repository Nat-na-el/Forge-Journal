// Deterministic sample trades so the dashboard can be explored (and reviewed)
// without touching Firestore. Nothing here is written to the database.
// Pair, side, a plausible price level, decimal places and the size of one
// "tick" of movement. Keeping these realistic means the trade log shows
// believable entries and exits for each market.
const PAIRS = [
  ["EURUSD", "Long", 1.085, 5, 0.0001],
  ["GBPUSD", "Short", 1.265, 5, 0.0001],
  ["NAS100", "Long", 18450, 1, 1],
  ["XAUUSD", "Long", 2140, 2, 0.1],
  ["US30", "Short", 38900, 1, 1],
  ["USDJPY", "Short", 149.5, 3, 0.01],
  ["AUDUSD", "Long", 0.655, 5, 0.0001],
  ["BTCUSD", "Long", 63500, 0, 1],
  ["GBPJPY", "Short", 188, 3, 0.01],
  ["USDCAD", "Long", 1.36, 5, 0.0001],
];

const SETUPS = [
  "Opening range breakout",
  "Liquidity sweep",
  "Trend continuation",
  "Mean reversion",
  "News fade",
];

const CONFLUENCES = [
  "Fair value gap",
  "Order block",
  "Volume spike",
  "Session high",
  "Trendline",
  "Pullback",
  "Divergence",
];

/**
 * ~3 months of closed trades, including the whole current month so the P&L
 * calendar looks like a live account. Deterministic: same output every call.
 */
export default function demoDashboardTrades() {
  const trades = [];
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
      const [pair, direction, basePrice, digits, tick] = PAIRS[Math.floor(rand() * PAIRS.length)];
      const short = direction === "Short";
      const roll = rand();
      const breakeven = roll > 0.94;
      const win = !breakeven && roll < 0.6;
      const magnitude = 45 + rand() * 520;
      const pnl = breakeven
        ? 0
        : Number((win ? magnitude : -magnitude * (0.5 + rand() * 0.55)).toFixed(2));
      const round = (value) => Number(value.toFixed(digits));
      const entry = basePrice * (1 + (rand() - 0.5) * 0.006);
      const stopDistance = tick * (8 + rand() * 26);
      const move = stopDistance * (win ? 1 + rand() * 2.2 : -(0.35 + rand() * 0.85));
      const exit = entry + (short ? -move : move);
      const close = new Date(day);
      close.setHours(8 + Math.floor(rand() * 8), Math.floor(rand() * 59), 0, 0);
      const open = new Date(close.getTime() - (18 + rand() * 240) * 60000);
      const setup = SETUPS[Math.floor(rand() * SETUPS.length)];
      const firstTag = CONFLUENCES[Math.floor(rand() * CONFLUENCES.length)];
      const secondTag = CONFLUENCES[Math.floor(rand() * CONFLUENCES.length)];
      const confluences = firstTag === secondTag ? [firstTag] : [firstTag, secondTag];
      trades.push({
        id: `demo-${(id += 1)}`,
        pair,
        direction,
        entry: round(entry),
        exit: round(exit),
        stopLoss: round(short ? entry + stopDistance : entry - stopDistance),
        takeProfit: round(short ? entry - stopDistance * 2.5 : entry + stopDistance * 2.5),
        lotSize: Number((0.2 + rand() * 2).toFixed(2)),
        pnl,
        rr: Number((breakeven ? 0 : move / stopDistance).toFixed(2)),
        status: "closed",
        playbook: setup,
        strategy: setup,
        confluences,
        commission: Number((0.4 + rand() * 2.6).toFixed(2)),
        swap: 0,
        reviewed: rand() > 0.32,
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
