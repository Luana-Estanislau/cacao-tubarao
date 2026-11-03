// Serverless proxy: saves one sighting record to Airtable.
// Token is read server-side only — never exposed to the browser.

const ALLOWED_FIELDS = new Set([
  "Estabelecimento", "Tipo", "CEP", "Endereco", "Cidade", "Estado",
  "Latitude", "Longitude", "Google Place ID", "Fonte Localizacao",
  "Forma de Venda", "Forma_de_Venda_Outro",
  "Preco por kg", "Peso", "Preco Total",
  "Especie Declarada", "Especie_Declarada_Outro",
  "Origem", "Origem_Declarada_Outro",
  "Marca", "Analise IA", "Observacoes",
  "Nome Reportante", "Email Reportante",
  "Data Registro", "Data Observacao",
  "Foto", "Foto 2", "Foto 3",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE || "Table 1";

  if (!token || !baseId) {
    return res.status(500).json({ error: "Airtable env vars not configured" });
  }

  const { fields } = req.body;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return res.status(400).json({ error: "fields object required" });
  }

  // Strip any field not in the allowlist to prevent arbitrary writes
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) safeFields[k] = v;
  }

  // Basic type guards for numeric fields
  if (safeFields["Latitude"]  != null && typeof safeFields["Latitude"]  !== "number") delete safeFields["Latitude"];
  if (safeFields["Longitude"] != null && typeof safeFields["Longitude"] !== "number") delete safeFields["Longitude"];
  if (safeFields["Preco por kg"] != null && typeof safeFields["Preco por kg"] !== "number") delete safeFields["Preco por kg"];
  if (safeFields["Preco Total"]  != null && typeof safeFields["Preco Total"]  !== "number") delete safeFields["Preco Total"];

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: safeFields }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.json();
      return res.status(airtableRes.status).json({ error: err?.error?.message || "Airtable error" });
    }

    const data = await airtableRes.json();
    return res.status(200).json({ id: data.id });
  } catch (e) {
    console.error("[airtable-save]", e.message);
    return res.status(500).json({ error: "Erro ao salvar" });
  }
}
