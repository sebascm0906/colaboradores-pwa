import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../App";

// ── Llamada real a n8n W15 Auth Magic Link ───────────────────────────────
async function requestMagicLink(phone) {
  const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
    || "https://car12los023.app.n8n.cloud/webhook";
  const res = await fetch(`${webhookUrl}/pwa-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, app: "pwa_colaboradores" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.json(); // { status:"sent" } o { status:"ok", session_token:"..." }
}

// ── Design tokens ────────────────────────────────────────────────────────
const UI = {
  colors: {
    bgStart: "#050D1A",
    bgMid: "#091628",
    bgEnd: "#050E1F",
    blue: "#15499B",
    blueBright: "#2B8FE0",
    blueSoft: "rgba(43,143,224,0.12)",
    whiteSoft: "rgba(255,255,255,0.82)",
    whiteMuted: "rgba(255,255,255,0.60)",  /* ↑ 0.52→0.60 textos secundarios legibles bajo sol */
    whiteLow: "rgba(255,255,255,0.55)",    /* ↑ 0.24→0.55 legible en exterior/campo */
    border: "rgba(255,255,255,0.10)",
    borderBlue: "rgba(97,178,255,0.18)",
    success: "#22c55e",
    successSoft: "rgba(34,197,94,0.10)",
    successBorder: "rgba(34,197,94,0.22)",
    danger: "#ef4444",
  },
  radius: {
    lg: 18,
    xl: 22,
    full: 999,
  },
  shadow: {
    blue: "0 0 24px rgba(43,143,224,0.18)",
    soft: "0 10px 28px rgba(0,0,0,0.28)",
    card: "0 14px 30px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
};

// ── Logos — public/icons/ ────────────────────────────────────────────────
function IconGF({ size = 68 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        overflow: "hidden",
        boxShadow: "0 8px 28px rgba(0,0,0,0.42), 0 2px 8px rgba(26,79,156,0.22)",
        flexShrink: 0,
        background: "white",
      }}
    >
      <img
        src="/icons/icon-grupo-frio.svg"
        alt="Grupo Frío"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

function LogoGF({ width = 204 }) {
  return (
    <img
      src="/icons/logo-grupo-frio.svg"
      alt="Grupo Frío"
      style={{ width, height: "auto", display: "block" }}
    />
  );
}

// ── Partículas ───────────────────────────────────────────────────────────
function IceParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        delay: Math.random() * 6,
        duration: Math.random() * 8 + 6,
        opacity: Math.random() * 0.18 + 0.04,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-blue-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────
export default function LoginScreen() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState("input"); // input | loading | sent
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  };

  const handlePhoneChange = (e) => setPhone(formatPhone(e.target.value));

  const handleSubmit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Ingresa un número de 10 dígitos");
      return;
    }

    setError("");
    setStep("loading");

    try {
      const result = await requestMagicLink(`+52${digits}`);
      if (result?.session_token) {
        // Respuesta inmediata con token (SSO / bypass dev)
        let payload = { phone: `+52${digits}`, app: "pwa_colaboradores" };
        try {
          const parts = result.session_token.split(".");
          if (parts.length === 3) {
            payload = { ...JSON.parse(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/"))), session_token: result.session_token };
          }
        } catch { /* JWT inválido — usar payload mínimo */ }
        login(payload);
        navigate("/", { replace: true });
      } else {
        // Flujo normal: link enviado a WhatsApp
        setStep("sent");
      }
    } catch (e) {
      setError(e.message || "Error enviando el código");
      setStep("input");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  const resetForm = () => {
    setStep("input");
    setPhone("");
    setError("");
  };

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        background: `linear-gradient(160deg, ${UI.colors.bgStart} 0%, ${UI.colors.bgMid} 50%, ${UI.colors.bgEnd} 100%)`,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overscrollBehaviorY: "none",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');

        * {
          font-family: 'DM Sans', sans-serif;
          box-sizing: border-box;
        }

        html, body {
          overscroll-behavior-y: none; /* Evita rubber-banding en iOS Safari */
        }

        @keyframes float {
          from { transform: translateY(0px) scale(1); }
          to   { transform: translateY(-18px) scale(1.3); }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.32; }
          100% { transform: scale(1.55); opacity: 0; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .fade-up-1 { animation: fadeUp 0.6s 0.08s both; }
        .fade-up-2 { animation: fadeUp 0.6s 0.20s both; }
        .fade-up-3 { animation: fadeUp 0.6s 0.34s both; }
        .fade-up-4 { animation: fadeUp 0.6s 0.48s both; }

        .btn-shine {
          background: linear-gradient(90deg, #15499B, #2B8FE0, #15499B);
          background-size: 200% auto;
          transition: background-position 0.35s ease, transform 0.1s ease, box-shadow 0.2s ease;
        }

        .btn-shine:hover {
          background-position: right center;
          box-shadow: 0 0 24px rgba(43,143,224,0.34);
        }

        .btn-shine:active {
          transform: scale(0.98);
        }

        .input-gf {
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.10);
          color: white;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .input-gf:focus {
          outline: none;
          border-color: rgba(43,143,224,0.48);
          box-shadow: 0 0 0 3px rgba(43,143,224,0.08);
          background: rgba(255,255,255,0.065);
        }

        .input-gf::placeholder {
          color: rgba(255,255,255,0.22);
        }
      `}</style>

      <IceParticles />

      {/* Glow de fondo */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,100,255,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(43,143,224,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(43,143,224,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Card principal */}
      <div className="relative w-full max-w-sm mx-auto px-6 flex flex-col items-center gap-7">
        {/* Portada corporativa */}
        <div className={`flex flex-col items-center gap-4 ${mounted ? "fade-up-1" : "opacity-0"}`}>
          <div className="relative">
            <div className="absolute -inset-3 rounded-[36px] bg-blue-500/12 blur-2xl" />
            <div className="absolute inset-0 rounded-[32px] border border-blue-400/20 shadow-[0_0_28px_rgba(43,143,224,0.16)]" />

            <div className="relative w-[228px] rounded-[32px] border border-white/10 bg-white/[0.04] px-7 py-7 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_16px_40px_rgba(0,0,0,0.34),0_0_32px_rgba(43,143,224,0.18)]">
              <div className="pointer-events-none absolute inset-[1px] rounded-[31px] bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent" />

              <div className="relative flex flex-col items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/15 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.28),0_0_20px_rgba(43,143,224,0.12)]">
                  <img
                    src="/icons/icon-grupo-frio.svg"
                    alt="Icono Grupo Frío"
                    className="h-14 w-14 object-contain"
                  />
                </div>

                <img
                  src="/icons/logo-grupo-frio.svg"
                  alt="Grupo Frío"
                  className="w-[168px] h-auto object-contain"
                />
              </div>
            </div>
          </div>

          <span className="text-[11px] font-medium uppercase tracking-[0.42em] text-white/35">
            COLABORADORES
          </span>
        </div>

        {/* Separador */}
        <div className={`w-full flex items-center gap-3 ${mounted ? "fade-up-2" : "opacity-0"}`}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/10" />
          <span className="text-white/20 text-xs tracking-widest uppercase">Grupo Frío</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/10" />
        </div>

        {/* Formulario */}
        {step !== "sent" ? (
          <div className={`w-full flex flex-col gap-4 ${mounted ? "fade-up-3" : "opacity-0"}`}>
            <div>
              <label className="block text-white/40 text-xs font-medium tracking-widest uppercase mb-2.5">
                Número celular
              </label>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm font-semibold">
                  +52
                </span>

                <div
                  className="absolute left-[52px] top-3 bottom-3 w-px"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                />

                <input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={handleKeyDown}
                  placeholder="(33) 1234-5678"
                  disabled={step === "loading"}
                  className="input-gf w-full rounded-2xl py-4 pl-[68px] pr-4 text-base font-medium"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5">
                  <span>⚠</span> {error}
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={step === "loading"}
              className="btn-shine w-full rounded-2xl text-white font-semibold text-base tracking-wide flex items-center justify-center gap-2.5"
              style={{
                minHeight: 52,            /* Touch target ≥44px — estándar Apple HIG */
                padding: "14px 24px",
                boxShadow: "0 10px 24px rgba(21,73,155,0.30)",
              }}
            >
              {step === "loading" ? (
                <>
                  <div
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    style={{ animation: "spin 0.8s linear infinite" }}
                  />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <WhatsAppIcon />
                  <span>Entrar con WhatsApp</span>
                </>
              )}
            </button>

            <p className="text-white/20 text-xs text-center leading-relaxed">
              Te enviaremos un enlace de acceso seguro a tu WhatsApp.
              <br />
              No necesitas contraseña.
            </p>
          </div>
        ) : (
          <div className={`w-full flex flex-col items-center gap-5 text-center ${mounted ? "fade-up-3" : "opacity-0"}`}>
            <div
              className="w-full rounded-3xl border px-5 py-6"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                boxShadow: UI.shadow.card,
              }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-3xl">
                    📱
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-lg">¡Listo! Revisa tu WhatsApp</h3>
                  <p className="text-white/40 text-sm mt-2 leading-relaxed">
                    Enviamos un enlace de acceso a
                    <br />
                    <span className="text-blue-400 font-medium">+52 {phone}</span>
                  </p>
                </div>

                <div className="w-full rounded-2xl border border-white/8 bg-white/3 px-4 py-3.5 flex items-start gap-3">
                  <span className="text-yellow-400 text-lg shrink-0 mt-0.5">💡</span>
                  <p className="text-white/40 text-xs leading-relaxed text-left">
                    Toca el enlace en el mensaje de WhatsApp para acceder a la app.
                    El enlace expira en <span className="text-white/60">10 minutos</span>.
                  </p>
                </div>

                <button
                  onClick={resetForm}
                  className="text-white/30 text-sm underline underline-offset-4 hover:text-white/50 transition-colors"
                >
                  Usar otro número
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={`${mounted ? "fade-up-4" : "opacity-0"}`}>
          <p className="text-white/15 text-[10px] text-center tracking-wider">
            © 2026 Grupo Frío · Todos los derechos reservados
          </p>
        </div>
      </div>

      {/* Línea inferior */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(43,143,224,0.3), transparent)" }}
      />
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
