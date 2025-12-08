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
│       └── portfolio.json
└── public/
    ├── index.html        # Frontend UI
    ├── style.css         # Bloomberg Terminal style
    └── app.js            # Frontend logic
```

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

- **Low Risk** → Positive/Very Positive sentiment stocks
- **Medium Risk** → Neutral sentiment stocks
- **High Risk** → Negative/Very Negative sentiment stocks
