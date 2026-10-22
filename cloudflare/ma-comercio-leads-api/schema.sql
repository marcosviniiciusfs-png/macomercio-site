CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  cidade TEXT NOT NULL,
  unidade TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  valor INTEGER,
  entrada TEXT,
  parcela TEXT,
  prazo TEXT,
  whatsapp_destino TEXT NOT NULL,
  source_url TEXT NOT NULL,
  attribution_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
