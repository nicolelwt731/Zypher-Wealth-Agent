// src/tools.ts
import { createTool } from "@corespeed/zypher/tools";
import { z } from "zod";
import { join } from "@std/path";
import { STOCK_DATA } from "./data/mockData.ts";

// --- 工具 1: 获取股票价格 (Mock with Rich Output) ---
export const getStockPriceTool = createTool({
  name: "get_stock_price",
  description: "Get the current stock price and daily performance stats.",
  schema: z.object({
    ticker: z.string().describe("The stock symbol (e.g., AAPL, TSLA)"),
  }),
  execute: async ({ ticker }) => {
    const symbol = ticker.toUpperCase();
    const data = STOCK_DATA[symbol as keyof typeof STOCK_DATA];

    if (!data) {
      return `Error: Ticker ${symbol} not found in database.`;
    }

    // Stand out: 返回富文本格式，包含涨跌幅
    // 模拟一个随机的 "Yesterday Price" 来计算涨跌幅，让它看起来是动态的
    const currentPrice = data.price;
    const isPositive = data.change_percent.includes("+");
    const emoji = isPositive ? "📈" : "📉";

    return JSON.stringify({
      ticker: symbol,
      price: `$${currentPrice}`,
      change: data.change_percent,
      sentiment_summary: `${emoji} Market Sentiment: ${data.news_sentiment}`,
      analysis: `Stock is moving ${
        isPositive ? "UP" : "DOWN"
      } relative to yesterday's close.`,
    });
  },
});

// --- 工具 2: 投资组合管理 (Real File I/O) ---
// 真正的读写本地 portfolio.json 文件
const PORTFOLIO_PATH = join(Deno.cwd(), "src", "data", "portfolio.json");

export const managePortfolioTool = createTool({
  name: "manage_portfolio",
  description: "Read or Update the user's investment portfolio file.",
  schema: z.object({
    action: z.enum(["read", "update"]).describe("Action to perform"),
    ticker: z.string().optional().describe("Ticker symbol to update"),
    amount: z.number().optional().describe("Number of shares to add/remove"),
  }),
  execute: async ({ action, ticker, amount }) => {
    // 1. 确保文件存在
    try {
      await Deno.stat(PORTFOLIO_PATH);
    } catch {
      await Deno.writeTextFile(
        PORTFOLIO_PATH,
        JSON.stringify({ positions: {} })
      );
    }

    // 2. 读取当前数据
    const content = await Deno.readTextFile(PORTFOLIO_PATH);
    const portfolio = JSON.parse(content);

    if (action === "read") {
      return `📂 Current Portfolio:\n${JSON.stringify(portfolio, null, 2)}`;
    }

    if (action === "update") {
      if (!ticker || amount === undefined) {
        return "Error: Ticker and amount are required for update action.";
      }

      const currentShares = portfolio.positions[ticker] || 0;
      const newShares = currentShares + amount;

      portfolio.positions[ticker] = newShares;

      // 写入文件
      await Deno.writeTextFile(
        PORTFOLIO_PATH,
        JSON.stringify(portfolio, null, 2)
      );

      return `✅ Portfolio Updated: ${
        amount > 0 ? "Bought" : "Sold"
      } ${Math.abs(amount)} shares of ${ticker}. Total: ${newShares}`;
    }

    return "Invalid action.";
  },
});

// --- 工具 3: 新闻搜索 (Local Mock for Stability) ---
// 虽然你想用 Firecrawl，但为了 Demo 稳定，我们先定义一个本地版。
// 下面的 main.ts 里我会教你怎么把 Firecrawl 加上去。
export const searchNewsTool = createTool({
  name: "search_news_sentiment",
  description: "Search for recent news and return a sentiment summary.",
  schema: z.object({
    ticker: z.string(),
  }),
  execute: async ({ ticker }) => {
    // 这里模拟“搜索 -> 阅读 -> 总结”的过程
    const data = STOCK_DATA[ticker.toUpperCase() as keyof typeof STOCK_DATA];
    if (!data) return "No news found.";

    // Stand out: 不是返回新闻全文，而是返回“总结”
    return `
    📰 News Analysis for ${ticker}:
    --------------------------------
    Summary: ${data.news_summary}
    Primary Concern: Supply chain volatility in Asian markets.
    Analyst Rating: ${data.news_sentiment}
    Risk Level: ${data.news_sentiment === "Positive" ? "Low" : "High"}
    `;
  },
});
