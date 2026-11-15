/**
 * Fake versions of the outside services the app talks to, for the
 * end-to-end tests. The app is pointed here with RESEND_BASE_URL,
 * SEMAPHORE_ENDPOINT and META_GRAPH_URL (see playwright.config.ts).
 *
 *   /resend/*      Resend: accepts emails, returns ids
 *   /semaphore     Semaphore SMS: accepts texts
 *   /graph/v25.0/* Meta Graph API: Messenger conversations (set by tests)
 *
 * Tests read what was "sent" and set up Messenger chats through:
 *   GET  /__requests          everything received so far
 *   POST /__reset             forget requests, clear chats
 *   POST /__conversations     the chats the Conversations API returns
 */
import { createServer, type IncomingMessage } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);

type Recorded = { method: string; path: string; body: unknown; at: string };
let requests: Recorded[] = [];
let conversations: unknown[] = [];
let nextId = 1;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const body = await readBody(req);
  const json = (status: number, payload: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  // ---- test controls
  if (url.pathname === "/__requests") return json(200, requests);
  if (url.pathname === "/__reset") {
    requests = [];
    conversations = [];
    return json(200, { ok: true });
  }
  if (url.pathname === "/__conversations") {
    conversations = (body as unknown[]) ?? [];
    return json(200, { ok: true });
  }
  if (url.pathname === "/health") return json(200, { ok: true });

  requests.push({ method: req.method ?? "GET", path: url.pathname + url.search, body, at: new Date().toISOString() });

  // ---- Resend
  if (url.pathname === "/resend/emails/batch") {
    const items = Array.isArray(body) ? body : [];
    return json(200, { data: items.map(() => ({ id: `mock_email_${nextId++}` })), errors: [] });
  }
  if (url.pathname === "/resend/emails") {
    return json(200, { id: `mock_email_${nextId++}` });
  }

  // ---- Semaphore
  if (url.pathname === "/semaphore") {
    const numbers = String((body as Record<string, string>)?.number ?? "").split(",");
    return json(
      200,
      numbers.map((number) => ({
        message_id: String(nextId++),
        recipient: number,
        message: (body as Record<string, string>)?.message ?? "",
        sender_name: "TEST",
        network: "Globe",
        status: "Queued",
        created_at: new Date().toISOString(),
      }))
    );
  }

  // ---- Meta Graph API
  if (url.pathname.endsWith("/conversations")) {
    return json(200, { data: conversations });
  }
  if (url.pathname.startsWith("/graph/")) {
    return json(200, { data: [] });
  }

  json(404, { error: "not mocked", path: url.pathname });
});

server.listen(PORT, () => {
  console.log(`mock server on http://127.0.0.1:${PORT}`);
});
