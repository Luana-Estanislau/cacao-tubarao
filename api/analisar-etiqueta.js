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

  const { images } = req.body; // array of base64 JPEG strings (full resolution, no extra compression)
  if (!images || !images.length) {
    return res.status(400).json({ error: "images required" });
  }

  // Images FIRST, then the text prompt — order matters for OCR quality
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

Analise a(s) imagem(ns) fornecida(s) e extraia os seguintes campos. Retorne EXCLUSIVAMENTE um JSON válido, sem texto antes ou depois, no formato:

{
  "ehCacao": "sim|talvez|nao|indeterminado",
  "confianca": "alto|medio|baixo",
  "observacao": "mensagem curta para o usuário em português",
  "indicadores": ["string"],
  "especie_declarada": string ou null,
  "marca": string ou null,
  "preco_por_kg": number ou null,
  "peso_liquido": string ou null,
  "preco_total": number ou null,
  "forma_venda": string ou null,
  "origem_declarada": string ou null
}

Regras de extração:
- "ehCacao": avalie se o produto é provável tubarão ("sim"), possível ("talvez"), não identificado ("nao") ou indeterminado ("indeterminado").
- "especie_declarada": copie o texto como aparece na etiqueta (ex: "Cação", "Peixe-espada"), sem traduzir ou corrigir.
- "marca": nome da marca impressa na embalagem ou etiqueta. null se não visível.
- "preco_por_kg": preço por quilo como número decimal (ex: 29.90). null se não encontrado ou se só houver preço total.
- "peso_liquido": peso do produto como string incluindo unidade (ex: "500 g", "1 kg", "2,5 kg"). null se não encontrado.
- "preco_total": valor TOTAL R$ do produto como número decimal (ex: 14.95). IGNORAR completamente qualquer campo "Total Cartão", "Total Débito", "Total Crédito" ou similar — capturar APENAS o total à vista / total em dinheiro. null se não encontrado.
- "forma_venda": inferido da embalagem ou texto (ex: "Filé congelado", "Posta", "Inteiro", "A granel"). null se indeterminado.
- "origem_declarada": apenas se estiver explicitamente escrita na etiqueta. null caso contrário.
- Se um campo não puder ser determinado com confiança, retorne null — jamais invente nem estime.
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
        max_tokens: 800,
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

    // Robust JSON extraction: find the first {...} block in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[analisar-etiqueta] No JSON object in response:", text);
      return res.status(200).json({ success: false, error: "parse_error" });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate expected fields and types before returning
      const safeStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const safeNum = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
      const safeArr = (v) => (Array.isArray(v) ? v.filter(s => typeof s === "string") : []);

      return res.status(200).json({
        success: true,
        ehCacao:          safeStr(parsed.ehCacao)          || "indeterminado",
        confianca:        safeStr(parsed.confianca)        || "baixo",
        observacao:       safeStr(parsed.observacao)       || "",
        indicadores:      safeArr(parsed.indicadores),
        especie_declarada: safeStr(parsed.especie_declarada),
        marca:            safeStr(parsed.marca),
        preco_por_kg:     safeNum(parsed.preco_por_kg),
        peso_liquido:     safeStr(parsed.peso_liquido),
        preco_total:      safeNum(parsed.preco_total),
        forma_venda:      safeStr(parsed.forma_venda),
        origem_declarada: safeStr(parsed.origem_declarada),
      });
    } catch (parseErr) {
      console.error("[analisar-etiqueta] JSON parse error:", parseErr, "raw:", text);
      return res.status(200).json({ success: false, error: "parse_error" });
    }
  } catch (e) {
    console.error("[analisar-etiqueta] Unexpected error:", e);
    return res.status(200).json({ success: false, error: "ia_indisponivel" });
  }
}
