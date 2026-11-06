import React from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../Theme-provider";

export default function QuantitativeAnalysis() {
  const { theme } = useTheme();
  const location = useLocation();
  const { monthlyTrades, monthlyStats } = location.state || {
    monthlyTrades: [],
    monthlyStats: { totalPnL: 0, winRate: 0, profitFactor: 0 },
  };

  return (
    <div
      className={`p-4 sm:p-6 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 ${
        theme === "dark" ? "dark" : ""
      } min-h-screen`}
    >
      <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-800 dark:text-gray-100">
        Quantitative Analysis
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Monthly Stats</h3>
          <p>Total PnL: ${monthlyStats.totalPnL.toFixed(2)}</p>
          <p>Win Rate: {monthlyStats.winRate}%</p>
          <p>Profit Factor: {monthlyStats.profitFactor}</p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Trade Breakdown</h3>
          <p>Total Trades: {monthlyTrades.length}</p>
          {/* Add more analysis as needed */}
        </div>
      </div>
    </div>
  );
}
