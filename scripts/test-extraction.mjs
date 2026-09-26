/**
 * Test script for the label extraction serverless function.
 * Usage:
 *   node scripts/test-extraction.mjs <image1.jpg> [image2.jpg ...]
 *
 * Requires ANTHROPIC_API_KEY in environment (or .env.local file).
 * Simulates the same call the frontend makes to /api/analisar-etiqueta.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";

// Load .env.local if present
try {
  const envPath = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [k, ...vParts] = line.split("=");
      if (k && vParts.length) process.env[k.trim()] = vParts.join("=").trim();
    }
  }
} catch {}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const imagePaths = process.argv.slice(2);
if (!imagePaths.length) {
  console.error("Usage: node scripts/test-extraction.mjs <image1.jpg> [image2.jpg ...]");
  process.exit(1);
}

// Load and encode images
const images = imagePaths.map(p => {
  const abs = resolve(p);
  if (!existsSync(abs)) { console.error(`File not found: ${abs}`); process.exit(1); }
  return readFileSync(abs).toString("base64");
});

// Minimal choices for testing — update these if you know what's in Airtable
const choices = {
  "Especie Declarada": [
    "Cação (não especificado)", "Tubarão-azul", "Tubarão-martelo", "Tubarão-mako",
    "Cação-frango", "Cação-bico-doce", "Outro",
  ],
  "Origem": ["Brasil", "Taiwan", "China", "Argentina", "Chile", "Uruguai", "Outro"],
  "Forma de Venda": [
    "Filé / posta", "Inteiro / eviscerado", "Defumado",
    "Empanado / processado", "Seco / salgado", "Outro",
  ],
  "Tipo": [
    "Supermercado", "Feira livre", "Peixaria", "Restaurante",
    "App de delivery", "Açougue", "Mercado municipal", "Outro",
  ],
};

// Inline the handler logic so we can test without a running server
// (copies the handler from api/analisar-etiqueta.js)
const handlerPath = new URL("../api/analisar-etiqueta.js", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const handlerSrc = readFileSync(handlerPath, "utf8");

// Build content array
const listOrEmpty = (key) => {
  const opts = choices[key];
  if (!opts || !opts.length) return "(lista indisponível — retorne o texto literal)";
  return opts.map(o => `"${o}"`).join(", ");
};

const hasOutroEspecie   = (choices["Especie Declarada"] || []).includes("Outro");
const hasOutroOrigem    = (choices["Origem"]            || []).includes("Outro");
const hasOutroFormaVenda = (choices["Forma de Venda"]   || []).includes("Outro");

const content = [];
images.forEach((b64, i) => {
  if (images.length > 1) content.push({ type: "text", text: `Imagem ${i + 1}:` });
  content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
});

content.push({
  type: "text",
  text: `Você é um especialista em identificação de produtos de peixe em mercados brasileiros, com foco em detectar tubarão vendido como "cação". Analise TODAS as imagens fornecidas com máxima atenção, incluindo textos pequenos, rotulagem obrigatória, tabelas nutricionais e texto de lado ou rotacionado.

## Instruções gerais
- Leia TODO o texto visível em TODAS as fotos.
- Se houver dados contraditórios entre fotos, priorize a etiqueta oficial/SIF sobre o texto de marketing.
- Nunca invente. Se não estiver visível com clareza → null.
- Números com vírgula decimal (ex: "2,5 kg" → 2.5).

## Espécie declarada
Opções válidas: ${listOrEmpty("Especie Declarada")}
- Prionace glauca → Tubarão-azul | Carcharhinus spp. → Tubarão (Carcharhinus) | Sphyrna spp. → Tubarão-martelo | Isurus oxyrinchus → Tubarão-mako | Galeorhinus galeus → Cação-bico-doce | Mustelus spp. → Cação-frango/boca-de-velha | Squalus spp. → Cação-bagre | Rhizoprionodon spp. → Cação-frango | Pseudocarcharias kamoharai → Tubarão-crocodilo
- "Cação azul" = Tubarão-azul (Prionace glauca).${hasOutroEspecie ? '\n- Se nenhuma opção calhar, use "Outro" + especie_outro com texto literal.' : ""}

## Origem
Opções válidas: ${listOrEmpty("Origem")}
- Busque: "PRODUTO DE", "PRODUCT OF", "ORIGEM:", "IMPORTADO DE". SIF brasileiro ≠ origem Brasil.${hasOutroOrigem ? '\n- Se não encontrar opção exata, use "Outro" + origem_outro.' : ""}

## Forma de venda
Opções válidas: ${listOrEmpty("Forma de Venda")}
- Congelado: "CONGELADO", "PEIXE CONGELADO", "-18°C", "FROZEN".
- Corte: "FILÉ"/"FILE" → filé; "POSTA"/"EM POSTAS" → posta.
- CASILLAS: só conta a opção MARCADA (X, ✓). Ignore as não marcadas.${hasOutroFormaVenda ? '\n- Se não calhar, use "Outro" + forma_venda_outro.' : ""}`,
});

const extractTool = {
  name: "extract_label_data",
  description: "Extrai dados estruturados de etiquetas de produtos de peixe",
  input_schema: {
    type: "object",
    properties: {
      ehCacao:            { type: "string", enum: ["sim", "talvez", "nao", "indeterminado"] },
      confianca_geral:    { type: "string", enum: ["alto", "medio", "baixo"] },
      observacao:         { type: "string" },
      indicadores:        { type: "array", items: { type: "string" } },
      especie_declarada:  { type: ["string", "null"] },
      especie_outro:      { type: ["string", "null"] },
      nome_cientifico:    { type: ["string", "null"] },
      texto_especie_literal: { type: ["string", "null"] },
      origem:             { type: ["string", "null"] },
      origem_outro:       { type: ["string", "null"] },
      forma_venda:        { type: ["string", "null"] },
      forma_venda_outro:  { type: ["string", "null"] },
      conservacao:        { type: ["string", "null"], enum: ["congelado", "resfriado", "fresco", "salgado", null] },
      corte:              { type: ["string", "null"], enum: ["inteiro", "eviscerado", "posta", "file", "pedacos", "outro", null] },
      sem_pele:           { type: ["boolean", "null"] },
      marca:              { type: ["string", "null"] },
      sif:                { type: ["string", "null"] },
      data_validade:      { type: ["string", "null"] },
      peso_kg:            { type: ["number", "null"] },
      preco:              { type: ["number", "null"] },
      preco_por_kg:       { type: ["number", "null"] },
      evidencias:         { type: "object", additionalProperties: { type: "string" } },
      confianca_campos:   { type: "object", additionalProperties: { type: "string" } },
    },
    required: ["ehCacao", "confianca_geral", "observacao", "indicadores"],
  },
};

console.log(`\nAnalysing ${images.length} image(s)...`);

const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    tool_choice: { type: "any" },
    messages: [{ role: "user", content }],
  }),
});

if (!response.ok) {
  console.error("API error:", response.status, await response.text());
  process.exit(1);
}

const data = await response.json();
const toolBlock = data.content?.find(c => c.type === "tool_use");

if (!toolBlock?.input) {
  console.error("No tool_use in response. Full response:");
  console.log(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\n=== RAW EXTRACTION ===");
console.log(JSON.stringify(toolBlock.input, null, 2));

// Show form mapping
const p = toolBlock.input;
const normalize = (s) => s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-_]/g, " ").trim();
const matchChoice = (key, val) => {
  if (!val) return null;
  const opts = choices[key] || [];
  if (opts.includes(val)) return val;
  return opts.find(o => normalize(o) === normalize(val)) || null;
};

console.log("\n=== FORM MAPPING ===");
console.log("ehCacao:          ", p.ehCacao);
console.log("confianca_geral:  ", p.confianca_geral);
console.log("especie_declarada:", matchChoice("Especie Declarada", p.especie_declarada) || `(no match → Outro: "${p.especie_outro || p.especie_declarada}")`);
console.log("nome_cientifico:  ", p.nome_cientifico);
console.log("texto_literal:    ", p.texto_especie_literal);
console.log("origem:           ", matchChoice("Origem", p.origem) || `(no match → Outro: "${p.origem_outro || p.origem}")`);
console.log("forma_venda:      ", matchChoice("Forma de Venda", p.forma_venda) || `(no match → Outro: "${p.forma_venda_outro || p.forma_venda}")`);
console.log("conservacao:      ", p.conservacao);
console.log("corte:            ", p.corte);
console.log("sem_pele:         ", p.sem_pele);
console.log("marca:            ", p.marca);
console.log("peso_kg:          ", p.peso_kg);
console.log("preco:            ", p.preco);
console.log("preco_por_kg:     ", p.preco_por_kg);
console.log("sif:              ", p.sif);
console.log("data_validade:    ", p.data_validade);
if (p.evidencias && Object.keys(p.evidencias).length) {
  console.log("\n=== EVIDÊNCIAS ===");
  for (const [k, v] of Object.entries(p.evidencias)) console.log(`  ${k}: "${v}"`);
}
