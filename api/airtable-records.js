// Serverless proxy: returns paginated public map records from Airtable.
// Only exposes the fields needed for the public map — no PII like email/name.
// Token is read server-side only — never exposed to the browser.

const PUBLIC_FIELDS = [
  "Estabelecimento", "Tipo", "Cidade", "Estado",
  "Latitude", "Longitude", "Analise IA", "Data Registro",
  "Forma de Venda", "Preco por kg",
];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE || "Table 1";

  if (!token || !baseId) {
    return res.status(500).json({ error: "Airtable env vars not configured" });
  }

  try {
    let records = [];
    let offset = null;

    do {
      const url = new URL(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
      );
      for (const f of PUBLIC_FIELDS) url.searchParams.append("fields[]", f);
      if (offset) url.searchParams.set("offset", offset);

      const airtableRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!airtableRes.ok) {
        const err = await airtableRes.json();
        return res.status(airtableRes.status).json({ error: err?.error?.message || "Airtable error" });
      }

      const data = await airtableRes.json();
      records = [...records, ...(data.records || [])];
      offset = data.offset || null;
    } while (offset);

    // Cache for 2 minutes — map data is near-realtime but doesn't need to be instant
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
    return res.status(200).json({ records });
  } catch (e) {
    console.error("[airtable-records]", e.message);
    return res.status(500).json({ error: "Erro ao carregar registros" });
  }
}
