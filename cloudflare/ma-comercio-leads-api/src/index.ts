interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  META_PIXEL_ID: string;
  META_GRAPH_API_VERSION: string;
  META_CAPI_ACCESS_TOKEN: string;
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
  fbp?: string;
  fbc?: string;
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

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sendMetaLead = async (lead: Lead, request: Request, env: Env) => {
  const name = lead.nome.trim().split(/\s+/);
  const userData: Record<string, string | string[]> = {
    client_ip_address: request.headers.get("CF-Connecting-IP") ?? "",
    client_user_agent: request.headers.get("User-Agent") ?? "",
    ph: [await sha256(normalizePhone(lead.whatsapp))],
  };
  if (name[0]) userData.fn = [await sha256(normalize(name[0]))];
  if (name.length > 1) userData.ln = [await sha256(normalize(name.slice(1).join(" ")) )];
  if (lead.cidade) userData.ct = [await sha256(normalize(lead.cidade))];
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(env.META_GRAPH_API_VERSION)}/${encodeURIComponent(env.META_PIXEL_ID)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: lead.id,
          event_source_url: lead.source_url,
          action_source: "website",
          user_data: userData,
          custom_data: {
            content_name: "Simulador MA Comércio",
            content_category: lead.objetivo,
            value: lead.valor,
            currency: "BRL",
            unidade: lead.unidade,
            ...lead.attribution,
          },
        }],
        access_token: env.META_CAPI_ACCESS_TOKEN,
      }),
    },
  );
  const body = await response.json<{ events_received?: number; error?: { message?: string } }>().catch(() => ({}));
  return { success: response.ok && body.events_received === 1, status: response.status, error: body.error?.message };
};

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
      const meta = await sendMetaLead(lead, request, env).catch((error) => ({
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : "Meta request failed",
      }));
      console.log(JSON.stringify({ message: "lead processed", lead_id: lead.id, meta_success: meta.success, meta_status: meta.status }));
      return json({ success: true, meta: { success: meta.success } }, 201, cors);
    } catch {
      return json({ success: false, error: "Invalid request" }, 400, cors);
    }
  },
} satisfies ExportedHandler<Env>;
