import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as exifr from "exifr";

// ============================================================
// CONFIGURAÇÃO — credenciais via variáveis de ambiente
// ============================================================
const AIRTABLE_TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = "Table 1";
const GOOGLE_PLACES_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;
const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// ─── Image compression ───────────────────────────────────────
async function compressImage(base64, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", quality);
      resolve(compressed.split(",")[1]);
    };
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

// ─── Cloudinary Upload ────────────────────────────────────────
async function uploadToCloudinary(base64Image) {
  const formData = new FormData();
  formData.append("file", `data:image/jpeg;base64,${base64Image}`);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  formData.append("folder", "cacao-tubarao");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: formData }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
}

// ─── Google Places Search ─────────────────────────────────────
async function searchPlaces(query) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places:searchText`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.id,places.types",
      },
      body: JSON.stringify({
        textQuery: query + " Brasil",
        languageCode: "pt-BR",
        maxResultCount: 5,
      }),
    }
  );
  const data = await res.json();
  return data.places || [];
}

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
  if (ESTADOS_BR.includes(upper)) return upper;
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

// ─── Resolve CEP from lat/lng via Google Geocoding ────────────
async function resolveCepFromCoords(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_PLACES_KEY}`
    );
    const data = await res.json();
    for (const result of data.results || []) {
      const comp = result.address_components?.find(c => c.types.includes("postal_code"));
      if (comp) return comp.long_name.replace(/\D/g, "");
    }
  } catch {}
  return null;
}

// ─── Airtable field metadata → choices ───────────────────────
async function fetchFieldChoices() {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const data = await res.json();
    const table = data.tables?.find(t => t.name === AIRTABLE_TABLE);
    if (!table) return {};
    const choices = {};
    for (const field of table.fields || []) {
      if (field.options?.choices) {
        choices[field.name] = field.options.choices.map(c => c.name);
      }
    }
    return choices;
  } catch {
    return {};
  }
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

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

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
        html: `<div style="width:32px;height:32px;background:#CF0F36;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
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
      style={{ width: "100%", height: 220, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(207,15,54,0.3)" }}
    />
  );
}

// ─── SVG Icons ───────────────────────────────────────────────
const IconCamera = ({ size = 28, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const IconSearch = ({ size = 20, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconPin = ({ size = 20, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconMap = ({ size = 20, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);

const IconEnvelope = ({ size = 20, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const IconArrowLeft = ({ size = 18, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const IconX = ({ size = 14, color = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ─── Helpers — date formatting ────────────────────────────────
// ISO string → "dd/mm/aaaa"
function isoToDDMMYYYY(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
}

// "dd/mm/aaaa" → ISO string (or "" if invalid)
function ddmmyyyyToISO(val) {
  const parts = val.replace(/\D/g, "");
  if (parts.length !== 8) return "";
  const day   = parseInt(parts.slice(0, 2), 10);
  const month = parseInt(parts.slice(2, 4), 10) - 1;
  const year  = parseInt(parts.slice(4, 8), 10);
  const d = new Date(year, month, day);
  if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return "";
  return d.toISOString();
}

// Auto-insert slashes while typing dd/mm/aaaa
function maskDate(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}

// ─── Subcomponents ────────────────────────────────────────────
function ProgressBar({ currentStep }) {
  const idx = STEPS.indexOf(currentStep);
  return (
    <div style={{ display:"flex", alignItems:"center", width:"100%" }}>
      {STEPS.map((step, i) => (
        <div key={step} style={{ display:"flex", alignItems:"center", flex: i < STEPS.length-1 ? 1 : 0 }}>
          <div style={{
            width:28, height:28, borderRadius:"50%",
            background: i <= idx ? "#CF0F36" : "rgba(255,255,255,0.08)",
            border: i === idx ? "2px solid rgba(207,15,54,0.6)" : "2px solid transparent",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontWeight:700,
            color: i <= idx ? "#fff" : "rgba(255,255,255,0.3)",
            flexShrink:0, fontFamily:"'Oswald',sans-serif", transition:"all 0.3s",
          }}>
            {i < idx ? "✔" : i+1}
          </div>
          {i < STEPS.length-1 && (
            <div style={{ flex:1, height:2, margin:"0 4px", transition:"background 0.3s",
              background: i < idx ? "#CF0F36" : "rgba(255,255,255,0.08)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function AIBadge({ result }) {
  const map = {
    sim:          { bg:"#CF0F36", text:"#fff",     label:"PROVÁVEL TUBARÃO" },
    talvez:       { bg:"#600E0A", text:"#fff",      label:"POSSÍVEL TUBARÃO" },
    nao:          { bg:"#10263F", text:"rgba(255,255,255,0.85)", label:"NÃO PARECE TUBARÃO" },
    indeterminado:{ bg:"rgba(255,255,255,0.08)", text:"rgba(255,255,255,0.7)", label:"INCONCLUSIVO" },
  };
  const c = map[result.ehCacao] || map.indeterminado;
  return (
    <div style={{ background:c.bg, color:c.text, borderRadius:4, padding:"10px 14px", marginTop:10, fontSize:13,
      border:"1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontWeight:400, fontSize:13, marginBottom:4,
        fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase" }}>{c.label}</div>
      <div style={{ opacity:0.85, lineHeight:1.5, fontFamily:"'Montserrat',sans-serif", fontSize:13 }}>{result.observacao}</div>
      {result.indicadores?.length > 0 && (
        <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4 }}>
          {result.indicadores.map((ind,i) => (
            <span key={i} style={{
              background:"rgba(0,0,0,0.25)", borderRadius:2, padding:"2px 8px",
              fontSize:11, fontFamily:"'Oswald',sans-serif", letterSpacing:"0.05em", textTransform:"uppercase",
            }}>{ind}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop:6, fontSize:11, opacity:0.55, fontFamily:"'Montserrat',sans-serif" }}>
        Confiança da IA: {result.confianca}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const S = {
  input: {
    width:"100%", background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.1)", borderRadius:4,
    padding:"10px 12px", color:"#ffffff", fontSize:14,
    fontFamily:"'Montserrat',sans-serif", outline:"none",
    boxSizing:"border-box", transition:"border 0.2s",
  },
  label: {
    display:"block", fontSize:11, fontWeight:700,
    color:"rgba(255,255,255,0.6)", marginBottom:5, textTransform:"uppercase",
    letterSpacing:"0.1em", fontFamily:"'Oswald',sans-serif",
  },
  group: { marginBottom:14 },
  btnPrimary: {
    width:"100%", padding:"13px", borderRadius:4, border:"none",
    background:"#CF0F36",
    color:"#ffffff", fontWeight:400, fontSize:15, cursor:"pointer",
    fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em",
    textTransform:"uppercase", transition:"background 0.2s",
  },
  btnSecondary: {
    width:"100%", padding:"12px", borderRadius:4,
    background:"rgba(207,15,54,0.1)", border:"1px solid rgba(207,15,54,0.4)",
    color:"#CF0F36", fontWeight:400, fontSize:14, cursor:"pointer",
    fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase",
  },
  btnGhost: {
    padding:"13px 20px", borderRadius:4,
    border:"1px solid rgba(255,255,255,0.12)",
    background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.55)",
    cursor:"pointer", fontSize:14, fontWeight:400,
    fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase",
  },
};

// ─── Main App ─────────────────────────────────────────────────
export default function CacaoApp() {
  const navigate = useNavigate();
  const [step, setStep]           = useState("foto");
  const [slots, setSlots]         = useState([
    { objectUrl: null, base64: null, status: "idle" },
    { objectUrl: null, base64: null, status: "idle" },
    { objectUrl: null, base64: null, status: "idle" },
  ]);
  const [aiResult, setAiResult]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState(null);
  const fileRef = useRef();
  const activeSlotRef = useRef(0);
  const [fieldChoices, setFieldChoices] = useState({});
  const [choicesLoading, setChoicesLoading] = useState(true);

  const [form, setForm] = useState({
    nomeEstabelecimento:"", tipoEstabelecimento:"",
    cep:"", endereco:"", numero:"", cidade:"", estado:"",
    latitude:null, longitude:null,
    googlePlaceId:"", fonteLocalizacao:"", dataFoto:"",
    dataObservacao:"",
    formaVenda:"", precoKg:"",
    especieDeclarada:"", origem:"", observacoes:"",
    nome:"", email:"", concordo:false,
  });

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError]     = useState(null);
  const [geoStatus, setGeoStatus]   = useState("idle");
  const [showMap, setShowMap]       = useState(false);
  const [placesQuery, setPlacesQuery] = useState("");
  const [placesResults, setPlacesResults] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetchFieldChoices().then(c => { setFieldChoices(c); setChoicesLoading(false); });
  }, []);

  // ── helpers ──
  async function applyCepToForm(cepClean) {
    if (!cepClean || cepClean.length !== 8) return;
    try {
      const d = await fetchCEP(cepClean);
      setForm(f => ({
        ...f,
        cep: cepClean,
        endereco: d.logradouro || f.endereco,
        cidade:   d.localidade  || f.cidade,
        estado:   d.uf          || f.estado,
      }));
    } catch {}
  }

  // ── Foto (multi-slot) ──
  function handleFileSelect(file) {
    if (!file) return;
    const slotIdx = activeSlotRef.current;
    const objectUrl = URL.createObjectURL(file);
    setSlots(s => s.map((sl, i) => i === slotIdx ? { ...sl, objectUrl, base64: null, status: "loading" } : sl));

    if (slotIdx === 0) {
      setAiResult(null); setAiError(null);
      exifr.parse(file, { gps: true, tiff: true }).then(exif => {
        if (!exif) return;
        const updates = {};
        if (exif.latitude && exif.longitude && !form.latitude) {
          updates.latitude = exif.latitude;
          updates.longitude = exif.longitude;
          updates.fonteLocalizacao = "GPS (foto)";
          setShowMap(true);
          reverseGeocode(exif.latitude, exif.longitude).then(addr => {
            setForm(f => ({
              ...f,
              latitude: exif.latitude,
              longitude: exif.longitude,
              endereco: addr.road ? `${addr.road}${addr.house_number ? ", "+addr.house_number : ""}` : f.endereco,
              cidade: addr.city || addr.town || addr.village || f.cidade,
              estado: normalizeEstado(addr.state) || f.estado,
              fonteLocalizacao: "GPS (foto)",
            }));
            resolveCepFromCoords(exif.latitude, exif.longitude).then(cep => { if (cep) applyCepToForm(cep); });
          });
        }
        if (exif.DateTimeOriginal) {
          const iso = exif.DateTimeOriginal.toISOString();
          updates.dataFoto = iso;
          updates.dataObservacao = isoToDDMMYYYY(iso);
        }
        if (Object.keys(updates).length > 0) setForm(f => ({ ...f, ...updates }));
      }).catch(() => {});
    }

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const jpeg = canvas.toDataURL("image/jpeg", 0.92);
        const b64 = jpeg.split(",")[1];
        setSlots(s => s.map((sl, i) => i === slotIdx ? { ...sl, base64: b64, status: "ready" } : sl));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    const b64 = slots[0].base64;
    if (!b64) return;
    setAiLoading(true); setAiError(null);
    try { setAiResult(await analyzeSharkImage(b64)); }
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
          resolveCepFromCoords(latitude, longitude).then(cep => { if (cep) applyCepToForm(cep); });
          setGeoStatus("ok");
          setShowMap(true);
        } catch { setGeoStatus("error"); }
      },
      () => setGeoStatus("error")
    );
  }

  // ── Places search ──
  const placesTimer = useRef(null);
  function handlePlacesQuery(val) {
    setPlacesQuery(val);
    upd("nomeEstabelecimento", val);
    clearTimeout(placesTimer.current);
    if (val.length < 3) { setPlacesResults([]); return; }
    placesTimer.current = setTimeout(async () => {
      setPlacesLoading(true);
      try {
        const results = await searchPlaces(val);
        setPlacesResults(results);
      } catch { setPlacesResults([]); }
      finally { setPlacesLoading(false); }
    }, 500);
  }

  function handleSelectPlace(place) {
    const addr = place.formattedAddress || "";
    const stateMatch = addr.match(/\b([A-Z]{2}),\s*\d{5}/);
    const estado = stateMatch ? stateMatch[1] : "";
    const cityMatch = addr.match(/,\s*([^,]+)\s*-\s*[A-Z]{2},/);
    const cidade = cityMatch ? cityMatch[1].trim() : "";
    const streetParts = addr.split(",");
    const endereco = streetParts.slice(0, 2).join(",").trim();
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;

    setForm(f => ({
      ...f,
      nomeEstabelecimento: place.displayName?.text || f.nomeEstabelecimento,
      endereco: endereco,
      cidade: cidade,
      estado: normalizeEstado(estado) || estado,
      latitude: lat || f.latitude,
      longitude: lng || f.longitude,
      googlePlaceId: place.id || f.googlePlaceId,
      fonteLocalizacao: "Google Places",
    }));
    setPlacesQuery(place.displayName?.text || "");
    setPlacesResults([]);
    setShowMap(true);

    // Auto-fill CEP: check formattedAddress first, then Geocoding
    const cepInAddr = addr.match(/\b(\d{5})-?(\d{3})\b/);
    if (cepInAddr) {
      applyCepToForm(cepInAddr[1] + cepInAddr[2]);
    } else if (lat && lng) {
      resolveCepFromCoords(lat, lng).then(cep => { if (cep) applyCepToForm(cep); });
    }
  }

  const handleMapLocation = useCallback(async ({ lat, lng, addr }) => {
    setForm(f => ({
      ...f,
      latitude: lat, longitude: lng,
      endereco: addr.road ? `${addr.road}${addr.house_number ? ", "+addr.house_number:""}` : f.endereco,
      cidade:   addr.city || addr.town || addr.village || f.cidade,
      estado:   normalizeEstado(addr.state) || f.estado,
      fonteLocalizacao: "Mapa",
    }));
    resolveCepFromCoords(lat, lng).then(cep => { if (cep) applyCepToForm(cep); });
  }, []);

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true); setSubmitError(null);
    try {
      // Upload all non-empty slots
      const fotoUrls = [null, null, null];
      for (let i = 0; i < 3; i++) {
        const b64 = slots[i].base64;
        if (!b64) continue;
        setSlots(s => s.map((sl, j) => j === i ? { ...sl, status: "uploading" } : sl));
        try {
          const compressed = await compressImage(b64);
          fotoUrls[i] = await uploadToCloudinary(compressed);
          setSlots(s => s.map((sl, j) => j === i ? { ...sl, status: "done" } : sl));
        } catch {
          setSlots(s => s.map((sl, j) => j === i ? { ...sl, status: "ready" } : sl));
        }
      }

      const fields = {
        "Estabelecimento":    form.nomeEstabelecimento,
        "Tipo":               form.tipoEstabelecimento,
        "CEP":                form.cep,
        "Endereco":           form.numero ? `${form.endereco}, ${form.numero}` : form.endereco,
        "Cidade":             form.cidade,
        "Estado":             form.estado,
        "Latitude":           form.latitude  ? parseFloat(form.latitude)  : undefined,
        "Longitude":          form.longitude ? parseFloat(form.longitude) : undefined,
        "Google Place ID":    form.googlePlaceId,
        "Fonte Localizacao":  form.fonteLocalizacao,
        "Forma de Venda":     form.formaVenda,
        "Preco por kg":       form.precoKg ? parseFloat(form.precoKg) : undefined,
        "Especie Declarada":  form.especieDeclarada,
        "Origem":             form.origem,
        "Analise IA":         aiResult?.ehCacao || "indeterminado",
        "Observacoes":        form.observacoes,
        "Nome Reportante":    form.nome,
        "Email Reportante":   form.email,
        "Data Registro":      new Date().toISOString(),
        "Data Observacao":    form.dataObservacao ? (ddmmyyyyToISO(form.dataObservacao) || undefined) : undefined,
        ...(fotoUrls[0] && { "Foto URL":   fotoUrls[0] }),
        ...(fotoUrls[1] && { "Foto URL 2": fotoUrls[1] }),
        ...(fotoUrls[2] && { "Foto URL 3": fotoUrls[2] }),
      };
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
    setStep("foto");
    setSlots([
      { objectUrl: null, base64: null, status: "idle" },
      { objectUrl: null, base64: null, status: "idle" },
      { objectUrl: null, base64: null, status: "idle" },
    ]);
    setAiResult(null); setAiError(null); setSubmitted(false);
    setSubmitError(null); setShowMap(false); setGeoStatus("idle");
    setForm({
      nomeEstabelecimento:"", tipoEstabelecimento:"",
      cep:"", endereco:"", numero:"", cidade:"", estado:"",
      latitude:null, longitude:null,
      googlePlaceId:"", fonteLocalizacao:"",
      dataObservacao:"",
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

  const slot0 = slots[0];

  const SlotCard = ({ idx: si }) => {
    const sl = slots[si];
    const isFirst = si === 0;
    const isEmpty = !sl.objectUrl;
    return (
      <div style={{ position:"relative", borderRadius:4, overflow:"hidden",
        border: isEmpty ? "2px dashed rgba(207,15,54,0.35)" : "1px solid rgba(207,15,54,0.3)",
        background: isEmpty ? "rgba(207,15,54,0.03)" : "transparent",
        aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center",
        cursor: isEmpty ? "pointer" : "default",
      }}
        onClick={() => { if (isEmpty) { activeSlotRef.current = si; fileRef.current.click(); } }}
      >
        {isEmpty ? (
          <div style={{ textAlign:"center", padding:8 }}>
            <IconCamera size={isFirst ? 32 : 22} color="rgba(207,15,54,0.7)" />
            <div style={{ color:"rgba(207,15,54,0.8)", fontFamily:"'Oswald',sans-serif",
              fontSize:10, letterSpacing:"0.08em", textTransform:"uppercase", marginTop:4 }}>
              {isFirst ? "Foto 1 *" : `Foto ${si+1}`}
            </div>
          </div>
        ) : (
          <>
            <img src={sl.objectUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            {(sl.status === "uploading" || sl.status === "loading") && (
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.55)",
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#CF0F36", fontFamily:"'Oswald',sans-serif", fontSize:11,
                letterSpacing:"0.08em", textTransform:"uppercase" }}>
                {sl.status === "uploading" ? "Enviando..." : "..."}
              </div>
            )}
            {sl.status === "done" && (
              <div style={{ position:"absolute", bottom:4, left:4, background:"rgba(0,0,0,0.6)",
                color:"#4B8399", fontSize:10, padding:"2px 6px", borderRadius:2,
                fontFamily:"'Oswald',sans-serif", letterSpacing:"0.06em" }}>✔</div>
            )}
            <button
              onClick={e => { e.stopPropagation(); setSlots(s => s.map((x, j) => j===si ? { objectUrl:null, base64:null, status:"idle" } : x)); if (si===0) { setAiResult(null); } }}
              style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.7)",
                border:"none", borderRadius:"50%", width:22, height:22, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
              <IconX size={11} color="#ffffff" />
            </button>
          </>
        )}
      </div>
    );
  };

  const StepFoto = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, fontStyle:"italic",
        margin:"0 0 6px", fontFamily:"'Montserrat',sans-serif", textTransform:"uppercase", letterSpacing:"0.02em" }}>
        Fotografe o Produto
      </h2>
      <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:"0 0 20px", lineHeight:1.6,
        fontFamily:"'Montserrat',sans-serif" }}>
        Tire uma foto da etiqueta, produto ou display de venda. A IA vai tentar identificar espécie, preço e origem na etiqueta ou placa.
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8, marginBottom:12 }}>
        <SlotCard idx={0} />
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <SlotCard idx={1} />
          <SlotCard idx={2} />
        </div>
      </div>

      {slot0.objectUrl && (
        <div>
          {!aiResult && !aiLoading && (
            <button onClick={handleAnalyze} style={{ ...S.btnSecondary, marginBottom:8 }}>
              Analisar com IA
            </button>
          )}
          {aiLoading && (
            <div style={{ textAlign:"center", padding:14, color:"rgba(255,255,255,0.6)",
              fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", fontSize:13, textTransform:"uppercase",
              background:"rgba(207,15,54,0.06)", borderRadius:4 }}>
              Analisando imagem...
            </div>
          )}
          {aiError && (
            <div style={{ color:"rgba(255,255,255,0.7)", fontSize:13, padding:10,
              background:"rgba(96,14,10,0.3)", borderRadius:4,
              fontFamily:"'Montserrat',sans-serif" }}>{aiError}</div>
          )}
          {aiResult && <AIBadge result={aiResult} />}
          {form.fonteLocalizacao === "GPS (foto)" && (
            <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(16,38,63,0.8)",
              border:"1px solid rgba(75,131,153,0.3)", borderRadius:4, fontSize:12,
              color:"#4B8399", fontFamily:"'Montserrat',sans-serif" }}>
              Localização extraída da foto automaticamente
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*"
        style={{ display:"none" }} onChange={e => { handleFileSelect(e.target.files[0]); e.target.value=""; }} />

      {/* Campo de data da observação */}
      <div style={{ ...S.group, marginTop:16 }}>
        <label style={S.label}>Data da Observação</label>
        <input
          style={S.input}
          placeholder="dd/mm/aaaa"
          value={form.dataObservacao}
          onChange={e => upd("dataObservacao", maskDate(e.target.value))}
          maxLength={10}
          inputMode="numeric"
        />
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.25)", marginTop:4,
          fontFamily:"'Montserrat',sans-serif" }}>
          Preenchido automaticamente se a foto tiver data. Edite se necessário.
        </div>
      </div>

      <div style={{ marginTop:4, padding:"10px 12px", background:"rgba(16,38,63,0.5)",
        borderRadius:4, fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.6,
        border:"1px solid rgba(255,255,255,0.06)", fontFamily:"'Montserrat',sans-serif" }}>
        <strong style={{ color:"rgba(255,255,255,0.6)", fontFamily:"'Oswald',sans-serif",
          letterSpacing:"0.08em", textTransform:"uppercase", fontSize:11 }}>Dica:</strong>{" "}
        Inclua etiqueta com preço. Se possível, pergunte a origem da espécie ao vendedor.
      </div>
    </div>
  );

  // ── LOCAL ──
  const locationLocked = !!(form.cidade && form.estado && form.fonteLocalizacao);

  const StepLocal = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, fontStyle:"italic",
        margin:"0 0 6px", fontFamily:"'Montserrat',sans-serif", textTransform:"uppercase" }}>
        Onde Foi Encontrado?
      </h2>
      <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:"0 0 6px", lineHeight:1.6,
        fontFamily:"'Montserrat',sans-serif" }}>
        Use um dos métodos abaixo para localizar o estabelecimento.
      </p>

      <div style={{ background:"rgba(16,38,63,0.6)", border:"1px solid rgba(75,131,153,0.2)",
        borderRadius:4, padding:"10px 12px", marginBottom:16, fontSize:12,
        color:"rgba(255,255,255,0.5)", lineHeight:1.7, fontFamily:"'Montserrat',sans-serif" }}>
        <strong style={{ color:"rgba(255,255,255,0.7)", fontFamily:"'Oswald',sans-serif",
          letterSpacing:"0.06em", textTransform:"uppercase", fontSize:11 }}>Google Places</strong> — busca pelo nome<br/>
        <strong style={{ color:"rgba(255,255,255,0.7)", fontFamily:"'Oswald',sans-serif",
          letterSpacing:"0.06em", textTransform:"uppercase", fontSize:11 }}>GPS</strong> — usa sua localização atual<br/>
        <strong style={{ color:"rgba(255,255,255,0.7)", fontFamily:"'Oswald',sans-serif",
          letterSpacing:"0.06em", textTransform:"uppercase", fontSize:11 }}>Mapa</strong> — marca no mapa se não está no local<br/>
        <strong style={{ color:"rgba(255,255,255,0.7)", fontFamily:"'Oswald',sans-serif",
          letterSpacing:"0.06em", textTransform:"uppercase", fontSize:11 }}>CEP</strong> — se souber o CEP do estabelecimento
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:18 }}>
        {[
          { Icon: IconSearch, label:"Places", active: form.fonteLocalizacao==="Google Places",
            action: () => { document.getElementById("places-input")?.focus(); } },
          { Icon: IconPin, label:"GPS", active: geoStatus==="ok" || geoStatus==="loading",
            action: () => { setShowMap(false); handleGPS(); } },
          { Icon: IconMap, label:"Mapa", active: showMap,
            action: () => { setShowMap(v => !v); } },
          { Icon: IconEnvelope, label:"CEP", active: form.fonteLocalizacao==="CEP",
            action: () => { setShowMap(false); document.getElementById("campo-cep")?.focus(); } },
        ].map(({ Icon, label, action, active }) => (
          <button key={label} onClick={action} style={{
            padding:"10px 4px", borderRadius:4, cursor:"pointer",
            background: active ? "rgba(207,15,54,0.15)" : "rgba(255,255,255,0.04)",
            border: active ? "1px solid #CF0F36" : "1px solid rgba(255,255,255,0.08)",
            color: active ? "#CF0F36" : "rgba(255,255,255,0.6)",
            fontFamily:"'Oswald',sans-serif", fontSize:11, fontWeight:400,
            letterSpacing:"0.08em", textTransform:"uppercase", textAlign:"center",
            display:"flex", flexDirection:"column", alignItems:"center", gap:4,
          }}>
            <Icon size={20} color={active ? "#CF0F36" : "rgba(255,255,255,0.6)"} />
            {geoStatus==="loading" && label==="GPS" ? "..." : label}
          </button>
        ))}
      </div>

      {/* Google Places search */}
      <div style={S.group}>
        <label style={S.label}>Buscar estabelecimento</label>
        <div style={{ position: "relative" }}>
          <input
            id="places-input"
            style={{ ...S.input, paddingLeft: 36 }}
            placeholder="Digite o nome: Carrefour, Zona Sul, feira..."
            value={placesQuery}
            onChange={e => handlePlacesQuery(e.target.value)}
          />
          <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
            pointerEvents:"none", display:"flex", alignItems:"center" }}>
            <IconSearch size={16} color="rgba(255,255,255,0.35)" />
          </div>
          {placesLoading && (
            <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
              color:"#CF0F36", fontSize:12 }}>...</div>
          )}
        </div>
        {placesResults.length > 0 && (
          <div style={{ background:"#10263F", border:"1px solid rgba(207,15,54,0.25)",
            borderRadius:4, marginTop:4, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.5)" }}>
            <div style={{ padding:"6px 12px", fontSize:10, color:"rgba(255,255,255,0.3)",
              fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase",
              borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              Resultados do Google Places
            </div>
            {placesResults.map((place, i) => (
              <div key={i} onClick={() => handleSelectPlace(place)}
                style={{ padding:"10px 12px", cursor:"pointer", display:"flex", gap:10,
                  borderBottom: i < placesResults.length-1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
                onMouseOver={e => e.currentTarget.style.background="rgba(207,15,54,0.1)"}
                onMouseOut={e => e.currentTarget.style.background="transparent"}>
                <div style={{ flexShrink:0, display:"flex", alignItems:"center", paddingTop:2 }}>
                  <IconPin size={16} color="rgba(255,255,255,0.4)" />
                </div>
                <div>
                  <div style={{ color:"#ffffff", fontSize:13, fontWeight:600,
                    fontFamily:"'Montserrat',sans-serif" }}>{place.displayName?.text}</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:2,
                    fontFamily:"'Montserrat',sans-serif" }}>{place.formattedAddress}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CEP */}
      <div style={S.group}>
        <label style={S.label}>CEP</label>
        <div style={{ position:"relative" }}>
          <input id="campo-cep" style={{ ...S.input, paddingRight:36 }}
            placeholder="00000-000" value={form.cep}
            onChange={e => handleCEP(e.target.value)} maxLength={9} />
          {cepLoading && (
            <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
              color:"#CF0F36", fontSize:12 }}>...</div>
          )}
        </div>
        {cepError && <div style={{ color:"#CF0F36", fontSize:12, marginTop:4,
          fontFamily:"'Montserrat',sans-serif" }}>{cepError}</div>}
      </div>

      {/* Mapa */}
      {showMap && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Clique no mapa para marcar o local</label>
          <MapPicker lat={form.latitude} lng={form.longitude} onLocationChange={handleMapLocation} />
          {(form.fonteLocalizacao === "Mapa" || form.fonteLocalizacao === "GPS") && form.latitude && (
            <div style={{ color:"#4B8399", fontSize:12, marginTop:6, fontFamily:"'Montserrat',sans-serif" }}>
              Pin: {form.latitude?.toFixed(5)}, {form.longitude?.toFixed(5)}
            </div>
          )}
        </div>
      )}

      {/* Status de localização */}
      {locationLocked && (
        <div style={{ background:"rgba(16,38,63,0.8)", border:"1px solid rgba(207,15,54,0.25)",
          borderRadius:4, padding:"12px 14px", marginBottom:14 }}>
          <div style={{ color:"#CF0F36", fontSize:11, fontFamily:"'Oswald',sans-serif",
            letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:400, marginBottom:6 }}>
            Localização Confirmada via {form.fonteLocalizacao}
          </div>
          <div style={{ color:"rgba(255,255,255,0.7)", fontSize:13, fontFamily:"'Montserrat',sans-serif" }}>
            {[form.cidade, form.estado].filter(Boolean).join(" · ")}
          </div>
          {form.endereco && (
            <div style={{ color:"rgba(255,255,255,0.45)", fontSize:12, marginTop:2,
              fontFamily:"'Montserrat',sans-serif" }}>{form.endereco}</div>
          )}
          <button onClick={() => {
            setForm(f => ({ ...f, cidade:"", estado:"", endereco:"", latitude:null, longitude:null, fonteLocalizacao:"", cep:"" }));
            setGeoStatus("idle"); setShowMap(false); setPlacesQuery(""); setPlacesResults([]);
          }} style={{ marginTop:8, background:"transparent", border:"none",
            color:"rgba(207,15,54,0.7)", fontSize:11, cursor:"pointer", padding:0,
            fontFamily:"'Oswald',sans-serif", letterSpacing:"0.08em", textTransform:"uppercase" }}>
            Limpar e escolher outro método
          </button>
        </div>
      )}

      {/* Nome do estabelecimento */}
      <div style={S.group}>
        <label style={S.label}>Nome do Estabelecimento *</label>
        <input style={S.input}
          placeholder={form.fonteLocalizacao === "Google Places" ? form.nomeEstabelecimento : "Nome do local..."}
          value={form.nomeEstabelecimento}
          onChange={e => upd("nomeEstabelecimento", e.target.value)} />
        {!form.nomeEstabelecimento && (
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.25)", marginTop:4,
            fontFamily:"'Montserrat',sans-serif" }}>
            Preencha se GPS, Mapa ou CEP não trouxer o nome automaticamente.
          </div>
        )}
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
          <input style={{ ...S.input, opacity: locationLocked ? 0.6 : 1 }}
            placeholder="Preenchido automaticamente"
            value={form.endereco}
            readOnly={locationLocked}
            onChange={e => !locationLocked && upd("endereco", e.target.value)} />
        </div>
        <div style={S.group}>
          <label style={S.label}>Número</label>
          <input style={S.input} placeholder="Ex: 142"
            value={form.numero || ""} onChange={e => upd("numero", e.target.value)} />
        </div>
      </div>

      {/* Cidade + Estado */}
      {locationLocked && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 90px", gap:10 }}>
          <div style={S.group}>
            <label style={S.label}>Cidade</label>
            <input style={{ ...S.input, opacity:0.6 }} value={form.cidade} readOnly />
          </div>
          <div style={S.group}>
            <label style={S.label}>Estado</label>
            <input style={{ ...S.input, opacity:0.6 }} value={form.estado} readOnly />
          </div>
        </div>
      )}
    </div>
  );

  // ── PRODUTO ──
  const StepProduto = (
    <div>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, fontStyle:"italic",
        margin:"0 0 6px", fontFamily:"'Montserrat',sans-serif", textTransform:"uppercase" }}>
        Dados do Produto
      </h2>
      <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:"0 0 20px", lineHeight:1.6,
        fontFamily:"'Montserrat',sans-serif" }}>
        Quanto mais detalhes, mais útil é o registro para a pesquisa.
      </p>

      <div style={S.group}>
        <label style={S.label}>Forma de Venda</label>
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
        <label style={S.label}>Espécie Declarada na Etiqueta</label>
        {fieldChoices["Especie Declarada"]?.length > 0 ? (
          <select style={{ ...S.input, appearance:"none" }}
            value={form.especieDeclarada} onChange={e => upd("especieDeclarada", e.target.value)}>
            <option value="">Selecione...</option>
            {fieldChoices["Especie Declarada"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input style={S.input}
            placeholder={choicesLoading ? "Carregando opções..." : 'Ex: "cação", "cação-anjo", sem identificação...'}
            value={form.especieDeclarada} onChange={e => upd("especieDeclarada", e.target.value)} />
        )}
      </div>

      <div style={S.group}>
        <label style={S.label}>Origem Declarada</label>
        {fieldChoices["Origem"]?.length > 0 ? (
          <select style={{ ...S.input, appearance:"none" }}
            value={form.origem} onChange={e => upd("origem", e.target.value)}>
            <option value="">Selecione...</option>
            {fieldChoices["Origem"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input style={S.input}
            placeholder={choicesLoading ? "Carregando opções..." : "Ex: Brasil, importado, sem informação..."}
            value={form.origem} onChange={e => upd("origem", e.target.value)} />
        )}
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
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, fontStyle:"italic",
        margin:"0 0 6px", fontFamily:"'Montserrat',sans-serif", textTransform:"uppercase" }}>
        Confirmar e Enviar
      </h2>
      <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:"0 0 18px", lineHeight:1.6,
        fontFamily:"'Montserrat',sans-serif" }}>
        Revise os dados antes de enviar.
      </p>

      {/* Resumo */}
      <div style={{ background:"#10263F", borderRadius:4, padding:14, marginBottom:18,
        border:"1px solid rgba(255,255,255,0.08)" }}>
        {slot0.objectUrl && (
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10,
            paddingBottom:10, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
            <img src={slot0.objectUrl} style={{ width:52, height:52, borderRadius:4, objectFit:"cover" }} />
            <div>
              <div style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontWeight:400,
                fontFamily:"'Oswald',sans-serif", letterSpacing:"0.1em", textTransform:"uppercase" }}>Foto</div>
              {aiResult && (
                <div style={{ fontSize:12, fontFamily:"'Montserrat',sans-serif",
                  color: aiResult.ehCacao==="sim"?"#CF0F36": aiResult.ehCacao==="talvez"?"#600E0A":"#4B8399" }}>
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
            <span style={{ color:"rgba(255,255,255,0.6)", fontFamily:"'Oswald',sans-serif",
              fontSize:11, fontWeight:400, letterSpacing:"0.1em", textTransform:"uppercase" }}>{k}: </span>
            <span style={{ color:"rgba(255,255,255,0.65)", fontSize:13,
              fontFamily:"'Montserrat',sans-serif" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Identificação opcional */}
      <div style={S.group}>
        <label style={S.label}>Seu Nome (opcional)</label>
        <input style={S.input} placeholder="Anônimo por padrão"
          value={form.nome} onChange={e => upd("nome", e.target.value)} />
      </div>
      <div style={S.group}>
        <label style={S.label}>Seu E-mail (opcional)</label>
        <input style={S.input} type="email" placeholder="Para receber confirmação"
          value={form.email} onChange={e => upd("email", e.target.value)} />
      </div>

      {/* Checkbox */}
      <label style={{ display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer", marginBottom:20 }}>
        <input type="checkbox" checked={form.concordo}
          onChange={e => upd("concordo", e.target.checked)}
          style={{ marginTop:2, accentColor:"#CF0F36" }} />
        <span style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.6,
          fontFamily:"'Montserrat',sans-serif" }}>
          Confirmo que as informações são verdadeiras e concordo que sejam usadas para fins de pesquisa e conscientização ambiental.
        </span>
      </label>

      {/* Erro */}
      {submitError && (
        <div style={{ color:"#CF0F36", background:"rgba(207,15,54,0.08)", borderRadius:4,
          padding:"10px 12px", marginBottom:12, fontSize:13, fontFamily:"'Montserrat',sans-serif",
          border:"1px solid rgba(207,15,54,0.2)" }}>
          {submitError}
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
              ? "#CF0F36"
              : "rgba(255,255,255,0.06)",
            color: form.concordo && form.nomeEstabelecimento && form.cidade ? "#fff" : "rgba(255,255,255,0.25)",
            cursor: form.concordo ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? (slots.some(s => s.base64) ? "Enviando..." : "Salvando...") : "Salvar Registro"}
        </button>

      </div>

      <div style={{ marginTop:12, fontSize:11, color:"rgba(255,255,255,0.2)", textAlign:"center",
        lineHeight:1.7, fontFamily:"'Montserrat',sans-serif" }}>
        Dados salvos no Airtable · Obrigado por ajudar a proteger os tubarões.
      </div>
    </div>
  );

  // ── SUCCESS ──
  if (submitted) return (
    <div style={{ minHeight:"100vh", background:"#000000",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
      fontFamily:"'Montserrat',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,800;1,800&family=Oswald:wght@400;700&display=swap" rel="stylesheet"/>
      <div style={{ textAlign:"center", maxWidth:380 }}>
        <img src="/shark-logo.JPG" alt="Cação é Tubarão"
          style={{ width:80, height:80, objectFit:"cover", borderRadius:"50%", marginBottom:20 }} />
        <h1 style={{ color:"#CF0F36", fontFamily:"'Montserrat',sans-serif", fontSize:22,
          fontWeight:800, fontStyle:"italic", textTransform:"uppercase", marginBottom:8 }}>
          Registro Salvo!
        </h1>
        <p style={{ color:"rgba(255,255,255,0.6)", lineHeight:1.7, marginBottom:28,
          fontFamily:"'Montserrat',sans-serif" }}>
          Seu avistamento foi salvo no banco de dados. Cada registro nos ajuda a mapear o comércio de tubarões no Brasil.
        </p>
        <div style={{ background:"#10263F", border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:4, padding:"16px 20px", marginBottom:24, textAlign:"left" }}>
          <div style={{ color:"rgba(255,255,255,0.6)", fontFamily:"'Oswald',sans-serif",
            fontSize:11, fontWeight:400, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>
            Próximos Passos
          </div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:13, lineHeight:1.9,
            fontFamily:"'Montserrat',sans-serif" }}>
            → Compartilhe a campanha <strong style={{ color:"#CF0F36" }}>#CacaoÉTubarão</strong><br/>
            → Compartilhe a campanha <a href="https://seashepherd.org.br/defensores-dos-tubaroes/" target="_blank" style={{ color:"#4B8399" }}><strong style={{ color:"#CF0F36" }}>#DefensoresDosTubaroes</strong></a><br/>
            → <a href="https://seashepherd.org.br/peticao-pelos-tubaroes/" target="_blank"
              style={{ color:"#4B8399" }}>Assinar a petição</a>
          </div>
        </div>
        <button onClick={resetApp} style={{ ...S.btnGhost }}>
          Registrar Outro Avistamento
        </button>
      </div>
    </div>
  );

  const stepContent = { foto:StepFoto, local:StepLocal, produto:StepProduto, envio:StepEnvio };

  // ── RENDER ──
  return (
    <div style={{ minHeight:"100vh", background:"#000000",
      fontFamily:"'Montserrat',sans-serif", color:"#ffffff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,800;1,800&family=Oswald:wght@400;700&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box}
        input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22);font-family:'Montserrat',sans-serif}
        input:focus,textarea:focus,select:focus{border-color:rgba(207,15,54,0.5)!important;outline:none}
        select option{background:#10263F;color:#fff}
        .leaflet-control-attribution{display:none}
      `}</style>

      {/* Header */}
      <div style={{ background:"#000000", borderBottom:"1px solid rgba(207,15,54,0.2)",
        padding:"12px 20px", display:"flex", alignItems:"center", gap:12,
        position:"sticky", top:0, zIndex:100 }}>
        <img src="/shark-logo.JPG" alt="Cação é Tubarão"
          style={{ width:36, height:36, objectFit:"cover", borderRadius:"50%", flexShrink:0 }} />
        <div>
          <div style={{ fontFamily:"'Montserrat',sans-serif", fontWeight:800, fontStyle:"italic",
            fontSize:13, color:"#ffffff", letterSpacing:"0.04em", textTransform:"uppercase",
            lineHeight:1.1 }}>Cação é Tubarão</div>
          <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:9, color:"rgba(255,255,255,0.4)",
            letterSpacing:"0.12em", textTransform:"uppercase", marginTop:1 }}>
            Mapeamento Colaborativo · Brasil
          </div>
        </div>
        <button
          onClick={() => navigate("/mapa")}
          style={{
            marginLeft: "auto",
            padding: "7px 14px", borderRadius: 4,
            background: "rgba(207,15,54,0.12)",
            border: "1px solid rgba(207,15,54,0.35)",
            color: "#CF0F36", fontWeight: 400, fontSize: 11,
            cursor: "pointer", fontFamily: "'Oswald',sans-serif",
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}
        >
          Mapa
        </button>
      </div>

      {/* Progress */}
      <div style={{ padding:"16px 20px 0" }}>
        <ProgressBar currentStep={step}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 14px 0", marginBottom:2 }}>
        {STEPS.map(s => (
          <div key={s} style={{ fontSize:10, fontFamily:"'Oswald',sans-serif",
            textTransform:"uppercase", letterSpacing:"0.1em",
            color: s===step ? "#CF0F36" : "rgba(255,255,255,0.22)" }}>
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
        background:"linear-gradient(to top,#000000 60%,transparent)",
        display:"flex", gap:10 }}>
        {idx > 0 && (
          <button
            onClick={() => setStep(STEPS[idx-1])}
            style={{ ...S.btnGhost, flexShrink:0, display:"flex", alignItems:"center", gap:6 }}>
            <IconArrowLeft size={16} color="rgba(255,255,255,0.55)" />
            Voltar
          </button>
        )}
        {step !== "envio" && (
          <button
            onClick={() => setStep(STEPS[idx+1])}
            disabled={!canNext[step]}
            style={{
              ...S.btnPrimary, flex:1,
              background: canNext[step] ? "#CF0F36" : "rgba(255,255,255,0.06)",
              color: canNext[step] ? "#ffffff" : "rgba(255,255,255,0.2)",
              cursor: canNext[step] ? "pointer" : "not-allowed",
            }}>
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
