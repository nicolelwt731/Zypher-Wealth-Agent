import { agentRunner } from "./main.ts";
import { join } from "@std/path";

const PORT = 8000;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // Serve static files
    if (pathname === "/" || pathname === "/index.html") {
      const filePath = join(Deno.cwd(), "public", "index.html");
      const file = await Deno.readFile(filePath);
      return new Response(file, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/style.css") {
      const filePath = join(Deno.cwd(), "public", "style.css");
      const file = await Deno.readFile(filePath);
      return new Response(file, {
        headers: { "content-type": "text/css" },
      });
    }

    if (pathname === "/app.js") {
      const filePath = join(Deno.cwd(), "public", "app.js");
      const file = await Deno.readFile(filePath);
      return new Response(file, {
        headers: { "content-type": "application/javascript" },
      });
    }

    // API endpoint for running agent (POST for initial request, GET for SSE)
    if (pathname === "/api/run") {
      if (req.method === "POST") {
        try {
          const { query, riskTolerance } = await req.json();

          // Store request in a simple way - for production use a proper session store
          // For now, we'll use query params in the SSE endpoint
          const sessionId = Date.now().toString();

          // Return session ID and SSE URL
          return new Response(
            JSON.stringify({
              sessionId,
              url: `/api/stream?session=${sessionId}&query=${encodeURIComponent(
                query
              )}&risk=${encodeURIComponent(riskTolerance)}`,
            }),
            {
              headers: { "content-type": "application/json" },
            }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            }
          );
        }
      }
    }

    // SSE endpoint
    if (pathname === "/api/stream" && req.method === "GET") {
      try {
        const query = url.searchParams.get("query") || "";
        const riskTolerance = url.searchParams.get("risk") || "Medium";

        // Create SSE stream
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();

            // Send initial connection message
            controller.enqueue(
              encoder.encode(
                "data: " + JSON.stringify({ type: "connected" }) + "\n\n"
              )
            );

            try {
              // Run agent and stream results
              for await (const chunk of agentRunner(query, riskTolerance)) {
                controller.enqueue(
                  encoder.encode("data: " + JSON.stringify(chunk) + "\n\n")
                );
              }
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  "data: " +
                    JSON.stringify({
                      type: "error",
                      data:
                        error instanceof Error ? error.message : String(error),
                    }) +
                    "\n\n"
                )
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "access-control-allow-origin": "*",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          }
        );
      }
    }

    // API endpoint for stock data
    if (pathname === "/api/stocks" && req.method === "GET") {
      const { STOCK_DATA } = await import("./data/mockData.ts");
      return new Response(JSON.stringify(STOCK_DATA), {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
      });
    }

    // Health check endpoint
    if (pathname === "/api/health" && req.method === "GET") {
      const hasApiKey = !!Deno.env.get("ANTHROPIC_API_KEY");
      const hasFirecrawl = !!Deno.env.get("FIRECRAWL_API_KEY");
      return new Response(
        JSON.stringify({
          status: "ok",
          hasApiKey,
          hasFirecrawl,
          message: hasApiKey
            ? "Ready to run"
            : "ANTHROPIC_API_KEY is not set. Please set it to use the agent.",
        }),
        {
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    console.error("Handler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

console.log(
  `🚀 Zypher Wealth Agent Web Server running on http://localhost:${PORT}`
);
console.log(`📱 Open http://localhost:${PORT} in your browser`);

// Start server
Deno.serve({ port: PORT }, handler);
