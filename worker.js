/**
 * Qui Gon proxy — Cloudflare Worker (Venice AI edition)
 *
 * Holds your Venice API key server-side so it never appears in the page.
 *
 * Deploy:
 *   1. dash.cloudflare.com → Workers → Create Worker → paste this file
 *   2. Settings → Variables and Secrets:
 *        - secret  VENICE_API_KEY   → your key from venice.ai
 *        - text    VENICE_MODEL     → the model id you pick (e.g. "llama-3.3-70b")
 *        - text    ALLOWED_ORIGIN   → (optional) your site URL to lock it down
 *   3. Copy the worker URL into AGENT_ENDPOINT in index.html
 *
 * To change models later, just edit the VENICE_MODEL variable — no redeploy
 * of the site needed. Model ids: https://docs.venice.ai (models endpoint).
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : (origin === allowed ? origin : ""),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors });

    let body;
    try { body = await request.json(); }
    catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

    const { system = "", messages = [] } = body;
    if (!Array.isArray(messages) || messages.length === 0)
      return new Response(JSON.stringify({ reply: "" }),
        { headers: { ...cors, "Content-Type": "application/json" } });

    // cap history and message sizes
    const trimmed = messages.slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000),
    }));

    const r = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.VENICE_MODEL || "llama-3.3-70b",
        max_completion_tokens: 600,
        messages: [
          { role: "system", content: String(system).slice(0, 8000) },
          ...trimmed,
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return new Response(JSON.stringify({ reply: "", error: err.slice(0, 300) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || "").trim();

    return new Response(JSON.stringify({ reply }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  },
};
