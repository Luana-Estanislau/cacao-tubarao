import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000000",
      fontFamily: "'Montserrat',sans-serif",
      color: "#ffffff",
      display: "flex",
      flexDirection: "column",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,800;1,800&family=Oswald:wght@400;700&display=swap"
        rel="stylesheet"
      />

      {/* ── HERO / BANNER ── */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "clamp(200px, 52vw, 380px)",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <img
          src="/shark-logo.JPG"
          alt="Cação é Tubarão"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 30%",
            display: "block",
            position: "absolute",
            inset: 0,
          }}
        />
        {/* strong gradient so text always reads over image */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.88) 100%)",
        }} />
        <div style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          height: "100%",
          padding: "0 20px 24px",
          textAlign: "center",
          boxSizing: "border-box",
        }}>
          <div style={{
            fontFamily: "'Oswald',sans-serif",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#CF0F36",
            marginBottom: 6,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          }}>
            Sea Shepherd Brasil
          </div>
          <h1 style={{
            fontFamily: "'Montserrat',sans-serif",
            fontWeight: 800,
            fontStyle: "italic",
            fontSize: "clamp(24px, 6.5vw, 40px)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            margin: "0 0 6px",
            lineHeight: 1.1,
            color: "#ffffff",
            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
          }}>
            Cação é Tubarão
          </h1>
          <p style={{
            fontFamily: "'Montserrat',sans-serif",
            fontSize: "clamp(11px, 3vw, 13px)",
            color: "rgba(255,255,255,0.8)",
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.5,
            textShadow: "0 1px 6px rgba(0,0,0,0.9)",
          }}>
            Mapeamento colaborativo do comércio de tubarões no Brasil
          </p>
        </div>
      </div>

      {/* ── TEXTO DE CONTEXTO ── */}
      <div style={{
        padding: "32px 24px 0",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}>
        <p style={{
          fontSize: "clamp(14px, 3.5vw, 15px)",
          lineHeight: 1.75,
          color: "rgba(255,255,255,0.7)",
          margin: 0,
          fontFamily: "'Montserrat',sans-serif",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}>
          O Brasil é o maior consumidor e importador de carne de tubarão do mundo.
          Vendido como <strong style={{ color: "#ffffff" }}>"cação"</strong> em mercados,
          feiras e restaurantes, o tubarão é comercializado sem identificação de espécie,
          sem rastreabilidade e muitas vezes em desacordo com a legislação ambiental.
        </p>
      </div>

      {/* ── CADA REGISTRO CONTA ── */}
      <div style={{
        padding: "28px 24px 0",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "'Montserrat',sans-serif",
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: "clamp(22px, 6vw, 34px)",
          textTransform: "uppercase",
          color: "#ffffff",
          letterSpacing: "0.02em",
          margin: 0,
          lineHeight: 1.15,
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}>
          Cada registro conta.
        </p>
      </div>

      {/* ── AJUDE A MAPEAR ── */}
      <div style={{
        padding: "16px 24px 0",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "'Montserrat',sans-serif",
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: "clamp(16px, 4.5vw, 24px)",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.02em",
          margin: 0,
          lineHeight: 1.2,
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}>
          Ajude a mapear onde isso acontece
        </p>
      </div>

      {/* ── BOTÃO REGISTRE ── */}
      <div style={{
        padding: "28px 24px 0",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}>
        <button
          onClick={() => navigate("/registrar")}
          style={{
            width: "100%",
            padding: "16px",
            background: "#CF0F36",
            border: "none",
            borderRadius: 4,
            color: "#ffffff",
            fontFamily: "'Oswald',sans-serif",
            fontWeight: 400,
            fontSize: 18,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(207,15,54,0.35)",
          }}
        >
          Registre
        </button>
      </div>

      {/* ── BANNER MAPA ── */}
      <div style={{
        padding: "12px 24px 0",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}>
        <button
          onClick={() => navigate("/mapa")}
          style={{
            width: "100%",
            padding: "13px",
            background: "transparent",
            border: "1px solid rgba(75,131,153,0.4)",
            borderRadius: 4,
            color: "#4B8399",
            fontFamily: "'Oswald',sans-serif",
            fontWeight: 400,
            fontSize: 14,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Mapa de Avistamentos
        </button>
      </div>

      {/* ── RODAPÉ — links discretos ── */}
      <div style={{
        marginTop: "auto",
        padding: "40px 24px 32px",
        display: "flex",
        flexWrap: "wrap",
        gap: "10px 20px",
        justifyContent: "center",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[
          { label: "Sea Shepherd Brasil", href: "https://seashepherd.org.br", internal: false },
          { label: "Defensores dos Tubarões", href: "https://seashepherd.org.br/defensores-dos-tubaroes/", internal: false },
          { label: "Assinar a petição", href: "https://seashepherd.org.br/peticao-pelos-tubaroes/", internal: false },
        ].map(({ label, href, internal }) => (
          <a
            key={label}
            href={internal ? undefined : href}
            onClick={internal ? () => navigate(href) : undefined}
            target={internal ? undefined : "_blank"}
            rel={internal ? undefined : "noopener noreferrer"}
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: 11,
              fontFamily: "'Oswald',sans-serif",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              cursor: "pointer",
              transition: "color 0.2s",
            }}
            onMouseOver={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
            onMouseOut={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
