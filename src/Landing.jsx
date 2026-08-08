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
        minHeight: "56vw",
        maxHeight: 420,
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
            objectPosition: "center",
            display: "block",
            position: "absolute",
            inset: 0,
          }}
        />
        {/* gradient overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.72) 100%)",
        }} />
        <div style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          height: "100%",
          minHeight: "56vw",
          maxHeight: 420,
          padding: "0 20px 28px",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Oswald',sans-serif",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#CF0F36",
            marginBottom: 8,
          }}>
            Sea Shepherd Brasil
          </div>
          <h1 style={{
            fontFamily: "'Montserrat',sans-serif",
            fontWeight: 800,
            fontStyle: "italic",
            fontSize: "clamp(26px, 7vw, 44px)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            margin: "0 0 8px",
            lineHeight: 1.1,
            color: "#ffffff",
          }}>
            Cação é Tubarão
          </h1>
          <p style={{
            fontFamily: "'Montserrat',sans-serif",
            fontSize: "clamp(12px, 3.5vw, 15px)",
            color: "rgba(255,255,255,0.75)",
            margin: 0,
            maxWidth: 360,
            lineHeight: 1.5,
          }}>
            Mapeamento colaborativo do comércio de tubarões no Brasil
          </p>
        </div>
      </div>

      {/* ── TEXTO DE CONTEXTO ── */}
      <div style={{ padding: "32px 24px 0", maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <p style={{
          fontSize: 15,
          lineHeight: 1.75,
          color: "rgba(255,255,255,0.7)",
          margin: 0,
          fontFamily: "'Montserrat',sans-serif",
        }}>
          O Brasil é o maior consumidor e importador de carne de tubarão do mundo.
          Vendido como <strong style={{ color: "#ffffff" }}>"cação"</strong> em mercados,
          feiras e restaurantes, o tubarão é comercializado sem identificação de espécie,
          sem rastreabilidade e muitas vezes em desacordo com a legislação ambiental.
          Cada registro conta — e juntos podemos mapear onde isso acontece.
        </p>
      </div>

      {/* ── CHAMADA PRINCIPAL ── */}
      <div style={{
        padding: "40px 24px 8px",
        maxWidth: 560,
        margin: "0 auto",
        width: "100%",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "'Montserrat',sans-serif",
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: "clamp(20px, 5.5vw, 30px)",
          textTransform: "uppercase",
          color: "#ffffff",
          letterSpacing: "0.02em",
          margin: 0,
          lineHeight: 1.2,
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
          { label: "Mapa de avistamentos", href: "/mapa", internal: true },
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
