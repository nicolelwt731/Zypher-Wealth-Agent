// src/tools.ts
import { createTool } from "@corespeed/zypher/tools";
import { z } from "zod";
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

// --- 工具 2: 新闻搜索 (Local Mock for Stability) ---
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
