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
  if (val === "sim") return "#CF0F36";
  if (val === "talvez") return "#600E0A";
  if (val === "nao") return "#4B8399";
  return "rgba(255,255,255,0.2)";
}

function aiLabel(val) {
  if (val === "sim") return "PROVÁVEL TUBARÃO";
  if (val === "talvez") return "POSSÍVEL TUBARÃO";
  if (val === "nao") return "NÃO IDENTIFICADO";
  return "INCONCLUSIVO";
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
      background: "#10263F",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {[
        { label: "Registros", value: total },
        { label: "Com mapa", value: comCoordenadas },
        { label: "Prováveis", value: provaveis },
        { label: "Estados", value: estados },
      ].map(({ label, value }) => (
        <div key={label} style={{ textAlign: "center" }}>
          <div style={{ color: "#CF0F36", fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 400 }}>
            {value}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9,
            textTransform: "uppercase", letterSpacing: "0.1em",
            fontFamily: "'Oswald',sans-serif" }}>
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
    <div style="font-family:'Montserrat',sans-serif;min-width:200px;max-width:260px">
      <div style="font-weight:700;font-size:15px;color:#10263F;margin-bottom:4px">
        ${f.Estabelecimento || "Sem nome"}
      </div>
      <div style="font-size:12px;color:#555;margin-bottom:8px">
        ${[f.Tipo, f.Cidade, f.Estado].filter(Boolean).join(" · ")}
      </div>
      <div style="display:inline-block;background:${color};color:#fff;
        padding:3px 10px;font-size:10px;font-weight:400;margin-bottom:8px;
        font-family:'Oswald',sans-serif;letter-spacing:0.08em;text-transform:uppercase;
        transform:skewX(-8deg)">
        <span style="display:inline-block;transform:skewX(8deg)">${label}</span>
      </div>
      ${f["Forma de Venda"] ? `<div style="font-size:12px;color:#444;margin-bottom:4px">${f["Forma de Venda"]}</div>` : ""}
      ${f["Preco por kg"] ? `<div style="font-size:12px;color:#444;margin-bottom:4px">R$ ${f["Preco por kg"]}/kg</div>` : ""}
      ${count > 1 ? `<div style="font-size:12px;font-weight:700;color:#CF0F36;margin-bottom:8px">${count} registros neste local</div>` : ""}
      <a href="${mapsUrl}" target="_blank"
        style="display:block;text-align:center;background:#10263F;color:#4B8399;
          padding:6px;font-size:11px;font-weight:400;text-decoration:none;margin-top:4px;
          font-family:'Oswald',sans-serif;letter-spacing:0.08em;text-transform:uppercase">
        Ver no Google Maps
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

  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      renderMarkers(mapInstanceRef.current, registros, filtro);
    }
  }, [filtro, registros]);

  function renderMarkers(map, records, filtroAtual) {
    const L = window.L;

    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const filtered = filtroAtual === "todos"
      ? records
      : records.filter(r => r.fields["Analise IA"] === filtroAtual);

    const groups = {};
    filtered.forEach(r => {
      const lat = r.fields.Latitude;
      const lng = r.fields.Longitude;
      if (!lat || !lng) return;
      const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

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
        fillOpacity: 0.9,
      }).addTo(map);

      if (count > 1) {
        const icon = L.divIcon({
          html: `<div style="color:#fff;font-size:10px;font-weight:700;font-family:'Oswald',sans-serif;
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

    if (!document.getElementById("popup-styles")) {
      const style = document.createElement("style");
      style.id = "popup-styles";
      style.textContent = `
        .cacao-popup .leaflet-popup-content-wrapper {
          border-radius: 4px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.4);
          border: 1px solid rgba(207,15,54,0.15);
        }
        .cacao-popup .leaflet-popup-tip { background: #fff; }
        .leaflet-control-attribution { display: none; }
      `;
      document.head.appendChild(style);
    }
  }

  const semCoordenadas = registros.filter(r =>
    (!r.fields.Latitude || !r.fields.Longitude) && r.fields.Estabelecimento
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      fontFamily: "'Montserrat',sans-serif",
      color: "#ffffff",
      display: "flex", flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,800;1,800&family=Oswald:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: "#000000", borderBottom: "1px solid rgba(207,15,54,0.2)",
        padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/shark-logo.JPG" alt="Cação é Tubarão"
            style={{ width: 34, height: 34, objectFit: "cover", borderRadius: "50%",
              border: "2px solid #CF0F36", flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800,
              fontStyle: "italic", fontSize: 13, color: "#ffffff",
              textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.1 }}>
              Mapa de Avistamentos
            </div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9,
              color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em",
              textTransform: "uppercase", marginTop: 1 }}>
              Cação é Tubarão · Brasil
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 16px", borderRadius: 4,
            background: "#CF0F36",
            border: "none", color: "#ffffff",
            fontWeight: 400, fontSize: 12, cursor: "pointer",
            fontFamily: "'Oswald',sans-serif",
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}
        >
          + Registrar
        </button>
      </div>

      {/* Stats */}
      {!loading && <StatsBar registros={registros} />}

      {/* Filtros */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8, overflowX: "auto",
        background: "#000000", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {[
          { key: "todos", label: "Todos" },
          { key: "sim", label: "Prováveis" },
          { key: "talvez", label: "Possíveis" },
          { key: "nao", label: "Não identificados" },
          { key: "indeterminado", label: "Sem análise" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            style={{
              padding: "6px 14px", whiteSpace: "nowrap",
              background: filtro === key ? "#CF0F36" : "rgba(255,255,255,0.05)",
              border: filtro === key ? "none" : "1px solid rgba(255,255,255,0.08)",
              color: filtro === key ? "#ffffff" : "rgba(255,255,255,0.6)",
              cursor: "pointer", fontSize: 11,
              fontFamily: "'Oswald',sans-serif",
              letterSpacing: "0.08em", textTransform: "uppercase",
              transition: "all 0.2s",
              transform: filtro === key ? "skewX(-8deg)" : "none",
              display: "inline-block",
              borderRadius: 2,
            }}
          >
            <span style={{ display: "inline-block", transform: filtro === key ? "skewX(8deg)" : "none" }}>
              {label}
            </span>
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
            background: "#000000",
          }}>
            <img src="/shark-logo.JPG" alt="Carregando"
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "50%",
                border: "2px solid #CF0F36", opacity: 0.8 }} />
            <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: "'Oswald',sans-serif",
              fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Carregando registros...
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#CF0F36", fontSize: 14, fontFamily: "'Montserrat',sans-serif",
          }}>
            {error}
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 400 }} />
      </div>

      {/* Lista de registros sem coordenadas */}
      {semCoordenadas.length > 0 && (
        <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#10263F" }}>
          <div style={{
            color: "rgba(255,255,255,0.6)", fontFamily: "'Oswald',sans-serif",
            fontSize: 11, fontWeight: 400, marginBottom: 10,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            {semCoordenadas.length} registro(s) sem localização no mapa
          </div>
          {semCoordenadas.map(r => (
            <div key={r.id} style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4, padding: "10px 12px", marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Montserrat',sans-serif" }}>
                  {r.fields.Estabelecimento || "Sem nome"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)",
                  fontFamily: "'Montserrat',sans-serif", marginTop: 2 }}>
                  {[r.fields.Tipo, r.fields.Cidade, r.fields.Estado].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{
                background: aiColor(r.fields["Analise IA"]),
                padding: "3px 10px",
                fontSize: 10, fontWeight: 400, color: "#fff",
                fontFamily: "'Oswald',sans-serif", letterSpacing: "0.08em",
                textTransform: "uppercase", transform: "skewX(-8deg)", borderRadius: 2,
              }}>
                <span style={{ display: "inline-block", transform: "skewX(8deg)" }}>
                  {r.fields["Analise IA"] || "?"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
