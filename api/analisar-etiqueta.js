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

  // images: array of base64 JPEG strings
  // choices: { "Especie Declarada": [...], "Origem": [...], "Forma de Venda": [...], "Tipo": [...] }
  const { images, choices = {} } = req.body;
  if (!images || !images.length) {
    return res.status(400).json({ error: "images required" });
  }

  // Build readable option lists for the prompt
  const listOrEmpty = (key) => {
    const opts = choices[key];
    if (!opts || !opts.length) return "(lista indisponível — retorne o texto literal)";
    return opts.map(o => `"${o}"`).join(", ");
  };

  const especieOpts   = listOrEmpty("Especie Declarada");
  const origemOpts    = listOrEmpty("Origem");
  const formaVendaOpts = listOrEmpty("Forma de Venda");

  const hasOutroEspecie   = (choices["Especie Declarada"]  || []).includes("Outro");
  const hasOutroOrigem    = (choices["Origem"]             || []).includes("Outro");
  const hasOutroFormaVenda = (choices["Forma de Venda"]    || []).includes("Outro");

  // Build content: images first, then prompt
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
    text: `Você é um especialista em identificação de produtos de peixe em mercados brasileiros, com foco em detectar tubarão vendido como "cação". Analise TODAS as imagens fornecidas com máxima atenção, incluindo textos pequenos, rotulagem obrigatória, tabelas nutricionais e texto de lado ou rotacionado.

## Instruções gerais
- Leia TODO o texto visível em TODAS as fotos.
- Se houver dados contraditórios entre fotos, priorize a etiqueta oficial/SIF (rótulo regulatório) sobre o texto de marketing da frente.
- Nunca invente. Se não estiver visível com clareza → null.
- Números com vírgula decimal (ex: "2,5 kg" → 2.5).

## Espécie declarada
Opções válidas: ${especieOpts}
- Busque nomes científicos e mapeie ao nome comum:
  Prionace glauca → Tubarão-azul | Carcharhinus spp. → Tubarão (Carcharhinus) | Sphyrna spp. → Tubarão-martelo | Isurus oxyrinchus → Tubarão-mako | Galeorhinus galeus → Cação-bico-doce | Mustelus spp. → Cação-frango/boca-de-velha | Squalus spp. → Cação-bagre | Rhizoprionodon spp. → Cação-frango | Pseudocarcharias kamoharai → Tubarão-crocodilo
- "Cação azul" = Tubarão-azul (Prionace glauca).
- Se só diz "cação" sem espécie/nome científico, use a opção genérica de cação se disponível${hasOutroEspecie ? '; senão use "Outro"' : ""}.
- Retorne EXATAMENTE uma das opções válidas acima${hasOutroEspecie ? ', ou "Outro" se nenhuma calhar' : ""}. Se usar "Outro", preencha especie_outro com o texto literal da etiqueta.

## Origem
Opções válidas: ${origemOpts}
- Busque: "PRODUTO DE", "PRODUCT OF", "ORIGEM:", "PAÍS DE ORIGEM", "IMPORTADO DE", "PROCEDÊNCIA".
- Um SIF brasileiro ou endereço de importador no Brasil NÃO significa origem Brasil.
- Só coloque Brasil se a etiqueta diz explicitamente origem/produto nacional.
- Retorne EXATAMENTE uma das opções válidas${hasOutroOrigem ? ', ou "Outro" com texto literal em origem_outro' : ""}. Se não encontrar → null.

## Forma de venda
Opções válidas: ${formaVendaOpts}
- CONGELADO se aparecer: "CONGELADO", "PEIXE CONGELADO", "MANTENHA CONGELADO", "-18°C", "CONSERVAR CONGELADO", "FROZEN".
- Corte: "FILÉ"/"FILE"/"FILLET" → filé; "POSTA"/"EM POSTAS" → posta; "INTEIRO", "EVISCERADO".
- CASILLAS IMPRESSAS: muitas etiquetas brasileiras listam todas as opções com caixinhas. Leia APENAS a opção MARCADA (X, ✓ ou caixinha preenchida). Ignore as não marcadas.
- Leia o texto da denominação legal (texto pequeno na parte inferior) — geralmente é a fonte mais confiável.
- Combine conservação + corte para escolher a opção válida mais próxima.
- Retorne EXATAMENTE uma das opções válidas${hasOutroFormaVenda ? ', ou "Outro" com texto em forma_venda_outro' : ""}. Se não puder determinar → null.

## Classificação
- ehCacao: "sim" se claramente tubarão, "talvez" se possível, "nao" se claramente outro peixe, "indeterminado" se não der para saber.
- confianca_geral: "alto", "medio" ou "baixo" para a classificação ehCacao.

Preencha todos os campos que conseguir identificar. Campos não visíveis → null.`,
  });

  // Tool use for structured output
  const extractTool = {
    name: "extract_label_data",
    description: "Extrai dados estruturados de etiquetas de produtos de peixe",
    input_schema: {
      type: "object",
      properties: {
        ehCacao:            { type: "string", enum: ["sim", "talvez", "nao", "indeterminado"] },
        confianca_geral:    { type: "string", enum: ["alto", "medio", "baixo"] },
        observacao:         { type: "string", description: "Mensagem curta para o usuário em português" },
        indicadores:        { type: "array", items: { type: "string" } },
        especie_declarada:  { type: ["string", "null"] },
        especie_outro:      { type: ["string", "null"], description: "Texto literal se especie_declarada = Outro" },
        nome_cientifico:    { type: ["string", "null"] },
        texto_especie_literal: { type: ["string", "null"], description: "Texto exato da etiqueta" },
        origem:             { type: ["string", "null"] },
        origem_outro:       { type: ["string", "null"] },
        forma_venda:        { type: ["string", "null"] },
        forma_venda_outro:  { type: ["string", "null"] },
        conservacao:        { type: ["string", "null"], enum: ["congelado", "resfriado", "fresco", "salgado", null] },
        corte:              { type: ["string", "null"], enum: ["inteiro", "eviscerado", "posta", "file", "pedacos", "outro", null] },
        sem_pele:           { type: ["boolean", "null"] },
        marca:              { type: ["string", "null"] },
        fabricante_importador: { type: ["string", "null"] },
        sif:                { type: ["string", "null"] },
        lote:               { type: ["string", "null"] },
        data_validade:      { type: ["string", "null"], description: "YYYY-MM-DD ou null" },
        peso_kg:            { type: ["number", "null"] },
        preco:              { type: ["number", "null"], description: "Preço total à vista" },
        preco_por_kg:       { type: ["number", "null"] },
        evidencias:         { type: "object", description: "Trecho de texto exato por campo", additionalProperties: { type: "string" } },
        confianca_campos:   { type: "object", description: "alto/medio/baixo por campo", additionalProperties: { type: "string" } },
      },
      required: ["ehCacao", "confianca_geral", "observacao", "indicadores"],
    },
  };

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
        max_tokens: 2000,
        temperature: 0,
        tools: [extractTool],
        tool_choice: { type: "tool", name: "extract_label_data" },
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[analisar-etiqueta] Anthropic HTTP error:", anthropicRes.status, errText.slice(0, 500));
      return res.status(200).json({ success: false, error: "ia_indisponivel", detail: errText.slice(0, 200) });
    }

    const data = await anthropicRes.json();

    // Extract tool use result
    const toolBlock = data.content?.find(c => c.type === "tool_use");
    if (!toolBlock?.input) {
      // Fallback: try to find JSON in text response
      const textContent = data.content?.map(c => c.text || "").join("") || "";
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[analisar-etiqueta] No tool_use or JSON in response");
        return res.status(200).json({ success: false, error: "parse_error" });
      }
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return buildResponse(parsed, choices);
      } catch {
        return res.status(200).json({ success: false, error: "parse_error" });
      }
    }

    return buildResponse(toolBlock.input, choices);

  } catch (e) {
    console.error("[analisar-etiqueta] Unexpected error:", e);
    return res.status(200).json({ success: false, error: "ia_indisponivel" });
  }

  function buildResponse(p, choices) {
    const safeStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const safeNum = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
    const safeArr = (v) => (Array.isArray(v) ? v.filter(s => typeof s === "string") : []);
    const safeBool = (v) => (typeof v === "boolean" ? v : null);

    // Normalize select value against choices list (lowercase, no accents, no hyphens)
    const normalize = (s) => s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-_]/g, " ").trim();
    const matchChoice = (key, val) => {
      if (!val) return null;
      const opts = choices[key] || [];
      if (opts.includes(val)) return val;
      const normVal = normalize(val);
      const found = opts.find(o => normalize(o) === normVal);
      return found || null;
    };

    // Resolve especie: match against Airtable choices
    let especieDeclarada = matchChoice("Especie Declarada", safeStr(p.especie_declarada));
    let especieOutro = null;
    if (!especieDeclarada && safeStr(p.especie_declarada)) {
      const hasOutro = (choices["Especie Declarada"] || []).includes("Outro");
      if (hasOutro) { especieDeclarada = "Outro"; especieOutro = safeStr(p.especie_outro) || safeStr(p.especie_declarada); }
    }

    // Resolve origem
    let origem = matchChoice("Origem", safeStr(p.origem));
    let origemOutro = null;
    if (!origem && safeStr(p.origem)) {
      const hasOutro = (choices["Origem"] || []).includes("Outro");
      if (hasOutro) { origem = "Outro"; origemOutro = safeStr(p.origem_outro) || safeStr(p.origem); }
    }

    // Resolve forma venda
    let formaVenda = matchChoice("Forma de Venda", safeStr(p.forma_venda));
    let formaVendaOutro = null;
    if (!formaVenda && safeStr(p.forma_venda)) {
      const hasOutro = (choices["Forma de Venda"] || []).includes("Outro");
      if (hasOutro) { formaVenda = "Outro"; formaVendaOutro = safeStr(p.forma_venda_outro) || safeStr(p.forma_venda); }
    }

    // Build peso_liquido string from peso_kg
    const pesoKg = safeNum(p.peso_kg);
    const pesoLiquido = pesoKg ? (pesoKg < 1 ? `${Math.round(pesoKg * 1000)} g` : `${pesoKg} kg`) : null;

    return res.status(200).json({
      success: true,
      // Classification
      ehCacao:          safeStr(p.ehCacao)       || "indeterminado",
      confianca:        safeStr(p.confianca_geral) || "baixo",
      observacao:       safeStr(p.observacao)    || "",
      indicadores:      safeArr(p.indicadores),
      // Fields for form
      especie_declarada:    especieDeclarada,
      especie_outro:        especieOutro,
      origem_declarada:     origem,
      origem_outro:         origemOutro,
      forma_venda:          formaVenda,
      forma_venda_outro:    formaVendaOutro,
      marca:                safeStr(p.marca),
      peso_liquido:         pesoLiquido,
      preco_total:          safeNum(p.preco),
      preco_por_kg:         safeNum(p.preco_por_kg),
      // Extra metadata
      nome_cientifico:      safeStr(p.nome_cientifico),
      texto_especie_literal: safeStr(p.texto_especie_literal),
      conservacao:          safeStr(p.conservacao),
      corte:                safeStr(p.corte),
      sem_pele:             safeBool(p.sem_pele),
      sif:                  safeStr(p.sif),
      lote:                 safeStr(p.lote),
      data_validade:        safeStr(p.data_validade),
      fabricante_importador: safeStr(p.fabricante_importador),
      evidencias:           (typeof p.evidencias === "object" && p.evidencias) ? p.evidencias : {},
      confianca_campos:     (typeof p.confianca_campos === "object" && p.confianca_campos) ? p.confianca_campos : {},
    });
  }
}
