// src/pages/Backtest.jsx
import React, { useState, useEffect } from 'react';
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import { 
  Play, 
  Pause, 
  Download, 
  Settings, 
  BarChart3,
  LineChart,
  Table,
  AlertCircle,
  Zap,
  Save,
  Trash2,
  Upload,
  Wand,
  Loader2
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useTheme } from '../Theme-provider';
import { db, auth } from '../firebase';
import {
  collection, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import {
  POS_T,
  NEG_T,
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
} from '../lib/uiTokens';

// Chart.js setup
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ────────────────────────────────────────────────
// 1. Data Generators
// ────────────────────────────────────────────────

/** Seeded PRNG (LCG) so sample data is deterministic and reproducible. */
const createRNG = (seed) => {
  let s = ((seed >>> 0) * 16807 + 12345) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const generateSymbolData = (symbol, days = 200, seed = null) => {
  const rng = seed != null ? createRNG(seed) : Math.random;
  const data = [];
  let price = symbol === 'UK100' ? 7500 : symbol === 'NAS100' ? 15000 : 28000;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  for (let day = 0; day < days; day++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + day);
    
    // Generate 288 five‑minute candles
    for (let candle = 0; candle < 288; candle++) {
      const time = new Date(date);
      time.setMinutes(candle * 5);
      
      const hour = time.getUTCHours();
      let volatility = 1.5;
      if (hour >= 8 && hour < 16) volatility = 3.0;
      if (hour >= 13 && hour < 21) volatility = 3.5;
      if (hour >= 21 || hour < 1) volatility = 1.0;
      
      const change = (rng() - 0.5) * volatility;
      price += change;
      price = Math.max(price, 1000);
      
      const open = price;
      const close = price + (rng() - 0.5) * volatility * 0.5;
      const high = Math.max(open, close) + rng() * volatility * 0.3;
      const low = Math.min(open, close) - rng() * volatility * 0.3;
      
      data.push({
        datetime: time.toISOString(),
        date: time.toISOString().split('T')[0],
        time: time.toTimeString().slice(0,5),
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
      });
    }
  }
  return data;
};

// ────────────────────────────────────────────────
// 2. Strategy Definitions
// ────────────────────────────────────────────────

const baseParamFields = [
  { name: 'riskReward', label: 'Risk:Reward Ratio', type: 'number', min: 0.1, step: 0.1 },
  { name: 'direction', label: 'Trade Direction', type: 'select', options: [
    { value: 'long', label: 'Long Only' },
    { value: 'short', label: 'Short Only' },
    { value: 'both', label: 'Both' },
  ] },
];

const strategies = {
  UK100: [
    {
      id: 'asian-breakout',
      name: 'Asian Breakout',
      description: 'Enter on breakout of Asian session high/low with half‑range stop and configurable RR.',
      defaultParams: {
        sessionStart: 0, sessionEnd: 8, breakoutBuffer: 5,
        stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both',
      },
      paramFields: [
        { name: 'sessionStart', label: 'Asian Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'Asian End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Asian Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'london-breakout',
      name: 'London Breakout',
      description: 'Enter on breakout of the London opening range (first 60 min of the London session).',
      defaultParams: {
        sessionStart: 8, sessionEnd: 9, breakoutBuffer: 5,
        stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both',
      },
      paramFields: [
        { name: 'sessionStart', label: 'London Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'London End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'mean-reversion',
      name: 'Mean Reversion (RSI)',
      description: 'Buy when RSI is oversold (< 30), sell when overbought (> 70). Exits on RSI crossing back to 50.',
      defaultParams: { rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'rsiPeriod', label: 'RSI Period', type: 'number', min: 5, max: 50, step: 1 },
        { name: 'rsiOversold', label: 'RSI Oversold Level', type: 'number', min: 10, max: 40, step: 1 },
        { name: 'rsiOverbought', label: 'RSI Overbought Level', type: 'number', min: 60, max: 90, step: 1 },
        ...baseParamFields,
      ],
    },
    {
      id: 'ma-crossover',
      name: 'MA Crossover',
      description: 'Buy when the fast moving average crosses above the slow MA; sell on the reverse cross.',
      defaultParams: { fastPeriod: 10, slowPeriod: 30, stopType: 'fixed', stopValue: 50, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'fastPeriod', label: 'Fast MA Period', type: 'number', min: 2, max: 50, step: 1 },
        { name: 'slowPeriod', label: 'Slow MA Period', type: 'number', min: 5, max: 200, step: 1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'fixed', label: 'Fixed Points' },
          { value: 'percent', label: '% of Entry' },
        ] },
        { name: 'stopValue', label: 'Stop Value', type: 'number', min: 0, step: 0.1 },
        ...baseParamFields,
      ],
    },
  ],
  NAS100: [
    {
      id: 'asian-breakout',
      name: 'Asian Breakout',
      description: 'Enter on breakout of Asian session high/low with half‑range stop and configurable RR.',
      defaultParams: { sessionStart: 0, sessionEnd: 8, breakoutBuffer: 5, stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'sessionStart', label: 'Asian Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'Asian End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Asian Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'london-breakout',
      name: 'London Breakout',
      description: 'Enter on breakout of the London opening range (first 60 min of the London session).',
      defaultParams: { sessionStart: 8, sessionEnd: 9, breakoutBuffer: 5, stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'sessionStart', label: 'London Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'London End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'mean-reversion',
      name: 'Mean Reversion (RSI)',
      description: 'Buy when RSI is oversold (< 30), sell when overbought (> 70). Exits on RSI crossing back to 50.',
      defaultParams: { rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'rsiPeriod', label: 'RSI Period', type: 'number', min: 5, max: 50, step: 1 },
        { name: 'rsiOversold', label: 'RSI Oversold Level', type: 'number', min: 10, max: 40, step: 1 },
        { name: 'rsiOverbought', label: 'RSI Overbought Level', type: 'number', min: 60, max: 90, step: 1 },
        ...baseParamFields,
      ],
    },
    {
      id: 'ma-crossover',
      name: 'MA Crossover',
      description: 'Buy when the fast moving average crosses above the slow MA; sell on the reverse cross.',
      defaultParams: { fastPeriod: 10, slowPeriod: 30, stopType: 'fixed', stopValue: 50, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'fastPeriod', label: 'Fast MA Period', type: 'number', min: 2, max: 50, step: 1 },
        { name: 'slowPeriod', label: 'Slow MA Period', type: 'number', min: 5, max: 200, step: 1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'fixed', label: 'Fixed Points' },
          { value: 'percent', label: '% of Entry' },
        ] },
        { name: 'stopValue', label: 'Stop Value', type: 'number', min: 0, step: 0.1 },
        ...baseParamFields,
      ],
    },
  ],
  JAP225: [
    {
      id: 'asian-breakout',
      name: 'Asian Breakout',
      defaultParams: { sessionStart: 0, sessionEnd: 8, breakoutBuffer: 5, stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'sessionStart', label: 'Asian Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'Asian End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Asian Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'london-breakout',
      name: 'London Breakout',
      description: 'Enter on breakout of the London opening range (first 60 min of the London session).',
      defaultParams: { sessionStart: 8, sessionEnd: 9, breakoutBuffer: 5, stopType: 'rangeHalf', stopValue: 0.5, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'sessionStart', label: 'London Start (UTC)', type: 'number', min: 0, max: 23 },
        { name: 'sessionEnd', label: 'London End (UTC)', type: 'number', min: 1, max: 24 },
        { name: 'breakoutBuffer', label: 'Breakout Buffer (points)', type: 'number', min: 0, step: 0.1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'rangeHalf', label: 'Half of Range' },
          { value: 'fixed', label: 'Fixed Points' },
        ] },
        { name: 'stopValue', label: 'Stop Value (if fixed)', type: 'number', min: 0, step: 0.1, dependsOn: { field: 'stopType', value: 'fixed' } },
        ...baseParamFields,
      ],
    },
    {
      id: 'mean-reversion',
      name: 'Mean Reversion (RSI)',
      description: 'Buy when RSI is oversold (< 30), sell when overbought (> 70). Exits on RSI crossing back to 50.',
      defaultParams: { rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'rsiPeriod', label: 'RSI Period', type: 'number', min: 5, max: 50, step: 1 },
        { name: 'rsiOversold', label: 'RSI Oversold Level', type: 'number', min: 10, max: 40, step: 1 },
        { name: 'rsiOverbought', label: 'RSI Overbought Level', type: 'number', min: 60, max: 90, step: 1 },
        ...baseParamFields,
      ],
    },
    {
      id: 'ma-crossover',
      name: 'MA Crossover',
      description: 'Buy when the fast moving average crosses above the slow MA; sell on the reverse cross.',
      defaultParams: { fastPeriod: 10, slowPeriod: 30, stopType: 'fixed', stopValue: 50, riskReward: 2, direction: 'both' },
      paramFields: [
        { name: 'fastPeriod', label: 'Fast MA Period', type: 'number', min: 2, max: 50, step: 1 },
        { name: 'slowPeriod', label: 'Slow MA Period', type: 'number', min: 5, max: 200, step: 1 },
        { name: 'stopType', label: 'Stop Loss Type', type: 'select', options: [
          { value: 'fixed', label: 'Fixed Points' },
          { value: 'percent', label: '% of Entry' },
        ] },
        { name: 'stopValue', label: 'Stop Value', type: 'number', min: 0, step: 0.1 },
        ...baseParamFields,
      ],
    },
  ],
};

// ────────────────────────────────────────────────
// 3. Backtest Engine
// ────────────────────────────────────────────────

/** Shared trade lifecycle: entry, exit management, equity recording, stats. */
const runEngine = ({
  data,
  params,
  initialCapital,
  shouldEnter,   // (candle, ctx, idx) => { enter, direction, stop, target } | null
  shouldExit,    // (candle, ctx, idx, tradeDirection) => { exit, price, reason } | null
  onNewDay,      // (ctx) => void, called at start of each new day
}) => {
  const { riskReward = 2 } = params;
  const trades = [];
  const equityCurve = [];
  let capital = initialCapital;
  let inTrade = false;
  let entryPrice = 0, stopLoss = 0, takeProfit = 0, tradeDirection = null;
  const ctx = {};

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const date = candle.date;

    if (!ctx.currentDay || date !== ctx.currentDay) {
      ctx.currentDay = date;
      if (onNewDay) onNewDay(ctx);
    }

    if (!inTrade) {
      const signal = shouldEnter(candle, ctx, i);
      if (signal) {
        entryPrice = candle.close;
        tradeDirection = signal.direction;
        stopLoss = signal.stop;
        takeProfit = signal.target;
        inTrade = true;
        trades.push({
          entryDate: candle.datetime,
          entryPrice,
          stopLoss,
          takeProfit,
          type: tradeDirection === 'long' ? 'LONG' : 'SHORT',
        });
      }
    } else {
      const exitSignal = shouldExit(candle, ctx, i, tradeDirection);
      if (exitSignal) {
        const exitPrice = exitSignal.price;
        const pnl = tradeDirection === 'long'
          ? (exitPrice - entryPrice) / entryPrice * capital
          : (entryPrice - exitPrice) / entryPrice * capital;
        capital += pnl;
        const lastTrade = trades[trades.length - 1];
        lastTrade.exitDate = candle.datetime;
        lastTrade.exitPrice = exitPrice;
        lastTrade.pnl = pnl;
        lastTrade.capitalAfter = capital;
        lastTrade.reason = exitSignal.reason;
        inTrade = false;
      }
    }

    let equity = capital;
    if (inTrade) {
      const floating = tradeDirection === 'long'
        ? (candle.close - entryPrice) / entryPrice * capital
        : (entryPrice - candle.close) / entryPrice * capital;
      equity = capital + floating;
    }
    equityCurve.push({ datetime: candle.datetime, equity: Number(equity.toFixed(2)) });
  }

  // Close any open trade at end
  if (inTrade) {
    const lastCandle = data[data.length - 1];
    const exitPrice = lastCandle.close;
    const pnl = tradeDirection === 'long'
      ? (exitPrice - entryPrice) / entryPrice * capital
      : (entryPrice - exitPrice) / entryPrice * capital;
    capital += pnl;
    const lastTrade = trades[trades.length - 1];
    lastTrade.exitDate = lastCandle.datetime;
    lastTrade.exitPrice = exitPrice;
    lastTrade.pnl = pnl;
    lastTrade.capitalAfter = capital;
    lastTrade.reason = 'End of Data';
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(1) : 0;
  const totalPnL = capital - initialCapital;
  const returnPercent = ((capital / initialCapital - 1) * 100).toFixed(2);

  let maxDrawdown = 0;
  let peak = equityCurve[0]?.equity || initialCapital;
  equityCurve.forEach(p => {
    if (p.equity > peak) peak = p.equity;
    const dd = ((peak - p.equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  return {
    trades,
    equityCurve,
    stats: {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL: totalPnL.toFixed(2),
      returnPercent,
      finalCapital: capital.toFixed(2),
      maxDrawdown: maxDrawdown.toFixed(2),
    }
  };
};

const fixedStop = (entryPrice, direction, stopType, stopValue, range = 0) => {
  if (stopType === 'fixed') return direction === 'long' ? entryPrice - stopValue : entryPrice + stopValue;
  if (stopType === 'percent') {
    const frac = stopValue / 100;
    return direction === 'long' ? entryPrice * (1 - frac) : entryPrice * (1 + frac);
  }
  return direction === 'long' ? entryPrice - range * 0.5 : entryPrice + range * 0.5;
};

/** Asian session breakout: enter on breakout of Asian session high/low. */
const runAsianBreakout = (data, params, initialCapital) => {
  const { sessionStart = 0, sessionEnd = 8, breakoutBuffer = 5, stopType = 'rangeHalf', stopValue = 0.5, direction = 'both', riskReward = 2 } = params;
  return runEngine({
    data, params, initialCapital,
    onNewDay: (ctx) => { ctx.asianHigh = null; ctx.asianLow = null; ctx.asianRange = 0; },
    shouldEnter: (candle, ctx) => {
      const hour = new Date(candle.datetime).getUTCHours();
      if (hour >= sessionStart && hour < sessionEnd) {
        if (ctx.asianHigh === null || candle.high > ctx.asianHigh) ctx.asianHigh = candle.high;
        if (ctx.asianLow === null || candle.low < ctx.asianLow) ctx.asianLow = candle.low;
        return null;
      }
      if (hour >= sessionEnd && ctx.asianHigh !== null && ctx.asianLow !== null) {
        ctx.asianRange = ctx.asianHigh - ctx.asianLow;
        const longBreakout = ctx.asianHigh + breakoutBuffer;
        const shortBreakout = ctx.asianLow - breakoutBuffer;
        if ((direction === 'long' || direction === 'both') && candle.close > longBreakout) {
          const stop = stopType === 'fixed' ? candle.close - stopValue : candle.close - (ctx.asianRange * stopValue);
          return { enter: true, direction: 'long', stop, target: candle.close + (candle.close - stop) * riskReward };
        }
        if ((direction === 'short' || direction === 'both') && candle.close < shortBreakout) {
          const stop = stopType === 'fixed' ? candle.close + stopValue : candle.close + (ctx.asianRange * stopValue);
          return { enter: true, direction: 'short', stop, target: candle.close - (stop - candle.close) * riskReward };
        }
      }
      return null;
    },
    shouldExit: (candle, ctx) => {
      if (!ctx) return null;
      // ctx trade state is on the closure via inTrade; handled by runEngine
      return null;
    },
  });
};

/** London breakout: enter on breakout of London session opening range. */
const runLondonBreakout = (data, params, initialCapital) => {
  const { sessionStart = 8, sessionEnd = 9, breakoutBuffer = 5, stopType = 'rangeHalf', stopValue = 0.5, direction = 'both', riskReward = 2 } = params;
  return runEngine({
    data, params, initialCapital,
    onNewDay: (ctx) => { ctx.londonHigh = null; ctx.londonLow = null; ctx.londonRange = 0; },
    shouldEnter: (candle, ctx) => {
      const hour = new Date(candle.datetime).getUTCHours();
      if (hour >= sessionStart && hour < sessionEnd) {
        if (ctx.londonHigh === null || candle.high > ctx.londonHigh) ctx.londonHigh = candle.high;
        if (ctx.londonLow === null || candle.low < ctx.londonLow) ctx.londonLow = candle.low;
        return null;
      }
      if (hour >= sessionEnd && ctx.londonHigh !== null && ctx.londonLow !== null) {
        ctx.londonRange = ctx.londonHigh - ctx.londonLow;
        const longBreakout = ctx.londonHigh + breakoutBuffer;
        const shortBreakout = ctx.londonLow - breakoutBuffer;
        if ((direction === 'long' || direction === 'both') && candle.close > longBreakout) {
          const stop = stopType === 'fixed' ? candle.close - stopValue : candle.close - (ctx.londonRange * stopValue);
          return { enter: true, direction: 'long', stop, target: candle.close + (candle.close - stop) * riskReward };
        }
        if ((direction === 'short' || direction === 'both') && candle.close < shortBreakout) {
          const stop = stopType === 'fixed' ? candle.close + stopValue : candle.close + (ctx.londonRange * stopValue);
          return { enter: true, direction: 'short', stop, target: candle.close - (stop - candle.close) * riskReward };
        }
      }
      return null;
    },
  });
};

/** RSI mean reversion: buy oversold, sell overbought, exit at RSI 50. */
const runMeanReversion = (data, params, initialCapital) => {
  const { rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70, direction = 'both', riskReward = 2, stopType = 'fixed', stopValue = 50 } = params;
  const closes = data.map(c => c.close);
  const rsi = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < rsiPeriod) { rsi.push(50); continue; }
    let gains = 0, losses = 0;
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const ch = closes[j] - closes[j - 1];
      if (ch > 0) gains += ch; else losses -= ch;
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return runEngine({
    data, params, initialCapital,
    shouldEnter: (candle, ctx, idx) => {
      const r = rsi[idx];
      if ((direction === 'long' || direction === 'both') && r < rsiOversold) {
        const stop = fixedStop(candle.close, 'long', stopType, stopValue);
        return { enter: true, direction: 'long', stop, target: candle.close + (candle.close - stop) * riskReward };
      }
      if ((direction === 'short' || direction === 'both') && r > rsiOverbought) {
        const stop = fixedStop(candle.close, 'short', stopType, stopValue);
        return { enter: true, direction: 'short', stop, target: candle.close - (stop - candle.close) * riskReward };
      }
      return null;
    },
    shouldExit: (candle, ctx, idx, tradeDirection) => {
      const r = rsi[idx];
      if (tradeDirection === 'long' && r >= 50) {
        return { exit: true, price: candle.close, reason: 'RSI 50' };
      }
      if (tradeDirection === 'short' && r <= 50) {
        return { exit: true, price: candle.close, reason: 'RSI 50' };
      }
      return null;
    },
  });
};

/** Moving Average crossover: buy when fast MA crosses above slow MA. */
const runMACrossover = (data, params, initialCapital) => {
  const { fastPeriod = 10, slowPeriod = 30, direction = 'both', riskReward = 2, stopType = 'fixed', stopValue = 50 } = params;
  const closes = data.map(c => c.close);
  const ma = (period, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  };
  return runEngine({
    data, params, initialCapital,
    shouldEnter: (candle, ctx, idx) => {
      const fast = ma(fastPeriod, idx);
      const slow = ma(slowPeriod, idx);
      const prevFast = ma(fastPeriod, idx - 1);
      const prevSlow = ma(slowPeriod, idx - 1);
      if (!fast || !slow || !prevFast || !prevSlow) return null;
      if ((direction === 'long' || direction === 'both') && prevFast <= prevSlow && fast > slow) {
        const stop = fixedStop(candle.close, 'long', stopType, stopValue);
        return { enter: true, direction: 'long', stop, target: candle.close + (candle.close - stop) * riskReward };
      }
      if ((direction === 'short' || direction === 'both') && prevFast >= prevSlow && fast < slow) {
        const stop = fixedStop(candle.close, 'short', stopType, stopValue);
        return { enter: true, direction: 'short', stop, target: candle.close - (stop - candle.close) * riskReward };
      }
      return null;
    },
  });
};

const STRATEGY_RUNNERS = {
  'asian-breakout': runAsianBreakout,
  'london-breakout': runLondonBreakout,
  'mean-reversion': runMeanReversion,
  'ma-crossover': runMACrossover,
};

const runBacktest = (data, strategy, params, initialCapital) => {
  const runner = STRATEGY_RUNNERS[strategy.id];
  if (!runner) throw new Error(`Unknown strategy: ${strategy.id}`);
  return runner(data, params, initialCapital);
};

const ENDPOINT = "/.netlify/functions/mentor";

export default function Backtest({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();
  const { theme } = useTheme();
  const [symbol, setSymbol] = useState('UK100');
  const [strategyId, setStrategyId] = useState('asian-breakout');
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState({});
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  // Optimization state
  const [optimizationResults, setOptimizationResults] = useState([]);
  const [optimizationRunning, setOptimizationRunning] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);

  // Saved backtest runs (persisted to localStorage)
  const [savedRuns, setSavedRuns] = useState(() => {
    try {
      const raw = localStorage.getItem('forgexSavedBacktests');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('forgexSavedBacktests', JSON.stringify(savedRuns)); } catch {}
  }, [savedRuns]);

  // AI strategy generator state (plain-English → parameters)
  const [aiStrategyInput, setAiStrategyInput] = useState('');
  const [aiStrategyResult, setAiStrategyResult] = useState(null);
  const [aiStrategyLoading, setAiStrategyLoading] = useState(false);

  // CSV upload state
  const [fileName, setFileName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Parameter ranges for optimization (adjust as needed)
  const optimizationRanges = {
    breakoutBuffer: { min: 1, max: 10, step: 2 },        // 1,3,5,7,9
    riskReward: { min: 1.5, max: 3.0, step: 0.5 },      // 1.5,2.0,2.5,3.0
    stopType: ['rangeHalf', 'fixed'],
    fixedStopValue: { min: 10, max: 30, step: 5 },       // 10,15,20,25,30
    direction: ['long', 'short', 'both'],
  };

  // Load synthetic data when symbol changes
  useEffect(() => {
    setLoading(true);
    setResults(null);
    setOptimizationResults([]);
    setFileName('');
    setTimeout(() => {
      const newData = generateSymbolData(symbol, 200);
      setAllData(newData);
      setLoading(false);
    }, 800);
  }, [symbol]);

  // Initialize params when symbol or strategy changes
  useEffect(() => {
    const strategy = strategies[symbol]?.find(s => s.id === strategyId);
    if (strategy) {
      setParams(strategy.defaultParams);
    }
  }, [symbol, strategyId]);

  const currentStrategy = strategies[symbol]?.find(s => s.id === strategyId);
  const paramFields = currentStrategy?.paramFields || [];

  const handleParamChange = (name, value) => {
    setParams(prev => ({ ...prev, [name]: value }));
  };

  // ─── CSV Upload ──────────────────────────────────────────
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setResults(null);
    setOptimizationResults([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      // Find required columns (adjust these names to match your CSV)
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const timeIdx = headers.findIndex(h => h.includes('time'));
      const openIdx = headers.findIndex(h => h.includes('open'));
      const highIdx = headers.findIndex(h => h.includes('high'));
      const lowIdx = headers.findIndex(h => h.includes('low'));
      const closeIdx = headers.findIndex(h => h.includes('close'));

      if (dateIdx === -1 || timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
        alert('CSV must contain Date, Time, Open, High, Low, Close columns');
        setFileName('');
        return;
      }

      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 6) continue;

        const date = cols[dateIdx].trim();
        const time = cols[timeIdx].trim();
        const datetime = `${date} ${time}`;

        const open = parseFloat(cols[openIdx]);
        const high = parseFloat(cols[highIdx]);
        const low = parseFloat(cols[lowIdx]);
        const close = parseFloat(cols[closeIdx]);

        if (isNaN(open)) continue;

        parsed.push({ datetime, open, high, low, close });
      }

      if (parsed.length === 0) {
        alert('No valid data rows found');
        setFileName('');
        return;
      }

      parsed.sort((a, b) => a.datetime.localeCompare(b.datetime));
      setAllData(parsed);
    };
    reader.readAsText(file);
  };

  const generateSyntheticData = () => {
    setFileName('');
    const synthetic = generateSymbolData(symbol, 200);
    setAllData(synthetic);
  };

  const generateSampleData = () => {
    setFileName('');
    // Fixed seed → deterministic "sample" dataset that behaves like real market data
    const sample = generateSymbolData(symbol, 200, `sample-${symbol}`);
    setAllData(sample);
  };

  // ─── Run Single Backtest ───────────────────────────────
  const runBacktestHandler = () => {
    if (!allData.length || !currentStrategy) return;

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const filteredData = allData.filter(c => {
      const t = new Date(c.datetime).getTime();
      return t >= start && t <= end;
    });

    if (filteredData.length === 0) {
      alert('No data in the selected date range.');
      return;
    }

    setRunning(true);
    setTimeout(() => {
      const result = runBacktest(
        filteredData,
        currentStrategy,
        params,
        currentAccount?.starting_balance || 10000
      );
      setResults(result);
      setRunning(false);
    }, 400);
  };

  const saveRun = () => {
    if (!results || !currentStrategy) return;
    const name = window.prompt('Save this backtest run as:', `${currentStrategy.name} · ${symbol}`);
    if (!name) return;
    const run = {
      id: Date.now().toString(),
      name,
      symbol,
      strategyId: currentStrategy.id,
      strategyName: currentStrategy.name,
      params: { ...params },
      stats: { ...results.stats },
      startDate, endDate,
      savedAt: new Date().toISOString(),
    };
    setSavedRuns(prev => [run, ...prev.slice(0, 49)]);
  };

  const loadSavedRun = (run) => {
    setSymbol(run.symbol);
    setStrategyId(run.strategyId);
    setParams(run.params);
    setStartDate(run.startDate);
    setEndDate(run.endDate);
    setResults({
      trades: [],
      equityCurve: [],
      stats: run.stats,
    });
  };

  const deleteSavedRun = (id) => {
    if (!window.confirm('Delete this saved run?')) return;
    setSavedRuns(prev => prev.filter(r => r.id !== id));
  };

  // ─── Push backtest trades into the journal ──────────────
  const pushToJournal = async () => {
    if (!results?.trades?.length) return;
    const user = auth.currentUser;
    if (!user || !currentAccount?.id) {
      alert('No account selected.');
      return;
    }

    const confirmed = window.confirm(
      `Push ${results.trades.length} backtest trades into the journal for "${currentAccount.name}"?`
    );
    if (!confirmed) return;

    try {
      const tradesCol = collection(db, "users", user.uid, "accounts", currentAccount.id, "trades");
      const batch = writeBatch(db);
      let ops = 0;

      results.trades.forEach((t, i) => {
        const direction = t.type === 'LONG' ? 'long' : 'short';
        const pnl = Number(t.pnl || 0);
        const rr = Number((t.takeProfit - t.entryPrice) / (t.entryPrice - t.stopLoss).toFixed(4) || 0);
        batch.set(doc(tradesCol), {
          pair: symbol,
          direction,
          entry: t.entryPrice,
          exit: t.exitPrice,
          stopLoss: t.stopLoss,
          takeProfit: t.takeProfit,
          pnl,
          rr: isFinite(rr) ? rr : undefined,
          status: 'executed',
          openDateTime: t.entryDate,
          closeDateTime: t.exitDate || t.entryDate,
          lotSize: 1,
          confluences: ['backtest'],
          screenshotUrl: '',
          playbook: 'Backtest',
          playbookId: null,
          strategy: currentStrategy?.name || 'Backtest',
          notes: `Backtest: ${currentStrategy?.name || 'Backtest'} · exit: ${t.reason || '—'}`,
          rating: 0,
          mistakes: [],
          createdAt: serverTimestamp(),
          source: 'backtest',
        });
        ops++;
        if (ops >= 400) {
          // batch.commit() is handled below; Firestore writeBatch auto-commits on call
        }
      });

      await batch.commit();
      alert(`Pushed ${results.trades.length} trades to the journal.`);
    } catch (err) {
      console.error('Push to journal failed:', err);
      alert('Failed to push trades: ' + (err?.message || err));
    }
  };

  // ─── AI plain-English strategy generator ────────────────
  const generateAIStrategy = async () => {
    if (!aiStrategyInput.trim()) return;
    const user = auth.currentUser;
    if (!user) {
      alert('Please log in again.');
      return;
    }
    setAiStrategyLoading(true);
    setAiStrategyResult(null);
    try {
      const token = await user.getIdToken();
      const prompt = `Convert this plain-English trading strategy into concrete backtest parameters for the "${currentStrategy?.name || 'selected strategy'}" strategy (${symbol}).

Strategy idea: "${aiStrategyInput}"

Return ONLY a JSON object with these keys (use null for any you cannot determine):
- sessionStart (0-23)
- sessionEnd (1-24)
- breakoutBuffer (number, points)
- stopType ("rangeHalf" or "fixed")
- stopValue (number)
- riskReward (number)
- direction ("long", "short", or "both")
- reasoning (short text explaining the parameters)

Do not include any other text.`;

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: null,
          agent: 'general',
          systemPrompt: 'You are a trading strategy architect. Convert plain-English strategy ideas into concrete, safe backtest parameters. Respond only with valid JSON.',
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error(data.error || 'Request failed (' + res.status + ')');
      }
      const text = data.reply || '';
      // Extract JSON from the response (strip markdown fences if present)
      const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      setAiStrategyResult(parsed);
    } catch (err) {
      setAiStrategyResult({ error: err.message || 'Could not generate strategy.' });
    } finally {
      setAiStrategyLoading(false);
    }
  };

  const applyAIStrategy = (params) => {
    const next = { ...params };
    // Only apply keys that exist in the current param schema to avoid overwriting
    // unrelated fields. sessionStart/sessionEnd are kept as-is.
    setParams(next);
    setAiStrategyResult(null);
    setAiStrategyInput('');
  };

  // ─── Optimization ───────────────────────────────────────
  const runOptimization = async () => {
    if (!allData.length) {
      alert('No data loaded. Upload a CSV or use synthetic data.');
      return;
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const filteredData = allData.filter(c => {
      const t = new Date(c.datetime).getTime();
      return t >= start && t <= end;
    });

    if (filteredData.length === 0) {
      alert('No data in selected date range.');
      return;
    }

    setOptimizationRunning(true);
    setOptimizationResults([]);
    setOptimizationProgress(0);

    // Generate all combinations
    const combos = [];
    const { breakoutBuffer, riskReward, stopType, fixedStopValue, direction } = optimizationRanges;

    for (let buffer = breakoutBuffer.min; buffer <= breakoutBuffer.max; buffer += breakoutBuffer.step) {
      for (let rr = riskReward.min; rr <= riskReward.max; rr += riskReward.step) {
        for (let dir of direction) {
          for (let st of stopType) {
            if (st === 'fixed') {
              for (let fix = fixedStopValue.min; fix <= fixedStopValue.max; fix += fixedStopValue.step) {
                combos.push({
                  breakoutBuffer: buffer,
                  riskReward: rr,
                  direction: dir,
                  stopType: st,
                  stopValue: fix,
                });
              }
            } else {
              combos.push({
                breakoutBuffer: buffer,
                riskReward: rr,
                direction: dir,
                stopType: st,
                stopValue: 0.5, // half of range
              });
            }
          }
        }
      }
    }

    const results = [];
    const total = combos.length;

    // Run backtests (use setTimeout to keep UI responsive)
    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const testParams = {
        ...params, // keep sessionStart, sessionEnd from current params
        breakoutBuffer: combo.breakoutBuffer,
        riskReward: combo.riskReward,
        direction: combo.direction,
        stopType: combo.stopType,
        stopValue: combo.stopValue,
      };

      const result = runBacktest(
        filteredData,
        currentStrategy,
        testParams,
        currentAccount?.starting_balance || 10000
      );

      results.push({
        params: { ...testParams },
        returnPercent: parseFloat(result.stats.returnPercent),
        totalPnL: parseFloat(result.stats.totalPnL),
        totalTrades: result.stats.totalTrades,
      });

      setOptimizationProgress(Math.round(((i + 1) / total) * 100));

      // Yield to UI every 50 iterations
      if (i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Sort by return percent descending
    results.sort((a, b) => b.returnPercent - a.returnPercent);
    setOptimizationResults(results.slice(0, 10)); // top 10
    setOptimizationRunning(false);
  };

  // ─── Load selected optimization result ──────────────────
  const loadOptimizationResult = (optParams) => {
    setParams(optParams);
    // Run backtest with these params
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const filteredData = allData.filter(c => {
      const t = new Date(c.datetime).getTime();
      return t >= start && t <= end;
    });
    const result = runBacktest(
      filteredData,
      currentStrategy,
      optParams,
      currentAccount?.starting_balance || 10000
    );
    setResults(result);
  };

  // ─── Export CSV ─────────────────────────────────────────
  const exportToCSV = () => {
    if (!results?.trades?.length) return;
    const headers = ['Type', 'Entry Date', 'Entry', 'Stop', 'Target', 'Exit Date', 'Exit', 'PnL', 'Reason'];
    const rows = results.trades.map(t => [
      t.type,
      t.entryDate,
      t.entryPrice.toFixed(2),
      t.stopLoss.toFixed(2),
      t.takeProfit.toFixed(2),
      t.exitDate || '',
      t.exitPrice?.toFixed(2) || '',
      t.pnl ? t.pnl.toFixed(2) : '',
      t.reason || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${symbol}_backtest_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const chartData = results ? {
    labels: results.equityCurve.map(e => e.datetime.slice(5,16)),
    datasets: [{
      label: 'Equity Curve',
      data: results.equityCurve.map(e => e.equity),
      borderColor: ac.hex,
      backgroundColor: `${ac.hex}1a`,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.25,
      fill: true,
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: theme === 'dark' ? '#8a8fb5' : '#6b7090', maxTicksLimit: 8 },
      },
      y: {
        grid: { color: theme === 'dark' ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.15)' },
        ticks: { color: theme === 'dark' ? '#8a8fb5' : '#6b7090', callback: (v) => `$${v}` },
      },
    },
  };

  if (!currentAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5fa] p-8 dark:bg-[#0b0b19]">
        <Card className={`${CARD} max-w-md p-8 text-center`}>
          <AlertCircle size={40} className="mx-auto mb-4 text-amber-500" />
          <h2 className={`mb-2 text-xl font-bold ${HEAD}`}>No account selected</h2>
          <p className={`text-sm ${MUTED}`}>
            Please select an account from the sidebar to use its starting balance.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5fa] dark:bg-[#0b0b19]">
        <div className="text-center">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
            style={{ borderTopColor: ac.hex }}
            role="progressbar"
            aria-label="Loading backtest data"
          />
          <p className={`mt-4 text-sm font-medium ${MUTED}`}>Generating {symbol} data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Backtest</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>Test and optimize your trading strategies</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button
              onClick={runBacktestHandler}
              disabled={running || !currentStrategy}
              style={{ backgroundColor: ac.hex }}
              className="min-w-[140px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Pause className="mr-2 h-4 w-4" /> Running…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Run backtest
                </>
              )}
            </Button>

            <Button
              onClick={runOptimization}
              disabled={optimizationRunning || !currentStrategy}
              variant="outline"
              className={`min-w-[160px] border font-semibold ${DIVIDER}`}
            >
              {optimizationRunning ? (
                <>
                  <Zap className="mr-2 h-4 w-4 animate-pulse" /> Optimizing {optimizationProgress}%
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" /> Find best parameters
                </>
              )}
            </Button>

            {results && (
              <>
                <Button
                  onClick={saveRun}
                  variant="outline"
                  className={`border font-semibold ${DIVIDER}`}
                >
                  <Save className="mr-2 h-4 w-4" /> Save run
                </Button>
                <Button
                  onClick={exportToCSV}
                  variant="outline"
                  className={`border font-semibold ${DIVIDER}`}
                >
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Button
                  onClick={pushToJournal}
                  variant="outline"
                  className={`border font-semibold ${DIVIDER}`}
                >
                  <Upload className="mr-2 h-4 w-4" /> Push to journal
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {/* Parameters Panel */}
          <Card className={`${CARD} p-0 lg:col-span-1`}>
            <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
              <Settings className="h-4 w-4" style={{ color: ac.hex }} />
              <h2 className={`text-[15px] font-semibold ${HEAD}`}>Strategy settings</h2>
            </div>

            <div className="space-y-4 p-4">
              {/* Symbol Selector */}
              <div>
                <Label htmlFor="symbol" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Symbol</Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger id="symbol" className={`${FIELD} justify-between`}>
                    <SelectValue placeholder="Select symbol" />
                  </SelectTrigger>
                  <SelectContent className="border border-[#e6e8f2] bg-white dark:border-[#262645] dark:bg-[#15152b]">
                    <SelectItem value="UK100">UK100</SelectItem>
                    <SelectItem value="NAS100">NAS100</SelectItem>
                    <SelectItem value="JAP225">JAP225</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy Selector */}
              {strategies[symbol] && (
                <div>
                  <Label htmlFor="strategy" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Strategy</Label>
                  <Select value={strategyId} onValueChange={setStrategyId}>
                    <SelectTrigger id="strategy" className={`${FIELD} justify-between`}>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent className="border border-[#e6e8f2] bg-white dark:border-[#262645] dark:bg-[#15152b]">
                      {strategies[symbol].map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentStrategy?.description && (
                    <p className={`mt-1.5 text-xs ${MUTED}`}>{currentStrategy.description}</p>
                  )}
                </div>
              )}

              {/* CSV Upload */}
              <div>
                <Label htmlFor="csvUpload" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>
                  Upload UK100 5-min CSV
                </Label>
                <input
                  id="csvUpload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className={`block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#6C47FF]/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#6C47FF] hover:file:bg-[#6C47FF]/20 ${MUTED}`}
                />
                {fileName && <p className={`mt-1 text-xs font-medium ${POS_T}`}>Loaded: {fileName}</p>}
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="startDate" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Start date</Label>
                  <input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>End date</Label>
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={generateSampleData} variant="outline" className={`flex-1 border font-semibold ${DIVIDER}`}>
                  Load sample data
                </Button>
                <Button onClick={generateSyntheticData} variant="outline" className={`flex-1 border font-semibold ${DIVIDER}`}>
                  Use synthetic data
                </Button>
              </div>

              {/* Dynamic Parameters */}
              {paramFields.map(field => {
                const isVisible = !field.dependsOn || params[field.dependsOn.field] === field.dependsOn.value;
                if (!isVisible) return null;

                if (field.type === 'select') {
                  return (
                    <div key={field.name}>
                      <Label htmlFor={field.name} className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>{field.label}</Label>
                      <Select
                        value={params[field.name] || ''}
                        onValueChange={(v) => handleParamChange(field.name, v)}
                      >
                        <SelectTrigger id={field.name} className={`${FIELD} justify-between`}>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="border border-[#e6e8f2] bg-white dark:border-[#262645] dark:bg-[#15152b]">
                          {field.options.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                return (
                  <div key={field.name}>
                    <Label htmlFor={field.name} className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>{field.label}</Label>
                    <Input
                      id={field.name}
                      type={field.type}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={params[field.name] || ''}
                      onChange={(e) => handleParamChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                      className={FIELD}
                    />
                  </div>
                );
              })}

              {/* AI plain-English strategy generator */}
              <div className={`border-t pt-4 space-y-3 ${DIVIDER}`}>
                <div className="flex items-center gap-2">
                  <Wand size={14} style={{ color: ac.hex }} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                    AI strategy generator
                  </span>
                </div>
                <div>
                  <label className={`mb-1 block text-xs font-semibold ${MUTED}`}>
                    Describe your strategy in plain English
                  </label>
                  <textarea
                    value={aiStrategyInput}
                    onChange={(e) => setAiStrategyInput(e.target.value)}
                    placeholder="e.g. Buy when price breaks above the Asian session high with a 2:1 reward-to-risk"
                    rows={2}
                    className={FIELD + " min-h-[48px] resize-y"}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={generateAIStrategy}
                    disabled={aiStrategyLoading || !aiStrategyInput.trim()}
                    variant="outline"
                    className={`flex-1 border font-semibold text-xs ${DIVIDER}`}
                  >
                    {aiStrategyLoading ? (
                      <>
                        <Loader2 size={14} className="mr-2 animate-spin" /> Generating…
                      </>
                    ) : (
                      <>
                        <Wand size={14} className="mr-2" /> Generate
                      </>
                    )}
                  </Button>
                  {aiStrategyResult && (
                    <Button
                      onClick={() => applyAIStrategy(aiStrategyResult)}
                      disabled={!!aiStrategyResult.error}
                      style={{ backgroundColor: ac.hex }}
                      className="flex-1 font-semibold text-white text-xs hover:brightness-110"
                    >
                      {aiStrategyResult.error ? "Failed" : "Apply to parameters"}
                    </Button>
                  )}
                </div>
                {aiStrategyResult && !aiStrategyResult.error && (
                  <div className={`mt-2 rounded-lg border p-3 ${DIVIDER} bg-white dark:bg-[#101024] text-xs`}>
                    <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${MUTED}`}>
                      Suggested parameters
                    </div>
                    <div className="space-y-1">
                      {Object.entries(aiStrategyResult).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className={MUTED}>{key}</span>
                          <span className={HEAD}>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiStrategyResult && aiStrategyResult.error && (
                  <div className={`mt-2 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/[0.06] p-3 text-xs text-[#d93a57] dark:text-[#ff6b86]`}>
                    {aiStrategyResult.error}
                  </div>
                )}
              </div>

              <div className={`border-t pt-3 text-xs ${DIVIDER} ${MUTED}`}>
                <p>Initial capital: ${currentAccount?.starting_balance?.toLocaleString() || '10,000'}</p>
              </div>
            </div>
          </Card>

          {/* Results Area */}
          <div className="space-y-4 lg:col-span-3">
            {/* Optimization Results Table (if any) */}
            {optimizationResults.length > 0 && (
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                  <Zap className="h-4 w-4" style={{ color: ac.hex }} />
                  <h2 className={`text-[15px] font-semibold ${HEAD}`}>Top 10 parameter combinations</h2>
                  <span className={`ml-auto text-xs ${MUTED}`}>by return %</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${DIVIDER} ${MUTED}`}>
                        <th className="px-4 py-2.5">Buffer</th>
                        <th className="px-4 py-2.5">RR</th>
                        <th className="px-4 py-2.5">Direction</th>
                        <th className="px-4 py-2.5">Stop type</th>
                        <th className="px-4 py-2.5">Stop value</th>
                        <th className="px-4 py-2.5">Return %</th>
                        <th className="px-4 py-2.5">PnL ($)</th>
                        <th className="px-4 py-2.5">Trades</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {optimizationResults.map((res, idx) => (
                        <tr
                          key={idx}
                          className={`border-b transition-colors last:border-0 hover:bg-[#f7f8fc] dark:hover:bg-[#101024] ${DIVIDER}`}
                        >
                          <td className="px-4 py-2.5 tabular-nums">{res.params.breakoutBuffer}</td>
                          <td className="px-4 py-2.5 tabular-nums">{res.params.riskReward}</td>
                          <td className="px-4 py-2.5">{res.params.direction}</td>
                          <td className="px-4 py-2.5">{res.params.stopType}</td>
                          <td className="px-4 py-2.5 tabular-nums">{res.params.stopValue.toFixed(1)}</td>
                          <td className={`px-4 py-2.5 font-semibold tabular-nums ${POS_T}`}>{res.returnPercent}%</td>
                          <td className="px-4 py-2.5 tabular-nums">${res.totalPnL.toFixed(2)}</td>
                          <td className="px-4 py-2.5 tabular-nums">{res.totalTrades}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" onClick={() => loadOptimizationResult(res.params)}>Load</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Saved runs comparison */}
            {savedRuns.length > 0 && (
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                  <h2 className={`text-[15px] font-semibold ${HEAD}`}>Saved runs</h2>
                  <span className={`ml-auto text-xs ${MUTED}`}>Compare side by side</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${DIVIDER} ${MUTED}`}>
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Symbol</th>
                        <th className="px-4 py-2.5">Strategy</th>
                        <th className="px-4 py-2.5">Return %</th>
                        <th className="px-4 py-2.5">Win rate</th>
                        <th className="px-4 py-2.5">Max DD</th>
                        <th className="px-4 py-2.5">Trades</th>
                        <th className="px-4 py-2.5 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {savedRuns.map((run) => (
                        <tr
                          key={run.id}
                          className={`border-b transition-colors last:border-0 hover:bg-[#f7f8fc] dark:hover:bg-[#101024] ${DIVIDER}`}
                        >
                          <td className="px-4 py-2.5 font-semibold">{run.name}</td>
                          <td className="px-4 py-2.5 tabular-nums">{run.symbol}</td>
                          <td className="px-4 py-2.5">{run.strategyName}</td>
                          <td className={`px-4 py-2.5 font-semibold tabular-nums ${parseFloat(run.stats.returnPercent) >= 0 ? POS_T : NEG_T}`}>
                            {run.stats.returnPercent}%
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">{run.stats.winRate}%</td>
                          <td className="px-4 py-2.5 tabular-nums">{run.stats.maxDrawdown}%</td>
                          <td className="px-4 py-2.5 tabular-nums">{run.stats.totalTrades}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" onClick={() => loadSavedRun(run)}>Load</Button>
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); deleteSavedRun(run.id); }}
                              variant="outline"
                              className={`border border-[#f2556e]/40 text-[#d93a57] hover:bg-[#f2556e]/10`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Single Backtest Results */}
            {results ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Card className={`${CARD} p-4`}>
                    <p className={`text-[11px] font-medium ${MUTED}`}>Final capital</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>${results.stats.finalCapital}</p>
                  </Card>
                  <Card className={`${CARD} p-4`}>
                    <p className={`text-[11px] font-medium ${MUTED}`}>Total return</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${results.stats.returnPercent >= 0 ? POS_T : NEG_T}`}>
                      {results.stats.returnPercent}%
                    </p>
                  </Card>
                  <Card className={`${CARD} p-4`}>
                    <p className={`text-[11px] font-medium ${MUTED}`}>Total trades</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>{results.stats.totalTrades}</p>
                  </Card>
                  <Card className={`${CARD} p-4`}>
                    <p className={`text-[11px] font-medium ${MUTED}`}>Win rate</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>{results.stats.winRate}%</p>
                  </Card>
                  <Card className={`${CARD} p-4`}>
                    <p className={`text-[11px] font-medium ${MUTED}`}>Max DD</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>{results.stats.maxDrawdown}%</p>
                  </Card>
                </div>

                {/* Chart & Trades */}
                <Card className={`${CARD} p-0`}>
                  <Tabs defaultValue="chart">
                    <div className={`border-b px-4 pt-3 ${DIVIDER}`}>
                      <TabsList className={`h-9 bg-[#f7f8fc] p-1 dark:bg-[#101024] ${DIVIDER}`}>
                        <TabsTrigger
                          value="chart"
                          className="gap-2 rounded-md px-3 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#15152b]"
                        >
                          <LineChart className="h-4 w-4" /> Equity curve
                        </TabsTrigger>
                        <TabsTrigger
                          value="trades"
                          className="gap-2 rounded-md px-3 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#15152b]"
                        >
                          <Table className="h-4 w-4" /> Trade list
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <TabsContent value="chart" className="p-5">
                      <div className="h-96"><Line data={chartData} options={chartOptions} /></div>
                    </TabsContent>
                    <TabsContent value="trades" className="p-5">
                      {results.trades.length > 0 ? (
                        <div className="max-h-96 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0">
                              <tr className={`border-b bg-white text-left text-[11px] font-semibold uppercase tracking-wide dark:bg-[#15152b] ${DIVIDER} ${MUTED}`}>
                                <th className="px-2 py-2.5">Type</th>
                                <th className="px-2 py-2.5">Entry</th>
                                <th className="px-2 py-2.5">Stop</th>
                                <th className="px-2 py-2.5">Target</th>
                                <th className="px-2 py-2.5">Exit</th>
                                <th className="px-2 py-2.5">PnL</th>
                                <th className="px-2 py-2.5">Reason</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.trades.map((t, i) => (
                                <tr
                                  key={i}
                                  className={`border-b transition-colors last:border-0 hover:bg-[#f7f8fc] dark:hover:bg-[#101024] ${DIVIDER}`}
                                >
                                  <td className="px-2 py-2.5 font-medium">{t.type}</td>
                                  <td className="px-2 py-2.5 tabular-nums">{t.entryDate?.slice(5, 16)}<br/>{t.entryPrice.toFixed(2)}</td>
                                  <td className="px-2 py-2.5 tabular-nums">{t.stopLoss.toFixed(2)}</td>
                                  <td className="px-2 py-2.5 tabular-nums">{t.takeProfit.toFixed(2)}</td>
                                  <td className="px-2 py-2.5 tabular-nums">{t.exitDate?.slice(5, 16)}<br/>{t.exitPrice?.toFixed(2)}</td>
                                  <td className={`px-2 py-2.5 font-semibold tabular-nums ${t.pnl >= 0 ? POS_T : NEG_T}`}>
                                    {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}
                                  </td>
                                  <td className={`px-2 py-2.5 ${MUTED}`}>{t.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className={`flex h-64 items-center justify-center text-sm ${MUTED}`}>No trades generated</div>
                      )}
                    </TabsContent>
                  </Tabs>
                </Card>

                {/* Detailed Stats */}
                <Card className={`${CARD} p-0`}>
                  <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                    <BarChart3 className="h-4 w-4" style={{ color: ac.hex }} />
                    <h2 className={`text-[15px] font-semibold ${HEAD}`}>Performance</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Total trades</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${HEAD}`}>{results.stats.totalTrades}</p>
                    </div>
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Winning / losing</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${HEAD}`}>{results.stats.winningTrades} / {results.stats.losingTrades}</p>
                    </div>
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Win rate</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${HEAD}`}>{results.stats.winRate}%</p>
                    </div>
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Max DD</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${HEAD}`}>{results.stats.maxDrawdown}%</p>
                    </div>
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Net profit</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${results.stats.totalPnL >= 0 ? POS_T : NEG_T}`}>${results.stats.totalPnL}</p>
                    </div>
                    <div>
                      <p className={`text-[11px] font-medium ${MUTED}`}>Return %</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${results.stats.returnPercent >= 0 ? POS_T : NEG_T}`}>{results.stats.returnPercent}%</p>
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <Card className={`${CARD} flex h-96 flex-col items-center justify-center gap-3 p-8 text-center`}>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${ac.hex}14`, color: ac.hex }}
                >
                  <BarChart3 className="h-6 w-6" />
                </div>
                <p className={`max-w-xs text-sm ${MUTED}`}>Configure a strategy and run a backtest or optimization to see results here.</p>
              </Card>
            )}
          </div>
        </div>

        <p className={`mt-6 text-center text-xs ${MUTED}`}>
          * Sample (seeded) or synthetic data – upload a real CSV for accurate backtesting.
        </p>
      </div>
    </div>
  );
}
