// State
let eventSource = null;
let isRunning = false;

// DOM Elements
const stockTableBody = document.getElementById("stockTableBody");
const riskSelect = document.getElementById("riskSelect");
const queryInput = document.getElementById("queryInput");
const runButton = document.getElementById("runButton");
const outputContainer = document.getElementById("outputContainer");
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const statusDot = statusIndicator.querySelector(".status-dot");

// Load stock data on page load
async function loadStockData() {
  try {
    const response = await fetch("/api/stocks");
    const stocks = await response.json();

    stockTableBody.innerHTML = "";

    for (const [ticker, data] of Object.entries(stocks)) {
      const row = document.createElement("tr");

      const sentimentClass = getSentimentClass(data.news_sentiment);
      const changeClass = data.change_percent.startsWith("+")
        ? "sentiment-positive"
        : "sentiment-negative";

      row.innerHTML = `
                <td><strong>${ticker}</strong></td>
                <td>$${data.price}</td>
                <td class="${changeClass}">${data.change_percent}</td>
                <td class="${sentimentClass}">${data.news_sentiment}</td>
            `;

      stockTableBody.appendChild(row);
    }
  } catch (error) {
    console.error("Failed to load stock data:", error);
  }
}

function getSentimentClass(sentiment) {
  const s = sentiment.toLowerCase();
  if (s.includes("very positive")) return "sentiment-very-positive";
  if (s.includes("very negative")) return "sentiment-very-negative";
  if (s.includes("positive")) return "sentiment-positive";
  if (s.includes("negative")) return "sentiment-negative";
  return "sentiment-neutral";
}

// Update status
function updateStatus(text, type = "ready") {
  statusText.textContent = text;
  statusDot.className = "status-dot";
  if (type === "waiting") {
    statusDot.classList.add("waiting");
  } else if (type === "error") {
    statusDot.classList.add("error");
  }
}

// Run agent
async function runAgent() {
  if (isRunning) {
    return;
  }

  const query = queryInput.value.trim();
  if (!query) {
    alert("Please enter a query");
    return;
  }

  const riskTolerance = riskSelect.value;

  // Reset UI
  isRunning = true;
  runButton.disabled = true;
  runButton.textContent = "⏳ Running...";
  outputContainer.innerHTML = '<div class="status">Initializing agent...</div>';
  updateStatus("Running", "waiting");

  // Close previous connection if any
  if (eventSource) {
    eventSource.close();
  }

  try {
    // First, create the session
    const response = await fetch("/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        riskTolerance,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { url: streamUrl } = await response.json();

    // Setup SSE with the stream URL
    eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleEvent(data);
      } catch (error) {
        console.error("Error parsing event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      if (eventSource.readyState === EventSource.CLOSED) {
        finishRun();
      }
    };
  } catch (error) {
    console.error("Error running agent:", error);
    outputContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    updateStatus("Error", "error");
    finishRun();
  }
}

// Handle SSE events
function handleEvent(data) {
  switch (data.type) {
    case "connected":
      outputContainer.innerHTML =
        '<div class="status">Connected. Processing...</div>';
      break;

    case "status":
      outputContainer.innerHTML = `<div class="status">${data.data}</div>`;
      break;

    case "risk":
      updateStatus(`Risk Profile: ${data.data}`, "waiting");
      break;

    case "recommendation":
      displayRecommendation(data.data);
      break;

    case "complete":
      finishRun();
      updateStatus("Complete", "ready");
      break;

    case "error":
      outputContainer.innerHTML = `<div class="error">Error: ${data.data}</div>`;
      updateStatus("Error", "error");
      finishRun();
      break;
  }
}

// Display recommendation
function displayRecommendation(text) {
  outputContainer.innerHTML = `<div class="recommendation">${escapeHtml(
    text
  )}</div>`;
}

// Finish run
function finishRun() {
  isRunning = false;
  runButton.disabled = false;
  runButton.textContent = "🚀 Run Agent";
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
runButton.addEventListener("click", runAgent);

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) {
    runAgent();
  }
});

// Check health on page load
async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();

    if (!health.hasApiKey) {
      outputContainer.innerHTML = `
        <div class="error">
          <strong>⚠️ Configuration Required</strong><br><br>
          The ANTHROPIC_API_KEY environment variable is not set.<br><br>
          Please set it before running the agent:<br>
          <code>export ANTHROPIC_API_KEY="your-api-key"</code><br><br>
          Then restart the server.
        </div>
      `;
      runButton.disabled = true;
      updateStatus("API Key Missing", "error");
    } else {
      updateStatus("Ready", "ready");
    }
  } catch (error) {
    console.error("Health check failed:", error);
  }
}

// Load data and check health on page load
loadStockData();
checkHealth();
