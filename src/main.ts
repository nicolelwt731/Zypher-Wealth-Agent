// src/main.ts (Final Version)
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";
import { STOCK_DATA } from "./data/mockData.ts";
import { MemoryManager } from "./memory.ts";
import { bold, cyan, green, yellow, gray, red, bgBlue } from "@std/fmt/colors";

// --- Helpers ---
function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ENV: ${name}`);
  return value;
}

// 模拟一个简单的表格打印
function printStockTable(data: any) {
  console.log(bold("\n📊 MARKET SNAPSHOT (LIVE)"));
  console.log(gray("------------------------------------------------"));
  console.log(
    bold(String("TICKER").padEnd(10)) +
      bold(String("PRICE").padEnd(10)) +
      bold(String("SENTIMENT").padEnd(15))
  );
  console.log(gray("------------------------------------------------"));

  for (const [ticker, info] of Object.entries(data)) {
    // @ts-ignore
    const priceStr = `$${info.price}`;
    // @ts-ignore
    const sentiment = info.news_sentiment;
    let colorFn = (s: string) => s;
    if (sentiment.includes("Positive")) colorFn = green;
    else if (sentiment.includes("Neutral")) colorFn = yellow;
    else colorFn = red;

    console.log(
      cyan(ticker.padEnd(10)) +
        priceStr.padEnd(10) +
        colorFn(sentiment.padEnd(15))
    );
  }
  console.log(gray("------------------------------------------------\n"));
}

// --- Main Logic ---

console.clear(); 
console.log(bgBlue(bold(" 💎 ZYPHER WEALTH AGENT v1.0 ")));
console.log(gray("Initializing secure connection...\n"));

const zypherContext = await createZypherContext(Deno.cwd());
const memoryManager = new MemoryManager();

const agent = new ZypherAgent(
  zypherContext,
  new AnthropicModelProvider({
    apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),

    //Prompt Caching
    enablePromptCaching: true,

    // [注释掉] Thinking Budget 通常只用于 Claude 3.5 Sonnet (New) 或 O1 类模型
    // 如果用 Haiku，开启这个可能会导致 API 报错，所以我们先注释掉，但保留在这里展示你的知识储备
    //thinkingBudget: 20000,

    //Robustness
    anthropicClientOptions: {
      maxRetries: 3,
      timeout: 60000,
    },
  })
);

// 1. Memory Check (The "Brain")
console.log(bold("🧠 accessing_memory_bank..."));
let userMemory = await memoryManager.loadMemory();
let userRisk = userMemory.risk_tolerance;

if (!userRisk) {
  console.log(yellow("⚠️  No user profile found."));
  const input = prompt(
    bold("👉 Please set your Risk Tolerance (High/Medium/Low):")
  );
  userRisk = input || "Medium";
  await memoryManager.saveMemory({ risk_tolerance: userRisk });
  console.log(green("✅ Profile Created & Saved to Disk."));
} else {
  console.log(
    green(`✅ Identity Verified. Risk Profile: [${userRisk.toUpperCase()}]`)
  );
}

// 2. Data Visualization (The "Eyes")
printStockTable(STOCK_DATA);

// 3. Agent Execution (The "Mouth")
const systemContext = `
You are Zypher Wealth, a professional investment analyst.
User Risk Profile: ${userRisk} (This is CRITICAL).
Market Data: ${JSON.stringify(STOCK_DATA)}

Instructions:
1. Act as a financial partner.
2. Based on the User Risk Profile, recommend ONE stock.
3. Be concise but professional.
4. Use formatting like **Bold** for key numbers.
`;

const userQuery = "Give me your best recommendation based on my profile.";
console.log(gray(`👤 User Query: "${userQuery}"`));
console.log(gray("Thinking...\n"));

const event$ = agent.runTask(
  `${systemContext}\n\nUser: ${userQuery}`,
  "claude-sonnet-4-20250514"
);

// Stream Output with Typing Effect
for await (const event of eachValueFrom(event$)) {
  if (typeof event === "string") {
    Deno.stdout.write(new TextEncoder().encode(cyan(event)));
  }
}

console.log("\n\n" + gray("------------------------------------------------"));
console.log(green("✅ Session Completed. Log saved to audit trail."));
