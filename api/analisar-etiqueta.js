// Vercel serverless function — proxies Anthropic API to avoid CORS and
// keep the API key server-side (never sent to the browser).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { images } = req.body; // array of base64 JPEG strings
  if (!images || !images.length) {
    return res.status(400).json({ error: "images required" });
  }

  // Build message content: images first, then the extraction prompt
  const content = [];
  images.forEach((b64, i) => {
    if (images.length > 1) {
      content.push({ type: "text", text: `Imagem ${i + 1}:` });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  content.push({
    type: "text",
    text: `Você é um assistente que extrai informações estruturadas de fotos de etiquetas de produtos de peixe/pescado vendidos em mercados brasileiros, para um app de denúncia de venda de tubarão rotulado como "cação".

Analise a(s) imagem(ns) fornecida(s) e extraia os seguintes campos. Retorne exclusivamente um JSON válido, sem texto adicional, no formato:

{
  "ehCacao": "sim|talvez|nao|indeterminado",
  "confianca": "alto|medio|baixo",
  "observacao": "mensagem curta para o usuário em português",
  "indicadores": ["string"],
  "especie_declarada": string ou null,
  "marca": string ou null,
  "preco_por_kg": number ou null,
  "forma_venda": string ou null,
  "origem_declarada": string ou null
}

Regras:
- "ehCacao": avalie se o produto é provável tubarão ("sim"), possível ("talvez"), não identificado ("nao") ou indeterminado ("indeterminado").
- "especie_declarada": copie o texto como aparece na etiqueta, sem traduzir ou corrigir.
- "marca": nome da marca do produto, se visível na embalagem ou etiqueta.
- "preco_por_kg": preço por quilo como número, sem símbolo de moeda. Se só houver preço total (não por kg), retorne null.
- "forma_venda": inferido da embalagem, texto ou aparência (ex: "Filé congelado", "Posta", "Inteiro", "A granel").
- "origem_declarada": apenas se estiver explicitamente escrita na etiqueta.
- Se um campo não puder ser determinado com confiança, retorne null — não invente nem estime.
- Se houver mais de uma foto, considere todas antes de responder.`,
  });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[analisar-etiqueta] Anthropic error:", anthropicRes.status, errText);
      return res.status(200).json({ success: false, error: "ia_indisponivel" });
    }

    const data = await anthropicRes.json();
    const text = data.content?.map((c) => c.text || "").join("") || "";
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      return res.status(200).json({ success: true, ...parsed });
    } catch (parseErr) {
      console.error("[analisar-etiqueta] JSON parse error:", parseErr, "raw:", text);
      return res.status(200).json({ success: false, error: "parse_error" });
    }
  } catch (e) {
    console.error("[analisar-etiqueta] Unexpected error:", e);
    return res.status(200).json({ success: false, error: "ia_indisponivel" });
  }
}
