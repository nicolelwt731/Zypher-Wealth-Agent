# 💎 Zypher Wealth Agent

An AI-powered investment assistant that provides stock recommendations based on risk profiles and live market data.

## Features

- 🤖 AI-powered stock recommendations using Claude Sonnet 4
- 📊 Real-time market data visualization
- 🌐 Live web search via Firecrawl (Bloomberg)
- 💾 Persistent memory for user risk profiles
- 🎨 Bloomberg Terminal-style UI
- 🔄 Real-time streaming recommendations

## Setup

1. **Install Dependencies**

   ```bash
   deno cache src/server.ts
   ```

2. **Set Environment Variables**
   Create a `.env` file or export:

   ```bash
   export ANTHROPIC_API_KEY="your-api-key"
   export FIRECRAWL_API_KEY="your-firecrawl-key"  # Optional
   ```

3. **Start the Server**

   ```bash
   deno task server
   ```

   Or for development with auto-reload:

   ```bash
   deno task dev
   ```

   > **Note**: The server automatically frees up port 8000 if it's already in use, so you don't need to manually kill processes.

4. **Open in Browser**
   Navigate to: http://localhost:8000

## Usage

1. Select your risk tolerance (Low/Medium/High)
2. Enter your query in the text area
3. Click "Run Agent" to get recommendations
4. View real-time tool calls and final recommendation

## Project Structure

```
├── src/
│   ├── main.ts          # Core agent logic (CLI + agentRunner function)
│   ├── server.ts         # Web server
│   ├── tool.ts           # Custom tools
│   ├── memory.ts         # Memory management
│   └── data/
│       ├── mockData.ts   # Stock data
│       └── agent_memory.json # User profile and preferences
└── public/
    ├── index.html        # Frontend UI
    ├── style.css         # Bloomberg Terminal style
    └── app.js            # Frontend logic
```

## Memory Management

The `memory.ts` module provides persistent user memory management through the `MemoryManager` class. It stores user preferences and interaction history in `src/data/agent_memory.json`.

### Features

- **Risk Tolerance Storage**: Persists user's risk profile (Low/Medium/High)
- **Interaction Tracking**: Automatically records the timestamp of last interaction
- **Investment Focus**: Can store user's investment focus areas (e.g., "Tech", "Crypto")
- **Persistent Storage**: Data is saved to disk and persists across sessions

### Memory Structure

```typescript
interface UserMemory {
  risk_tolerance?: string; // "Low", "Medium", or "High"
  last_interaction?: string; // ISO timestamp
}
```

### Usage

The `MemoryManager` is automatically used by the agent to:

- Load user's risk tolerance on startup
- Save new risk preferences when set
- Track interaction timestamps
- Maintain user context across sessions

### Data Location

The system uses two separate JSON files for different purposes:

#### 1. `agent_memory.json` - User Profile & Preferences

**Purpose**: Stores user's personal preferences and interaction history

**Structure**:

```json
{
  "risk_tolerance": "Low",
  "last_interaction": "2025-12-08T17:53:00.009Z",
}
```

**Contains**:

- `risk_tolerance`: User's risk profile (Low/Medium/High)
- `last_interaction`: Timestamp of last agent interaction

**Managed by**: `MemoryManager` class in `memory.ts`
**Updated when**: User sets risk tolerance or interacts with agent

The memory file is automatically created if it doesn't exist.

## Running

### CLI Mode

```bash
deno task main
```

### Web Server

```bash
deno task server
```

## Risk Tolerance Mapping

The risk tolerance mapping follows real investment principles:

- **Low Risk** (Conservative) → Stable, established companies with Positive sentiment

  - Focus: Capital preservation, low volatility, consistent performance
  - Candidates: AAPL, MSFT, V (stable tech/finance), GOOGL, JPM (neutral but stable)

- **Medium Risk** (Moderate) → Balanced mix of Positive and Neutral sentiment stocks

  - Focus: Balanced growth with moderate risk
  - Candidates: AAPL, MSFT (stable growth), TSLA, GOOGL, JPM (moderate volatility)

- **High Risk** (Aggressive) → High-growth stocks with Very Positive sentiment
  - Focus: High returns, willing to accept high volatility
  - Candidates: NVDA, META (high-growth tech), MSFT, AAPL (high-performing)

> **Note**:
>
> - Negative/Very Negative sentiment stocks (AMZN, JNJ) are never recommended
> - Low Risk investors get stable, large-cap stocks
> - High Risk investors get high-growth, high-volatility stocks
> - The mapping ensures appropriate risk-return alignment
