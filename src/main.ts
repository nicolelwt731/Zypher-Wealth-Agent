import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";
import { STOCK_DATA } from "./data/mockData.ts";
import { MemoryManager } from "./memory.ts";
import { getStockPriceTool, managePortfolioTool } from "./tool.ts";
import { bold, cyan, green, yellow, gray, red, bgBlue } from "@std/fmt/colors";

// --- Helpers ---
function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ENV: ${name}`);
  return value;
}

// Visualize Internal Data (Mock)
function printStockTable(
  data: Record<string, { price: number; news_sentiment: string }>
) {
  console.log(bold("\n📊 INTERNAL DATABASE (REF: YESTERDAY CLOSE)"));
  console.log(gray("------------------------------------------------"));
  console.log(
    bold(String("TICKER").padEnd(10)) +
      bold(String("PRICE").padEnd(10)) +
      bold(String("SENTIMENT").padEnd(15))
  );
  console.log(gray("------------------------------------------------"));

  for (const [ticker, info] of Object.entries(data)) {
    const priceStr = `$${info.price}`;
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

// Extract recommendation from full text
function extractRecommendation(text: string): string {
  const patterns = [
    /📊\s*RECOMMENDATION:[\s\S]{0,2000}/i,
    /(?:RECOMMENDATION|Recommendation|FINAL RECOMMENDATION):[\s\S]{0,2000}/i,
    /(?:Based on|Therefore|In conclusion|My recommendation|I recommend|I suggest)[\s\S]{0,1500}/i,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(new RegExp(pattern.source, "gi")));
    if (matches.length > 0) {
      let recommendation = matches[matches.length - 1][0];
      recommendation = recommendation.replace(
        /(?:Let me|I'll|I'm going to|First|Now|Let me check|Let me search|Let me try)[^.]*\./gi,
        ""
      );
      recommendation = recommendation.trim();
      if (recommendation.length > 100) {
        return recommendation;
      }
    }
  }

  // Fallback: last 1000 chars
  const lastPart = text.slice(-1000).trim();
  const sentences = lastPart.split(/[.!?]\s+/);
  const lastSentences = sentences.slice(-5).join(". ");
  return lastSentences.length > 50 ? lastSentences : lastPart;
}

// Agent runner function for web API
export async function* agentRunner(
  userQuery: string,
  riskTolerance: string = "Medium"
): AsyncGenerator<{ type: string; data: unknown }> {
  try {
    // Check for required environment variables first
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      yield {
        type: "error",
        data: "ANTHROPIC_API_KEY environment variable is not set. Please set it before running the agent.",
      };
      return;
    }

    yield { type: "status", data: "Initializing agent..." };

    const zypherContext = await createZypherContext(Deno.cwd());
    const memoryManager = new MemoryManager();

    const agent = new ZypherAgent(
      zypherContext,
      new AnthropicModelProvider({
        apiKey,
        enablePromptCaching: true,
        anthropicClientOptions: { maxRetries: 3, timeout: 60000 },
      })
    );

    // Register tools
    agent.mcp.registerTool(getStockPriceTool);
    agent.mcp.registerTool(managePortfolioTool);

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (firecrawlKey) {
      await agent.mcp.registerServer({
        id: "firecrawl",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "firecrawl-mcp"],
          env: { FIRECRAWL_API_KEY: firecrawlKey },
        },
      });
    }

    // Build tool list
    const availableTools = [
      {
        name: "get_stock_price",
        description:
          "Get the current stock price and daily performance stats from internal database.",
      },
      {
        name: "manage_portfolio",
        description: "Read or Update the user's investment portfolio file.",
      },
    ];

    if (firecrawlKey) {
      availableTools.push(
        {
          name: "firecrawl_search",
          description:
            "Search the web for live news and information. Use ONLY the 'query' parameter.",
        },
        {
          name: "mcp__firecrawl__firecrawl_search",
          description:
            "Alternative name for Firecrawl search tool. Use ONLY the 'query' parameter.",
        }
      );
    }

    // Load memory
    yield { type: "status", data: "Loading user profile..." };
    let userMemory = await memoryManager.loadMemory();
    let userRisk = userMemory.risk_tolerance || riskTolerance;

    if (!userMemory.risk_tolerance) {
      await memoryManager.saveMemory({ risk_tolerance: userRisk });
    }

    yield { type: "risk", data: userRisk };

    // Build system context
    const systemContext = `
You are Zypher Wealth, a hands-on investment assistant.

[AVAILABLE TOOLS]
${JSON.stringify(
  availableTools.map((t) => ({
    name: t.name,
    description: t.description,
  })),
  null,
  2
)}

[DATA SOURCES STRATEGY]
1. **Internal DB**: You have access to the mock data shown above (Yesterday's Close).
   - Each stock has a "news_sentiment" field: "Very Positive", "Positive", "Neutral", "Negative", or "Very Negative"
2. **Live Web**: You MUST use Bloomberg ONLY for live news verification.
   - **ONLY use site:bloomberg.com** - no other websites allowed.
   - Example: { "query": "site:bloomberg.com NVIDIA stock news today" }

[⚠️ CRITICAL INSTRUCTION - SEARCH TOOL]
- When using the search tool, ONLY provide the "query" parameter.
- **MANDATORY**: Always use "site:bloomberg.com" in your query.
- ✅ CORRECT: { "query": "site:bloomberg.com AAPL latest news" }
- ❌ WRONG: { "query": "AAPL news" } (missing site:bloomberg.com)
- ❌ DO NOT send 'sources', 'limit', 'tbs', or 'pageOptions' parameters. This will cause a crash.
- **Keep queries concise** - search for ONE stock at a time.

[SENTIMENT COMPARISON RULES]
When you search Bloomberg for a stock, extract the sentiment from the articles:
- Compare Bloomberg sentiment with Internal DB sentiment
- **If sentiments MATCH**: Use the Internal DB sentiment (it's already verified)
- **If sentiments DIFFER**: Use the Bloomberg sentiment (live data takes priority)
- Report both sentiments in your analysis

[RISK TOLERANCE MAPPING]
Your Risk Profile is: ${userRisk}
- **Low Risk** → Recommend stocks with "Positive" or "Very Positive" sentiment
- **Medium Risk** → Recommend stocks with "Neutral" sentiment
- **High Risk** → Recommend stocks with "Negative" or "Very Negative" sentiment

[TASK]
1. Check portfolio using 'manage_portfolio'.
2. Based on Risk Profile (${userRisk}), identify candidate stocks from the internal database.
3. **For each candidate stock**, search Bloomberg: "site:bloomberg.com [TICKER] stock news today"
4. **Extract sentiment from Bloomberg articles** and compare with Internal DB sentiment:
   - If match: Use Internal DB sentiment
   - If differ: Use Bloomberg sentiment (prefer live data)
5. **Select ONE stock** that matches your Risk Profile mapping (see above).
6. **CRITICAL**: At the END of your response, provide a CLEAR recommendation:

📊 RECOMMENDATION: [TICKER]
- Internal Sentiment: [from mockData]
- Bloomberg Sentiment: [from live search]
- Final Sentiment Used: [which one you're using and why]
- Reason: [Why this stock matches ${userRisk} risk profile]
- Action: [Buy/Hold/Avoid and why]

**Make sure your recommendation is at the very end of your response!**
`;

    yield { type: "status", data: "Running agent..." };

    // Run agent
    const event$ = agent.runTask(
      `${systemContext}\n\nUser: ${userQuery}`,
      "claude-sonnet-4-20250514"
    );

    let finalRecommendation = "";
    let hasOutput = false;

    for await (const event of eachValueFrom(event$)) {
      if (typeof event === "string") {
        finalRecommendation += event;
        hasOutput = true;
      } else if (typeof event === "object" && event !== null) {
        const eventAny = event as unknown as Record<string, unknown>;

        if (eventAny.toolCall && typeof eventAny.toolCall === "object") {
          const toolCall = eventAny.toolCall as Record<string, unknown>;
          yield {
            type: "tool",
            data: {
              name: String(toolCall.name || "unknown"),
              arguments: toolCall.arguments,
            },
          };
        }

        if (eventAny.content && typeof eventAny.content === "string") {
          finalRecommendation += eventAny.content;
          hasOutput = true;
        }

        if (eventAny.delta && typeof eventAny.delta === "object") {
          const delta = eventAny.delta as Record<string, unknown>;
          if (delta.text && typeof delta.text === "string") {
            finalRecommendation += delta.text;
            hasOutput = true;
          }
        }

        if (eventAny.message && typeof eventAny.message === "object") {
          const message = eventAny.message as Record<string, unknown>;
          if (message.content && typeof message.content === "string") {
            finalRecommendation += message.content;
            hasOutput = true;
          }
        }
      }
    }

    if (hasOutput && finalRecommendation.trim()) {
      const recommendation = extractRecommendation(finalRecommendation);
      yield { type: "recommendation", data: recommendation };
      yield { type: "complete", data: { success: true } };
    } else {
      yield {
        type: "error",
        data: "No output received from agent",
      };
    }
  } catch (error) {
    yield {
      type: "error",
      data: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// 🚀 CLI MODE (Only runs if this file is executed directly)
// ============================================================

// Check if running as CLI (not imported as module)
if (import.meta.main) {
  console.clear();
  console.log(bgBlue(bold(" 💎 ZYPHER WEALTH AGENT v2.0 ")));
  console.log(gray("Initializing secure connection...\n"));

  // CLI Flag: Reset Memory
  if (Deno.args.includes("--reset")) {
    console.log(red("🗑️  Resetting Memory as requested..."));
    try {
      await Deno.remove("src/data/agent_memory.json");
    } catch (_e) {
      /* ignore if not exists */
    }
  }

  const zypherContext = await createZypherContext(Deno.cwd());
  const memoryManager = new MemoryManager();

  const agent = new ZypherAgent(
    zypherContext,
    new AnthropicModelProvider({
      apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
      enablePromptCaching: true,
      anthropicClientOptions: { maxRetries: 3, timeout: 60000 },
    })
  );

  // Register tools
  console.log("🛠️  Registering Custom Tools...");
  agent.mcp.registerTool(getStockPriceTool);
  agent.mcp.registerTool(managePortfolioTool);

  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (firecrawlKey) {
    console.log("🌐 Registering Firecrawl MCP (Live Web Access)...");
    await agent.mcp.registerServer({
      id: "firecrawl",
      type: "command",
      command: {
        command: "npx",
        args: ["-y", "firecrawl-mcp"],
        env: { FIRECRAWL_API_KEY: firecrawlKey },
      },
    });
  }

  // Build tool list
  const availableTools = [
    {
      name: "get_stock_price",
      description:
        "Get the current stock price and daily performance stats from internal database.",
    },
    {
      name: "manage_portfolio",
      description: "Read or Update the user's investment portfolio file.",
    },
  ];

  if (firecrawlKey) {
    availableTools.push(
      {
        name: "firecrawl_search",
        description:
          "Search the web for live news and information. Use ONLY the 'query' parameter.",
      },
      {
        name: "mcp__firecrawl__firecrawl_search",
        description:
          "Alternative name for Firecrawl search tool. Use ONLY the 'query' parameter.",
      }
    );
  }

  // Memory & Identity
  console.log("🧠 accessing_memory_bank...");
  const userMemory = await memoryManager.loadMemory();
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

  printStockTable(STOCK_DATA);

  // Build system context
  const systemContext = `
You are Zypher Wealth, a hands-on investment assistant.

[AVAILABLE TOOLS]
${JSON.stringify(
  availableTools.map((t) => ({
    name: t.name,
    description: t.description,
  })),
  null,
  2
)}

[DATA SOURCES STRATEGY]
1. **Internal DB**: You have access to the mock data shown above (Yesterday's Close).
   - Each stock has a "news_sentiment" field: "Very Positive", "Positive", "Neutral", "Negative", or "Very Negative"
2. **Live Web**: You MUST use Bloomberg ONLY for live news verification.
   - **ONLY use site:bloomberg.com** - no other websites allowed.
   - Example: { "query": "site:bloomberg.com NVIDIA stock news today" }

[⚠️ CRITICAL INSTRUCTION - SEARCH TOOL]
- When using the search tool, ONLY provide the "query" parameter.
- **MANDATORY**: Always use "site:bloomberg.com" in your query.
- ✅ CORRECT: { "query": "site:bloomberg.com AAPL latest news" }
- ❌ WRONG: { "query": "AAPL news" } (missing site:bloomberg.com)
- ❌ DO NOT send 'sources', 'limit', 'tbs', or 'pageOptions' parameters. This will cause a crash.
- **Keep queries concise** - search for ONE stock at a time.

[SENTIMENT COMPARISON RULES]
When you search Bloomberg for a stock, extract the sentiment from the articles:
- Compare Bloomberg sentiment with Internal DB sentiment
- **If sentiments MATCH**: Use the Internal DB sentiment (it's already verified)
- **If sentiments DIFFER**: Use the Bloomberg sentiment (live data takes priority)
- Report both sentiments in your analysis

[RISK TOLERANCE MAPPING]
Your Risk Profile is: ${userRisk}
- **Low Risk** → Recommend stocks with "Positive" or "Very Positive" sentiment
- **Medium Risk** → Recommend stocks with "Neutral" sentiment
- **High Risk** → Recommend stocks with "Negative" or "Very Negative" sentiment

[TASK]
1. Check portfolio using 'manage_portfolio'.
2. Based on Risk Profile (${userRisk}), identify candidate stocks from the internal database.
3. **For each candidate stock**, search Bloomberg: "site:bloomberg.com [TICKER] stock news today"
4. **Extract sentiment from Bloomberg articles** and compare with Internal DB sentiment:
   - If match: Use Internal DB sentiment
   - If differ: Use Bloomberg sentiment (prefer live data)
5. **Select ONE stock** that matches your Risk Profile mapping (see above).
6. **CRITICAL**: At the END of your response, provide a CLEAR recommendation:

📊 RECOMMENDATION: [TICKER]
- Internal Sentiment: [from mockData]
- Bloomberg Sentiment: [from live search]
- Final Sentiment Used: [which one you're using and why]
- Reason: [Why this stock matches ${userRisk} risk profile]
- Action: [Buy/Hold/Avoid and why]

**Make sure your recommendation is at the very end of your response!**
`;

  const userQuery =
    "Check my portfolio. Then, given my risk profile, recommend a stock but verify it with live news first.";
  console.log(gray(`👤 User Query: "${userQuery}"`));
  console.log(gray("Thinking & Acting...\n"));

  const event$ = agent.runTask(
    `${systemContext}\n\nUser: ${userQuery}`,
    "claude-sonnet-4-20250514"
  );

  // Output Loop
  let finalRecommendation = "";
  let hasOutput = false;
  let eventCount = 0;
  let toolCallCount = 0;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Agent execution timeout after 5 minutes")),
        300000
      );
    });

    const eventPromise = (async () => {
      for await (const event of eachValueFrom(event$)) {
        eventCount++;

        if (typeof event === "string") {
          finalRecommendation += event;
          hasOutput = true;
        } else if (typeof event === "object" && event !== null) {
          const eventAny = event as unknown as Record<string, unknown>;

          if (eventAny.error) {
            console.error(
              red(`\n❌ [ERROR]: ${JSON.stringify(eventAny.error)}`)
            );
            hasOutput = true;
          } else if (eventAny.content && typeof eventAny.content === "string") {
            finalRecommendation += eventAny.content;
            hasOutput = true;
          } else if (eventAny.delta && typeof eventAny.delta === "object") {
            const delta = eventAny.delta as Record<string, unknown>;
            if (delta.text && typeof delta.text === "string") {
              finalRecommendation += delta.text;
              hasOutput = true;
            }
          } else if (
            eventAny.toolCall &&
            typeof eventAny.toolCall === "object"
          ) {
            toolCallCount++;
          } else if (eventAny.message && typeof eventAny.message === "object") {
            const message = eventAny.message as Record<string, unknown>;
            if (message.content && typeof message.content === "string") {
              finalRecommendation += message.content;
              hasOutput = true;
            }
          }
        }
      }
    })();

    await Promise.race([eventPromise, timeoutPromise]);
  } catch (error) {
    console.error(
      red(
        `\n❌ [FATAL ERROR]: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    if (error instanceof Error && error.stack) {
      console.error(gray(error.stack));
    }
    hasOutput = true;
  }

  console.log("\n");

  // Display final recommendation
  if (!hasOutput) {
    console.log(
      yellow(
        "⚠️  No output received from agent. This might indicate an error or timeout."
      )
    );
    console.log(
      gray(
        `[Debug] Events processed: ${eventCount}, Tool calls: ${toolCallCount}`
      )
    );
  } else if (finalRecommendation.trim()) {
    console.log(gray("------------------------------------------------"));
    console.log(bold(green("\n💡 FINAL RECOMMENDATION:")));
    console.log(gray("------------------------------------------------"));

    const recommendation = extractRecommendation(finalRecommendation);
    console.log(cyan(recommendation));
  } else {
    console.log(red("❌ No content received from agent."));
  }

  console.log("\n" + gray("------------------------------------------------"));
  console.log(green("✅ Session Completed. Log saved to audit trail."));
}
