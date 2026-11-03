// Serverless proxy: returns select-field choices from Airtable table metadata.
// Token is read server-side only — never exposed to the browser.

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
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.json();
      return res.status(airtableRes.status).json({ error: err?.error?.message || "Airtable error" });
    }

    const data = await airtableRes.json();
    const tableInfo = data.tables?.find(t => t.name === table);
    if (!tableInfo) return res.status(200).json({});

    const choices = {};
    for (const field of tableInfo.fields || []) {
      if (field.options?.choices) {
        choices[field.name] = field.options.choices.map(c => c.name);
      }
    }

    // Cache for 5 minutes — schema changes rarely
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json(choices);
  } catch (e) {
    console.error("[airtable-schema]", e.message);
    return res.status(500).json({ error: "Erro ao carregar schema" });
  }
}
