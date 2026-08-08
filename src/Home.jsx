import { useNavigate } from "react-router-dom";

const IconCamera = ({ size = 26, color = "#CF0F36" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconPin = ({ size = 26, color = "#CF0F36" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const IconSend = ({ size = 26, color = "#CF0F36" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconMap = ({ size = 18, color = "#4B8399" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const STEPS_INFO = [
  { Icon: IconCamera, title: "1. Fotografe", text: "Etiqueta, produto ou display de venda." },
  { Icon: IconPin, title: "2. Localize", text: "GPS, mapa, CEP ou busca do estabelecimento." },
  { Icon: IconSend, title: "3. Envie", text: "Leva menos de um minuto." },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#000000", color: "#ffffff", fontFamily: "'Montserrat',sans-serif", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,800;1,800&family=Oswald:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ padding: "44px 24px 20px", textAlign: "center" }}>
        <img src="/shark-logo.JPG" alt="Cação é Tubarão" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "50%", marginBottom: 16 }} />
        <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontStyle: "italic", fontSize: 24, textTransform: "uppercase", margin: "0 0 4px", letterSpacing: "0.02em" }}>
          Cação é Tubarão
        </h1>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Mapeamento Colaborativo · Brasil
        </div>
      </div>

      <div style={{ padding: "0 24px" }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.7)", textAlign: "center", margin: "0 0 28px" }}>
          Muita carne vendida como "cação" no Brasil é, na verdade, tubarão ou raia — espécies ameaçadas comercializadas sem identificação clara. Ajude a mapear onde isso acontece.
        </p>
      </div>

      <div style={{ padding: "0 24px", marginBottom: 8 }}>
        {STEPS_INFO.map(({ Icon, title, text }) => (
          <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(207,15,54,0.1)", border: "1px solid rgba(207,15,54,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon />
            </div>
            <div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{text}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", padding: "12px 24px 32px" }}>
        <button
          onClick={() => navigate("/reportar")}
          style={{ width: "100%", padding: "15px", borderRadius: 4, border: "none", background: "#CF0F36", color: "#ffffff", fontWeight: 400, fontSize: 15, cursor: "pointer", fontFamily: "'Oswald',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}
        >
          Registrar Avistamento
        </button>

        <button
          onClick={() => navigate("/mapa")}
          style={{ width: "100%", padding: "13px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", fontWeight: 400, fontSize: 13, cursor: "pointer", fontFamily: "'Oswald',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <IconMap /> Ver Mapa de Registros
        </button>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 12, fontFamily: "'Montserrat',sans-serif", color: "rgba(255,255,255,0.4)", lineHeight: 1.8 }}>
          <a href="https://seashepherd.org.br/cacao-e-tubarao/" target="_blank" rel="noreferrer" style={{ color: "#4B8399", textDecoration: "none" }}>
            Saiba mais sobre a campanha
          </a>
          {" · "}
          <a href="https://seashepherd.org.br/peticao-pelos-tubaroes/" target="_blank" rel="noreferrer" style={{ color: "#4B8399", textDecoration: "none" }}>
            Assinar petição
          </a>
        </div>
      </div>
    </div>
  );
}
