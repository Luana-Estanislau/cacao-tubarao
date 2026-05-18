import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// 🔑 CONFIGURAÇÃO — credenciais via variáveis de ambiente
// ============================================================
const AIRTABLE_TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = "Table 1";

const TIPOS_ESTABELECIMENTO = [
  "Supermercado","Feira livre","Peixaria","Restaurante",
  "App de delivery","Açougue","Mercado municipal","Outro",
];

const FORMAS_VENDA = [
  "Filé / posta","Inteiro / eviscerado","Defumado",
  "Empanado / processado","Seco / salgado","Outro",
];

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
];

// Converte nome completo do estado → sigla
const ESTADO_NOME_PARA_SIGLA = {
  "Acre":"AC","Alagoas":"AL","Amapá":"AP","Amazonas":"AM",
  "Bahia":"BA","Ceará":"CE","Distrito Federal":"DF","Espírito Santo":"ES",
  "Goiás":"GO","Maranhão":"MA","Mato Grosso":"MT","Mato Grosso do Sul":"MS",
  "Minas Gerais":"MG","Pará":"PA","Paraíba":"PB","Paraná":"PR",
  "Pernambuco":"PE","Piauí":"PI","Rio de Janeiro":"RJ","Rio Grande do Norte":"RN",
  "Rio Grande do Sul":"RS","Rondônia":"RO","Roraima":"RR","Santa Catarina":"SC",
  "São Paulo":"SP","Sergipe":"SE","Tocantins":"TO",
};

function normalizeEstado(raw) {
  if (!raw) return "";
  const upper = raw.toUpperCase().trim();
  // já é sigla
  if (ESTADOS_BR.includes(upper)) return upper;
  // nome completo
  return ESTADO_NOME_PARA_SIGLA[raw.trim()] || "";
}

const STEPS = ["foto","local","produto","envio"];
const STEP_LABELS = { foto:"Foto", local:"Local", produto:"Produto", envio:"Enviar" };

// ─── Airtable ────────────────────────────────────────────────
async function saveToAirtable(fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || "Erro ao salvar");
  }
  return res.json();
}

// ─── ViaCEP ──────────────────────────────────────────────────
async function fetchCEP(cep) {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) throw new Error("CEP inválido");
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await res.json();
  if (data.erro) throw new Error("CEP não encontrado");
  return data;
}

// ─── Nominatim reverse geocode ────────────────────────────────
async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`
  );
  const data = await res.json();
  return data.address || {};
}

// ─── Claude image analysis ────────────────────────────────────
async function analyzeSharkImage(base64Image) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64Image },
          },
          {
            type: "text",
            text: `Você é especialista em identificar produtos de tubarão vendidos no Brasil como "cação".
Analise a imagem e responda SOMENTE em JSON válido sem markdown:
{
  "ehCacao": "sim|talvez|nao|indeterminado",
  "descricao": "string breve",
  "indicadores": ["string"],
  "confianca": "alto|medio|baixo",
  "observacao": "mensagem curta para o usuário em português"
}`,
          },
        ],
      }],
    }),
  });
  const data = await response.json();
  const text = data.content.map((i) => i.text || "").join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── Leaflet Map Component (injected via CDN) ─────────────────
function MapPicker({ lat, lng, onLocationChange }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    // Load Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const loadLeaflet = () => {
      if (window.L) { initMap(); return; }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (!containerRef.current || mapInstanceRef.current) return;
      const L = window.L;
      const centerLat = lat || -15.7801;
      const centerLng = lng || -47.9292;

      const map = L.map(containerRef.current, { zoomControl: true }).setView([centerLat, centerLng], lat ? 16 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        html: `<div style="width:32px;height:32px;background:#00c8a0;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: "",
      });

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", async (e) => {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          const addr = await reverseGeocode(newLat, newLng);
          onLocationChange({ lat: newLat, lng: newLng, addr });
        });
      }

      map.on("click", async (e) => {
        const { lat: newLat, lng: newLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        } else {
          markerRef.current = L.marker([newLat, newLng], { icon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", async (ev) => {
            const { lat: dLat, lng: dLng } = ev.target.getLatLng();
            const addr = await reverseGeocode(dLat, dLng);
            onLocationChange({ lat: dLat, lng: dLng, addr });
          });
        }
        const addr = await reverseGeocode(newLat, newLng);
        onLocationChange({ lat: newLat, lng: newLng, addr });
      });

      mapInstanceRef.current = map;
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,200,160,0.2)" }}
    />
  );
}

// ─── Subcomponents ────────────────────────────────────────────
function SharkIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path d="M10 42 C18 35,28 30,40 32 C52 34,62 38,70 36 C62 44,52 48,40 46 C32 44,22 46,18 52 Z" fill="#00c8a0" opacity="0.9"/>
      <path d="M40 32 L44 18 L36 30 Z" fill="#00c8a0" opacity="0.7"/>
      <path d="M28 44 L24 56 L34 46 Z" fill="#00c8a0" opacity="0.6"/>
      <circle cx="62" cy="37" r="2" fill="#001a2c"/>
      <path d="M64 40 C66 42,66 44,64 45" stroke="#001a2c" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

function ProgressBar({ currentStep }) {
  const idx = STEPS.indexOf(currentStep);
  return (
    <div style={{ display:"flex", alignItems:"center", width:"100%" }}>
      {STEPS.map((step, i) => (
        <div key={step} style={{ display:"flex", alignItems:"center", flex: i < STEPS.length-1 ? 1 : 0 }}>
          <div style={{
            width:28, height:28, borderRadius:"50%",
            background: i <= idx ? "#00c8a0" : "rgba(255,255,255,0.1)",
            border: i === idx ? "2px solid #7fffd4" : "2px solid transparent",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontWeight:700,
            color: i <= idx ? "#001a2c" : "rgba(255,255,255,0.3)",
            flexShrink:0, fontFamily:"'Space Mono',monospace", transition:"all 0.3s",
          }}>
            {i < idx ? "✓" : i+1}
          </div>
          {i < STEPS.length-1 && (
            <div style={{ flex:1, height:2, margin:"0 4px", transition:"background 0.3s",
              background: i < idx ? "#00c8a0" : "rgba(255,255,255,0.08)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function AIBadge({ result }) {
  const map = {
    sim:          { bg:"#ff4757", text:"#fff",     label:"⚠ Provável tubarão" },
    talvez:       { bg:"#ffa502", text:"#001a2c",  label:"? Possível tubarão" },
    nao:          { bg:"#2ed573", text:"#001a2c",  label:"✓ Não parece tubarão" },
    indeterminado:{ bg:"rgba(255,255,255,0.12)", text:"#fff", label:"~ Inconclusivo" },
  };
  const c = map[result.ehCacao] || map.indeterminado;
  return (
    <div style={{ background:c.bg, color:c.text, borderRadius:10, padding:"10px 14px", marginTop:10, fontSize:13 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:4, fontFamily:"'Space Mono',monospace" }}>{c.label}</div>
      <div style={{ opacity:0.85, lineHeight:1.5 }}>{result.observacao}</div>
      {result.indicadores?.length > 0 && (
        <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4 }}>
          {result.indicadores.map((ind,i) => (
            <span key={i} style={{ background:"rgba(0,0,0,0.2)", borderRadius:4, padding:"2px 6px", fontSize:11 }}>{ind}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop:6, fontSize:11, opacity:0.55 }}>Confiança da IA: {result.confianca}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const S = {
  input: {
    width:"100%", background:"rgba(255,255,255,0.06)",
    border:"1px solid rgba(255,255,255,0.1)", borderRadius:8,
    padding:"10px 12px", color:"#e8f4f0", fontSize:14,
    fontFamily:"'DM Sans',sans-serif", outline:"none",
    boxSizing:"border-box", transition:"border 0.2s",
  },
  label: {
    display:"block", fontSize:11, fontWeight:700,
    color:"#7fffd4", marginBottom:5, textTransform:"uppercase",
    letterSpacing:"0.08em", fontFamily:"'Space Mono',monospace",
  },
  group: { marginBottom:14 },
  btnPrimary: {
    width:"100%", padding:"13px", borderRadius:10, border:"none",
    background:"linear-gradient(135deg,#00c8a0,#00a080)",
    color:"#001a2c", fontWeight:800, fontSize:15, cursor:"pointer",
    fontFamily:"'Space Mono',monospace", transition:"all 0.2s",
  },
  btnSecondary: {
    width:"100%", padding:"12px", borderRadius:10,
    background:"rgba(0,200,160,0.08)", border:"1px solid rgba(0,200,160,0.35)",
    color:"#00c8a0", fontWeight:700, fontSize:14, cursor:"pointer",
    fontFamily:"'Space Mono',monospace",
  },
  btnGhost: {
    padding:"13px 20px", borderRadius:10,
    border:"1px solid rgba(255,255,255,0.1)",
    background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.55)",
    cursor:"pointer", fontSize:15, fontWeight:600,
  },
};

// ─── Main App ─────────────────────────────────────────────────
export default function CacaoApp() {
  const [step, setStep]           = useState("foto");
  const [foto, setFoto]           = useState(null);
  const [fotoBase64, setFotoBase64] = useState(null);
  const [aiResult, setAiResult]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState(null);
  const fileRef = useRef();

  const [form, setForm] = useState({
    nomeEstabelecimento:"", tipoEstabelecimento:"",
    cep:"", endereco:"", numero:"", cidade:"", estado:"",
    latitude:null, longitude:null,
    googlePlaceId:"", fonteLocalizacao:"",
    formaVenda:"", precoKg:"",
    especieDeclarada:"", origem:"", observacoes:"",
    nome:"", email:"", concordo:false,
  });

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError]     = useState(null);
  const [geoStatus, setGeoStatus]   = useState("idle");
  const [showMap, setShowMap]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Foto ──
  function handleFotoUpload(file) {
    if (!file) return;
    setFoto(URL.createObjectURL(file));
    setAiResult(null); setAiError(null);
    const reader = new FileReader();
    reader.onload = e => setFotoBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    if (!fotoBase64) return;
    setAiLoading(true); setAiError(null);
    try { setAiResult(await analyzeSharkImage(fotoBase64)); }
    catch { setAiError("Não foi possível analisar. Continue mesmo assim."); }
    finally { setAiLoading(false); }
  }

  // ── CEP ──
  async function handleCEP(raw) {
    upd("cep", raw);
    const clean = raw.replace(/\D/g,"");
    if (clean.length !== 8) { setCepError(null); return; }
    setCepLoading(true); setCepError(null);
    try {
      const d = await fetchCEP(clean);
      setForm(f => ({
        ...f,
        endereco: d.logradouro || f.endereco,
        cidade:   d.localidade  || f.cidade,
        estado:   d.uf          || f.estado,
        fonteLocalizacao: "CEP",
      }));
    } catch(e) { setCepError(e.message); }
    finally { setCepLoading(false); }
  }

  // ── GPS ──
  async function handleGPS() {
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        try {
          const addr = await reverseGeocode(latitude, longitude);
          setForm(f => ({
            ...f,
            latitude, longitude,
            endereco: addr.road ? `${addr.road}${addr.house_number ? ", "+addr.house_number : ""}` : f.endereco,
            cidade:   addr.city || addr.town || addr.village || f.cidade,
            estado:   normalizeEstado(addr.state) || f.estado,
            fonteLocalizacao: "GPS",
          }));
          setGeoStatus("ok");
          setShowMap(true);
        } catch { setGeoStatus("error"); }
      },
      () => setGeoStatus("error")
    );
  }

  // ── Map pin ──
  const handleMapLocation = useCallback(async ({ lat, lng, addr }) => {
    setForm(f => ({
      ...f,
      latitude: lat, longitude: lng,
      endereco: addr.road ? `${addr.road}${addr.house_number ? ", "+addr.house_number:""}` : f.endereco,
      cidade:   addr.city || addr.town || addr.village || f.cidade,
      estado:   normalizeEstado(addr.state) || f.estado,
      fonteLocalizacao: "Mapa",
    }));
  }, []);

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true); setSubmitError(null);
    try {
      const fields = {
        "Estabelecimento":    form.nomeEstabelecimento,
        "Tipo":               form.tipoEstabelecimento,
        "CEP":                form.cep,
        "Endereco":           form.numero ? `${form.endereco}, ${form.numero}` : form.endereco,
        "Cidade":             form.cidade,
        "Estado":             form.estado,
        "Latitude":           form.latitude  ? parseFloat(form.latitude)  : undefined,
        "Longitude":          form.longitude ? parseFloat(form.longitude) : undefined,
        "Fonte Localizacao":  form.fonteLocalizacao,
        "Forma de Venda":     form.formaVenda,
        "Preco por kg":       form.precoKg ? parseFloat(form.precoKg) : undefined,
        "Especie Declarada":  form.especieDeclarada,
        "Origem":             form.origem,
        "Analise IA":         aiResult?.ehCacao || "indeterminado",
        "Observacoes":        form.observacoes,
        "Nome Reportante":    form.nome,
        "Email Reportante":   form.email,
        "Data e Hora":        new Date().toISOString(),
      };
      // Remove undefined
      Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);
      await saveToAirtable(fields);
      setSubmitted(true);
    } catch(e) {
      setSubmitError(e.message || "Erro ao salvar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetApp() {
    setStep("foto"); setFoto(null); setFotoBase64(null);
    setAiResult(null); setAiError(null); setSubmitted(false);
    setSubmitError(null); setShowMap(false); setGeoStatus("idle");
    setForm({
      nomeEstabelecimento:"", tipoEstabelecimento:"",
      cep:"", endereco:"", numero:"", cidade:"", estado:"",
      latitude:null, longitude:null,
      googlePlaceId:"", fonteLocalizacao:"",
      formaVenda:"", precoKg:"",
      especieDeclarada:"", origem:"", observacoes:"",
      nome:"", email:"", concordo:false,
    });
  }

  const idx = STEPS.indexOf(step);
  const canNext = {
    foto: true,
    local: !!(form.nomeEstabelecimento && form.cidade && form.estado),
    produto: true,
    envio: true,
  };

  // ════════════════════════════════════════════════════════════
  // STEP RENDERS
  // ════════════════════════════════════════════════════════════

  const StepFoto = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:700, margin:"0 0 6px", fontFamily:"'Space Mono',monospace" }}>
        Fotografe o produto
      </h2>
      <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, margin:"0 0 20px", lineHeight:1.6 }}>
        Tire uma foto da etiqueta, produto ou display de venda. A IA vai analisar se parece tubarão.
      </p>

      {!foto ? (
        <div
          onClick={() => fileRef.current.click()}
          style={{
            border:"2px dashed rgba(0,200,160,0.35)", borderRadius:16,
            padding:"44px 20px", textAlign:"center", cursor:"pointer",
            background:"rgba(0,200,160,0.03)", transition:"all 0.2s",
          }}
          onMouseOver={e => e.currentTarget.style.borderColor="#00c8a0"}
          onMouseOut={e  => e.currentTarget.style.borderColor="rgba(0,200,160,0.35)"}
        >
          <div style={{ fontSize:44, marginBottom:10 }}>📸</div>
          <div style={{ color:"#00c8a0", fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:13 }}>
            Toque para adicionar foto
          </div>
          <div style={{ color:"rgba(255,255,255,0.3)", fontSize:12, marginTop:5 }}>Câmera ou galeria</div>
        </div>
      ) : (
        <div>
          <div style={{ position:"relative", borderRadius:12, overflow:"hidden", marginBottom:10 }}>
            <img src={foto} alt="Produto" style={{ width:"100%", maxHeight:240, objectFit:"cover", display:"block" }} />
            <button onClick={() => { setFoto(null); setFotoBase64(null); setAiResult(null); }}
              style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", color:"#fff",
                border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>
          </div>

          {!aiResult && !aiLoading && (
            <button onClick={handleAnalyze} style={{ ...S.btnSecondary, marginBottom:8 }}>
              🦈 Analisar com IA
            </button>
          )}
          {aiLoading && (
            <div style={{ textAlign:"center", padding:14, color:"#7fffd4",
              fontFamily:"'Space Mono',monospace", fontSize:13,
              background:"rgba(0,200,160,0.06)", borderRadius:8 }}>
              Analisando imagem...
            </div>
          )}
          {aiError && (
            <div style={{ color:"#ffa502", fontSize:13, padding:10,
              background:"rgba(255,165,2,0.07)", borderRadius:8 }}>{aiError}</div>
          )}
          {aiResult && <AIBadge result={aiResult} />}
          <button onClick={() => fileRef.current.click()}
            style={{ width:"100%", marginTop:8, padding:9, borderRadius:8,
              background:"transparent", border:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:13 }}>
            Trocar foto
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display:"none" }} onChange={e => handleFotoUpload(e.target.files[0])} />

      <div style={{ marginTop:12, padding:"10px 12px", background:"rgba(255,255,255,0.03)",
        borderRadius:8, fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.6 }}>
        💡 <strong style={{ color:"rgba(255,255,255,0.55)" }}>Dica:</strong> Inclua etiqueta com preço.
        Se possível, pergunte a origem da espécie ao vendedor.
      </div>
    </div>
  );

  // ── LOCAL ──
  const StepLocal = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:700, margin:"0 0 6px", fontFamily:"'Space Mono',monospace" }}>
        Onde foi encontrado?
      </h2>
      <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, margin:"0 0 18px", lineHeight:1.6 }}>
        Escolha como localizar o estabelecimento.
      </p>

      {/* 3 métodos — mutuamente exclusivos */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
        {[
          { icon:"📍", label:"GPS", active: geoStatus==="ok" || geoStatus==="loading",
            action: () => { setShowMap(false); handleGPS(); } },
          { icon:"🗺️", label:"Mapa", active: showMap && geoStatus!=="ok",
            action: () => { setGeoStatus("idle"); setShowMap(v => !v); } },
          { icon:"📮", label:"CEP", active: form.fonteLocalizacao==="CEP",
            action: () => { setShowMap(false); setGeoStatus("idle");
              document.getElementById("campo-cep")?.focus(); } },
        ].map(({ icon, label, action, active }) => (
          <button key={label} onClick={action} style={{
            padding:"10px 6px", borderRadius:8, cursor:"pointer",
            background: active ? "rgba(0,200,160,0.15)" : "rgba(255,255,255,0.05)",
            border: active ? "1px solid #00c8a0" : "1px solid rgba(255,255,255,0.08)",
            color: active ? "#00c8a0" : "rgba(255,255,255,0.6)",
            fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, textAlign:"center",
          }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
            {geoStatus==="loading" && label==="GPS" ? "..." : label}
          </button>
        ))}
      </div>

      {/* CEP */}
      <div style={S.group}>
        <label style={S.label}>CEP</label>
        <div style={{ position:"relative" }}>
          <input
            id="campo-cep"
            style={{ ...S.input, paddingRight:36 }}
            placeholder="00000-000"
            value={form.cep}
            onChange={e => handleCEP(e.target.value)}
            maxLength={9}
          />
          {cepLoading && (
            <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
              color:"#00c8a0", fontSize:12 }}>...</div>
          )}
        </div>
        {cepError && <div style={{ color:"#ff6b6b", fontSize:12, marginTop:4 }}>{cepError}</div>}
        {form.fonteLocalizacao === "CEP" && !cepError && (
          <div style={{ color:"#00c8a0", fontSize:12, marginTop:4 }}>✓ Endereço preenchido via CEP</div>
        )}
      </div>

      {/* Mapa */}
      {showMap && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Clique no mapa para marcar o local</label>
          <MapPicker lat={form.latitude} lng={form.longitude} onLocationChange={handleMapLocation} />
          {form.fonteLocalizacao === "Mapa" && (
            <div style={{ color:"#00c8a0", fontSize:12, marginTop:6 }}>
              ✓ Pin: {form.latitude?.toFixed(5)}, {form.longitude?.toFixed(5)}
            </div>
          )}
        </div>
      )}

      {/* Nome */}
      <div style={S.group}>
        <label style={S.label}>Nome do estabelecimento *</label>
        <input style={S.input} placeholder="Ex: Mercadão do João, Carrefour Ipanema..."
          value={form.nomeEstabelecimento} onChange={e => upd("nomeEstabelecimento", e.target.value)} />
      </div>

      {/* Tipo */}
      <div style={S.group}>
        <label style={S.label}>Tipo *</label>
        <select style={{ ...S.input, appearance:"none" }}
          value={form.tipoEstabelecimento} onChange={e => upd("tipoEstabelecimento", e.target.value)}>
          <option value="">Selecione...</option>
          {TIPOS_ESTABELECIMENTO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Endereço + Número */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 100px", gap:10 }}>
        <div style={S.group}>
          <label style={S.label}>Endereço</label>
          <input style={S.input} placeholder="Rua, avenida..."
            value={form.endereco} onChange={e => upd("endereco", e.target.value)} />
        </div>
        <div style={S.group}>
          <label style={S.label}>Número</label>
          <input style={S.input} placeholder="Ex: 142"
            value={form.numero || ""} onChange={e => upd("numero", e.target.value)} />
        </div>
      </div>

      {/* Cidade + Estado */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 90px", gap:10 }}>
        <div style={S.group}>
          <label style={S.label}>Cidade *</label>
          <input style={S.input} placeholder="São Paulo"
            value={form.cidade} onChange={e => upd("cidade", e.target.value)} />
        </div>
        <div style={S.group}>
          <label style={S.label}>Estado *</label>
          <select style={{ ...S.input, appearance:"none" }}
            value={form.estado} onChange={e => upd("estado", e.target.value)}>
            <option value="">UF</option>
            {ESTADOS_BR.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  // ── PRODUTO ──
  const StepProduto = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:700, margin:"0 0 6px", fontFamily:"'Space Mono',monospace" }}>
        Dados do produto
      </h2>
      <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, margin:"0 0 20px", lineHeight:1.6 }}>
        Quanto mais detalhes, mais útil é o registro para a pesquisa.
      </p>

      <div style={S.group}>
        <label style={S.label}>Forma de venda</label>
        <select style={{ ...S.input, appearance:"none" }}
          value={form.formaVenda} onChange={e => upd("formaVenda", e.target.value)}>
          <option value="">Selecione...</option>
          {FORMAS_VENDA.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div style={S.group}>
        <label style={S.label}>Preço por kg (R$)</label>
        <input style={S.input} type="number" placeholder="Ex: 29.90"
          value={form.precoKg} onChange={e => upd("precoKg", e.target.value)} />
      </div>

      <div style={S.group}>
        <label style={S.label}>Espécie declarada na etiqueta</label>
        <input style={S.input} placeholder='Ex: "cação", "cação-anjo", sem identificação...'
          value={form.especieDeclarada} onChange={e => upd("especieDeclarada", e.target.value)} />
      </div>

      <div style={S.group}>
        <label style={S.label}>Origem declarada</label>
        <input style={S.input} placeholder="Ex: Brasil, importado, sem informação..."
          value={form.origem} onChange={e => upd("origem", e.target.value)} />
      </div>

      <div style={S.group}>
        <label style={S.label}>Observações</label>
        <textarea style={{ ...S.input, height:80, resize:"none", verticalAlign:"top" }}
          placeholder="Informações extras, o que o vendedor disse..."
          value={form.observacoes} onChange={e => upd("observacoes", e.target.value)} />
      </div>
    </div>
  );

  // ── ENVIO ──
  const StepEnvio = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:700, margin:"0 0 6px", fontFamily:"'Space Mono',monospace" }}>
        Confirmar e enviar
      </h2>
      <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, margin:"0 0 18px", lineHeight:1.6 }}>
        Revise os dados antes de enviar.
      </p>

      {/* Resumo */}
      <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:14, marginBottom:18 }}>
        {foto && (
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10,
            paddingBottom:10, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <img src={foto} style={{ width:52, height:52, borderRadius:6, objectFit:"cover" }} />
            <div>
              <div style={{ color:"#7fffd4", fontSize:11, fontWeight:700, fontFamily:"'Space Mono',monospace" }}>FOTO</div>
              {aiResult && (
                <div style={{ fontSize:12, color: aiResult.ehCacao==="sim"?"#ff6b6b": aiResult.ehCacao==="talvez"?"#ffa502":"#2ed573" }}>
                  IA: {aiResult.ehCacao==="sim"?"Provável tubarão": aiResult.ehCacao==="talvez"?"Possível tubarão": aiResult.ehCacao==="nao"?"Não identificado":"Inconclusivo"}
                </div>
              )}
            </div>
          </div>
        )}
        {[
          ["Local", [form.nomeEstabelecimento, form.tipoEstabelecimento, form.cidade && form.estado ? `${form.cidade} - ${form.estado}` : form.cidade].filter(Boolean).join(" · ")],
          ["Endereço", [form.cep && `CEP ${form.cep}`, form.endereco].filter(Boolean).join(" — ")],
          ["Pin", form.latitude ? `${form.latitude?.toFixed(5)}, ${form.longitude?.toFixed(5)}` : null],
          ["Produto", [form.formaVenda, form.precoKg && `R$ ${form.precoKg}/kg`, form.especieDeclarada && `"${form.especieDeclarada}"`].filter(Boolean).join(" · ")],
          ["Obs.", form.observacoes],
        ].filter(([,v]) => v).map(([k,v]) => (
          <div key={k} style={{ marginBottom:7 }}>
            <span style={{ color:"#7fffd4", fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700 }}>{k}: </span>
            <span style={{ color:"rgba(255,255,255,0.65)", fontSize:13 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Identificação opcional */}
      <div style={S.group}>
        <label style={S.label}>Seu nome (opcional)</label>
        <input style={S.input} placeholder="Anônimo por padrão"
          value={form.nome} onChange={e => upd("nome", e.target.value)} />
      </div>
      <div style={S.group}>
        <label style={S.label}>Seu e-mail (opcional)</label>
        <input style={S.input} type="email" placeholder="Para receber confirmação"
          value={form.email} onChange={e => upd("email", e.target.value)} />
      </div>

      {/* Checkbox */}
      <label style={{ display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer", marginBottom:20 }}>
        <input type="checkbox" checked={form.concordo}
          onChange={e => upd("concordo", e.target.checked)}
          style={{ marginTop:2, accentColor:"#00c8a0" }} />
        <span style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>
          Confirmo que as informações são verdadeiras e concordo que sejam usadas para fins de pesquisa e conscientização ambiental.
        </span>
      </label>

      {/* Erro */}
      {submitError && (
        <div style={{ color:"#ff6b6b", background:"rgba(255,100,100,0.08)", borderRadius:8,
          padding:"10px 12px", marginBottom:12, fontSize:13 }}>
          ⚠ {submitError}
        </div>
      )}

      {/* Botões */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button
          onClick={handleSubmit}
          disabled={!form.concordo || submitting || !form.nomeEstabelecimento || !form.cidade}
          style={{
            ...S.btnPrimary,
            background: form.concordo && form.nomeEstabelecimento && form.cidade
              ? "linear-gradient(135deg,#00c8a0,#00a080)"
              : "rgba(255,255,255,0.06)",
            color: form.concordo && form.nomeEstabelecimento && form.cidade ? "#001a2c" : "rgba(255,255,255,0.25)",
            cursor: form.concordo ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Salvando no Airtable..." : "💾 Salvar registro"}
        </button>

        <a href="https://seashepherd.org.br/cacao-e-tubarao/" target="_blank" rel="noopener noreferrer"
          style={{ display:"block", textAlign:"center", textDecoration:"none", ...S.btnSecondary, padding:"12px" }}>
          🐋 Também reportar à Sea Shepherd →
        </a>
      </div>

      <div style={{ marginTop:12, fontSize:11, color:"rgba(255,255,255,0.2)", textAlign:"center", lineHeight:1.7 }}>
        Dados salvos no Airtable · Obrigado por ajudar a proteger os tubarões.
      </div>
    </div>
  );

  // ── SUCCESS ──
  if (submitted) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#001a2c,#002d3a,#001a2c)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
      fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{ textAlign:"center", maxWidth:380 }}>
        <div style={{ fontSize:64, marginBottom:20 }}>🦈</div>
        <h1 style={{ color:"#00c8a0", fontFamily:"'Space Mono',monospace", fontSize:22, marginBottom:8 }}>
          Registro salvo!
        </h1>
        <p style={{ color:"rgba(255,255,255,0.55)", lineHeight:1.7, marginBottom:28 }}>
          Seu avistamento foi salvo no banco de dados. Cada registro nos ajuda a mapear o comércio de tubarões no Brasil.
        </p>
        <div style={{ background:"rgba(0,200,160,0.07)", border:"1px solid rgba(0,200,160,0.2)",
          borderRadius:12, padding:"16px 20px", marginBottom:24, textAlign:"left" }}>
          <div style={{ color:"#7fffd4", fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, marginBottom:8 }}>
            PRÓXIMOS PASSOS
          </div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:13, lineHeight:1.9 }}>
            → <a href="https://seashepherd.org.br/cacao-e-tubarao/" target="_blank" style={{ color:"#00c8a0" }}>
              Reportar à Sea Shepherd Brasil
            </a><br/>
            → Compartilhe a campanha <strong>#CacaoÉTubarão</strong><br/>
            → <a href="https://seashepherd.org.br/peticao-pelos-tubaroes/" target="_blank" style={{ color:"#00c8a0" }}>
              Assinar a petição
            </a>
          </div>
        </div>
        <button onClick={resetApp} style={{ ...S.btnGhost }}>
          Registrar outro avistamento
        </button>
      </div>
    </div>
  );

  const stepContent = { foto:StepFoto, local:StepLocal, produto:StepProduto, envio:StepEnvio };

  // ── RENDER ──
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#001a2c 0%,#002d3a 60%,#001a2c 100%)",
      fontFamily:"'DM Sans',sans-serif", color:"#e8f4f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box}
        input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22)}
        input:focus,textarea:focus,select:focus{border-color:rgba(0,200,160,0.5)!important}
        select option{background:#002d3a}
        .leaflet-control-attribution{display:none}
      `}</style>

      {/* Header */}
      <div style={{ background:"rgba(0,0,0,0.3)", backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(0,200,160,0.12)", padding:"12px 20px",
        display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:100 }}>
        <SharkIcon size={30}/>
        <div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:12,
            color:"#00c8a0", letterSpacing:"0.05em" }}>CAÇÃO É TUBARÃO</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:"0.08em" }}>
            Mapeamento colaborativo · Brasil
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding:"16px 20px 0" }}>
        <ProgressBar currentStep={step}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 14px 0", marginBottom:2 }}>
        {STEPS.map(s => (
          <div key={s} style={{ fontSize:10, fontFamily:"'Space Mono',monospace",
            textTransform:"uppercase", letterSpacing:"0.06em",
            color: s===step ? "#7fffd4" : "rgba(255,255,255,0.22)" }}>
            {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding:"20px 20px 110px" }}>
        {stepContent[step]}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0,
        padding:"12px 20px 24px",
        background:"linear-gradient(to top,#001a2c 70%,transparent)",
        display:"flex", gap:10 }}>
        {idx > 0 && (
          <button
            onClick={() => setStep(STEPS[idx-1])}
            style={{ ...S.btnGhost, flexShrink:0 }}>
            ← Voltar
          </button>
        )}
        {step !== "envio" && (
          <button
            onClick={() => setStep(STEPS[idx+1])}
            disabled={!canNext[step]}
            style={{
              ...S.btnPrimary, flex:1,
              background: canNext[step] ? "linear-gradient(135deg,#00c8a0,#00a080)" : "rgba(255,255,255,0.06)",
              color: canNext[step] ? "#001a2c" : "rgba(255,255,255,0.2)",
              cursor: canNext[step] ? "pointer" : "not-allowed",
            }}>
            Continuar →
          </button>
        )}
      </div>
    </div>
  );
}
