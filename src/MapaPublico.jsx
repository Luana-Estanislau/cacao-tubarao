import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const AIRTABLE_TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = "Table 1";

// ─── Fetch all records from Airtable ─────────────────────────
async function fetchRegistros() {
  let records = [];
  let offset = null;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`
    );
    url.searchParams.set("fields[]", "Estabelecimento");
    url.searchParams.append("fields[]", "Tipo");
    url.searchParams.append("fields[]", "Cidade");
    url.searchParams.append("fields[]", "Estado");
    url.searchParams.append("fields[]", "Latitude");
    url.searchParams.append("fields[]", "Longitude");
    url.searchParams.append("fields[]", "Analise IA");
    url.searchParams.append("fields[]", "Data e Hora");
    url.searchParams.append("fields[]", "Forma de Venda");
    url.searchParams.append("fields[]", "Preco por kg");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const data = await res.json();
    records = [...records, ...(data.records || [])];
    offset = data.offset || null;
  } while (offset);

  return records;
}

// ─── AI badge color ───────────────────────────────────────────
function aiColor(val) {
  if (val === "sim") return "#ff4757";
  if (val === "talvez") return "#ffa502";
  if (val === "nao") return "#2ed573";
  return "rgba(255,255,255,0.3)";
}

function aiLabel(val) {
  if (val === "sim") return "⚠ Provável tubarão";
  if (val === "talvez") return "? Possível tubarão";
  if (val === "nao") return "✓ Não identificado";
  return "~ Inconclusivo";
}

// ─── Stats bar ────────────────────────────────────────────────
function StatsBar({ registros }) {
  const total = registros.length;
  const comCoordenadas = registros.filter(r => r.fields.Latitude && r.fields.Longitude).length;
  const provaveis = registros.filter(r => r.fields["Analise IA"] === "sim").length;
  const estados = new Set(registros.map(r => r.fields.Estado).filter(Boolean)).size;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8, padding: "12px 16px",
      background: "rgba(0,0,0,0.3)",
      borderBottom: "1px solid rgba(0,200,160,0.12)",
    }}>
      {[
        { label: "Registros", value: total },
        { label: "Com mapa", value: comCoordenadas },
        { label: "Prováveis", value: provaveis },
        { label: "Estados", value: estados },
      ].map(({ label, value }) => (
        <div key={label} style={{ textAlign: "center" }}>
          <div style={{ color: "#00c8a0", fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700 }}>
            {value}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Popup content ────────────────────────────────────────────
function popupHTML(record, count) {
  const f = record.fields;
  const lat = f.Latitude;
  const lng = f.Longitude;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const color = aiColor(f["Analise IA"]);
  const label = aiLabel(f["Analise IA"]);

  return `
    <div style="font-family:'DM Sans',sans-serif;min-width:200px;max-width:260px">
      <div style="font-weight:700;font-size:15px;color:#001a2c;margin-bottom:4px">
        ${f.Estabelecimento || "Sem nome"}
      </div>
      <div style="font-size:12px;color:#555;margin-bottom:8px">
        ${[f.Tipo, f.Cidade, f.Estado].filter(Boolean).join(" · ")}
      </div>
      <div style="display:inline-block;background:${color};color:${f["Analise IA"] === "talvez" || f["Analise IA"] === "nao" ? "#001a2c" : "#fff"};
        padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:8px">
        ${label}
      </div>
      ${f["Forma de Venda"] ? `<div style="font-size:12px;color:#444;margin-bottom:4px">🐟 ${f["Forma de Venda"]}</div>` : ""}
      ${f["Preco por kg"] ? `<div style="font-size:12px;color:#444;margin-bottom:4px">💰 R$ ${f["Preco por kg"]}/kg</div>` : ""}
      ${count > 1 ? `<div style="font-size:12px;font-weight:700;color:#e74c3c;margin-bottom:8px">📍 ${count} registros neste local</div>` : ""}
      <a href="${mapsUrl}" target="_blank" 
        style="display:block;text-align:center;background:#001a2c;color:#00c8a0;
          padding:6px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-top:4px">
        Ver no Google Maps →
      </a>
    </div>
  `;
}

// ─── Main Map Component ───────────────────────────────────────
export default function MapaPublico() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    fetchRegistros()
      .then(setRegistros)
      .catch(() => setError("Não foi possível carregar os registros."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current || mapInstanceRef.current) return;

    // Load Leaflet CSS
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
      if (!mapRef.current || mapInstanceRef.current) return;
      const L = window.L;

      const map = L.map(mapRef.current, { zoomControl: true })
        .setView([-15.7801, -47.9292], 4);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      renderMarkers(map, registros, filtro);
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading]);

  // Re-render markers when filter changes
  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      renderMarkers(mapInstanceRef.current, registros, filtro);
    }
  }, [filtro, registros]);

  function renderMarkers(map, records, filtroAtual) {
    const L = window.L;

    // Remove existing markers
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Filter records
    const filtered = filtroAtual === "todos"
      ? records
      : records.filter(r => r.fields["Analise IA"] === filtroAtual);

    // Group by location (lat/lng rounded to 4 decimals)
    const groups = {};
    filtered.forEach(r => {
      const lat = r.fields.Latitude;
      const lng = r.fields.Longitude;
      if (!lat || !lng) return;
      const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    // Render grouped markers
    Object.entries(groups).forEach(([key, recs]) => {
      const [lat, lng] = key.split(",").map(Number);
      const count = recs.length;
      const topRecord = recs[0];
      const ia = topRecord.fields["Analise IA"];
      const color = aiColor(ia);
      const radius = Math.min(8 + count * 4, 28);

      const marker = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      if (count > 1) {
        const icon = L.divIcon({
          html: `<div style="color:#fff;font-size:10px;font-weight:700;font-family:monospace;
            display:flex;align-items:center;justify-content:center;
            width:${radius * 2}px;height:${radius * 2}px;margin-left:-${radius}px;margin-top:-${radius}px">
            ${count}
          </div>`,
          className: "",
          iconSize: [radius * 2, radius * 2],
        });
        L.marker([lat, lng], { icon }).addTo(map);
      }

      marker.bindPopup(popupHTML(topRecord, count), {
        maxWidth: 280,
        className: "cacao-popup",
      });
    });

    // Add popup styles
    if (!document.getElementById("popup-styles")) {
      const style = document.createElement("style");
      style.id = "popup-styles";
      style.textContent = `
        .cacao-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .cacao-popup .leaflet-popup-tip { background: #fff; }
        .leaflet-control-attribution { display: none; }
      `;
      document.head.appendChild(style);
    }
  }

  // Records without coordinates (list view) — only show if they have a name
  const semCoordenadas = registros.filter(r => 
    (!r.fields.Latitude || !r.fields.Longitude) && r.fields.Estabelecimento
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#001a2c 0%,#002d3a 60%,#001a2c 100%)",
      fontFamily: "'DM Sans',sans-serif",
      color: "#e8f4f0",
      display: "flex", flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: "rgba(0,0,0,0.3)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,200,160,0.12)",
        padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🦈</span>
          <div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 12, color: "#00c8a0" }}>
              MAPA DE AVISTAMENTOS
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              Cação é Tubarão · Brasil
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 14px", borderRadius: 8,
            background: "linear-gradient(135deg,#00c8a0,#00a080)",
            border: "none", color: "#001a2c",
            fontWeight: 700, fontSize: 12, cursor: "pointer",
            fontFamily: "'Space Mono',monospace",
          }}
        >
          + Registrar
        </button>
      </div>

      {/* Stats */}
      {!loading && <StatsBar registros={registros} />}

      {/* Filtros */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, overflowX: "auto" }}>
        {[
          { key: "todos", label: "Todos" },
          { key: "sim", label: "⚠ Prováveis" },
          { key: "talvez", label: "? Possíveis" },
          { key: "nao", label: "✓ Não identificados" },
          { key: "indeterminado", label: "~ Sem análise" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            style={{
              padding: "6px 12px", borderRadius: 20, whiteSpace: "nowrap",
              background: filtro === key ? "#00c8a0" : "rgba(255,255,255,0.06)",
              border: filtro === key ? "none" : "1px solid rgba(255,255,255,0.1)",
              color: filtro === key ? "#001a2c" : "rgba(255,255,255,0.6)",
              fontWeight: filtro === key ? 700 : 400,
              cursor: "pointer", fontSize: 12,
              fontFamily: "'Space Mono',monospace",
              transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative", minHeight: 400 }}>
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, zIndex: 10,
          }}>
            <div style={{ fontSize: 36 }}>🦈</div>
            <div style={{ color: "#00c8a0", fontFamily: "'Space Mono',monospace", fontSize: 13 }}>
              Carregando registros...
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center", color: "#ff6b6b", fontSize: 14,
          }}>
            {error}
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 400 }} />
      </div>

      {/* Lista de registros sem coordenadas */}
      {semCoordenadas.length > 0 && (
        <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{
            color: "#7fffd4", fontFamily: "'Space Mono',monospace",
            fontSize: 11, fontWeight: 700, marginBottom: 10,
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            {semCoordenadas.length} registro(s) sem localização no mapa
          </div>
          {semCoordenadas.map(r => (
            <div key={r.id} style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "10px 12px", marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.fields.Estabelecimento || "Sem nome"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {[r.fields.Tipo, r.fields.Cidade, r.fields.Estado].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{
                background: aiColor(r.fields["Analise IA"]),
                borderRadius: 4, padding: "2px 8px",
                fontSize: 10, fontWeight: 700,
                color: r.fields["Analise IA"] === "talvez" || r.fields["Analise IA"] === "nao" ? "#001a2c" : "#fff",
              }}>
                {r.fields["Analise IA"] || "?"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
