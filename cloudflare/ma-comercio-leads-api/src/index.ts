interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}

type Lead = {
  id: string;
  nome: string;
  whatsapp: string;
  cidade: string;
  unidade: string;
  objetivo: string;
  valor?: number;
  entrada?: string;
  parcela?: string;
  prazo?: string;
  whatsapp_destino: string;
  source_url: string;
  attribution?: Record<string, string>;
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

const allowedOrigins = (env: Env) => env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const isText = (value: unknown, maxLength: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

const isLead = (value: unknown): value is Lead => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lead = value as Record<string, unknown>;
  return isText(lead.id, 80)
    && isText(lead.nome, 150)
    && isText(lead.whatsapp, 32)
    && isText(lead.cidade, 100)
    && isText(lead.unidade, 100)
    && isText(lead.objetivo, 150)
    && isText(lead.whatsapp_destino, 32)
    && isText(lead.source_url, 2048)
    && (!lead.valor || (typeof lead.valor === "number" && Number.isFinite(lead.valor)));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "ma-comercio-leads-api" });
    if (url.pathname !== "/leads") return json({ success: false, error: "Not found" }, 404);

    const origin = request.headers.get("Origin") ?? "";
    if (!allowedOrigins(env).includes(origin)) return json({ success: false, error: "Origin not allowed" }, 403);
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405, cors);

    try {
      const lead: unknown = await request.json();
      if (!isLead(lead)) return json({ success: false, error: "Invalid lead payload" }, 400, cors);
      if (new URL(lead.source_url).origin !== origin) return json({ success: false, error: "Invalid source URL" }, 400, cors);

      await env.DB.prepare(`INSERT OR IGNORE INTO leads (
        id, created_at, nome, whatsapp, cidade, unidade, objetivo, valor, entrada, parcela, prazo,
        whatsapp_destino, source_url, attribution_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          lead.id, new Date().toISOString(), lead.nome.trim(), lead.whatsapp.trim(), lead.cidade.trim(),
          lead.unidade.trim(), lead.objetivo.trim(), lead.valor ?? null, lead.entrada ?? null, lead.parcela ?? null,
          lead.prazo ?? null, lead.whatsapp_destino.trim(), lead.source_url, JSON.stringify(lead.attribution ?? {}),
        )
        .run();
      return json({ success: true }, 201, cors);
    } catch {
      return json({ success: false, error: "Invalid request" }, 400, cors);
    }
  },
} satisfies ExportedHandler<Env>;
