import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../App";

// ── Login directo a Odoo ──────────────────────────────────────────────────
const ODOO_SIGN_IN_URL = "/api-odoo/employee-sign-in";

async function requestEmployeeSession(pin, barcode) {
  const res = await fetch(ODOO_SIGN_IN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        barcode,
        pin,
        app: "pwa_colaboradores",
        app_ver: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "",
        device_name: navigator.userAgent,
      },
      id: Date.now(),
    }),
  });

  // Si la respuesta no es OK (4xx, 5xx)
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Error ${res.status}`;
    try {
      const err = JSON.parse(text);
      message = err.message || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const text = await res.text().catch(() => "");
  if (!text) throw new Error("Respuesta vacía del servidor");

  try {
    const json = JSON.parse(text);
    return json?.result ?? json;
  } catch {
    throw new Error(text || "Respuesta inválida del servidor");
  }
}

function base64UrlEncode(input) {
  return btoa(unescape(encodeURIComponent(input)));
}

function buildLocalSessionToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.odoo`;
}



function decodeSessionToken(sessionToken, fallback = {}) {
  const payload = { ...fallback };
  try {
    const parts = sessionToken.split(".");
    if (parts.length === 3) {
      return {
        ...payload,
        ...JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))),
        session_token: sessionToken,
      };
    }
  } catch {
    // Si el JWT viene raro, usamos el payload mínimo sin bloquear el acceso.
  }
  return { ...payload, session_token: sessionToken };
}

function inferCompanyId(role) {
  if (!role) return 0;
  if (["operador_barra", "operador_rolito", "auxiliar_produccion", "supervisor_produccion", "almacenista_pt"].includes(role)) {
    return 35;
  }
  if (["jefe_ruta", "auxiliar_ruta", "almacenista_entregas", "supervisor_ventas"].includes(role)) {
    return 34;
  }
  if (["director_ti", "auxiliar_ti", "jefe_legal", "operador_torres"].includes(role)) {
    return 1;
  }
  if (["auxiliar_admin", "gerente_sucursal"].includes(role)) {
    return 34;
  }
  return 0;
}

function inferCompanyLabel(companyId, role) {
  if (companyId === 1) return "CSC GF";
  if (companyId === 35) return "Fabricación de Congelados";
  if (companyId === 34) {
    return ["jefe_ruta", "auxiliar_ruta", "almacenista_entregas", "supervisor_ventas"].includes(role)
      ? "GLACIEM"
      : "Soluciones en Producción GLACIEM";
  }
  if (companyId === 36) return "Vía Ágil";
  return "";
}

function resolveRole(employee, jobTitle) {
  const directRole = employee?.pwa_job_key || employee?.job_key || employee?.x_job_key || "";
  if (directRole) return directRole;

  const normalized = (jobTitle || "").toLowerCase();
  const roleMap = [
    ["dirección general", "direccion_general"],
    ["director de ti", "director_ti"],
    ["jefe de legal", "jefe_legal"],
    ["jefe de mantenimiento", "auxiliar_ti"],
    ["auxiliar de barra", "operador_barra"],
    ["auxiliar de producción", "auxiliar_produccion"],
    ["jefe de líneas", "supervisor_produccion"],
    ["almacenista pt", "almacenista_pt"],
    ["auxiliar de ruta", "auxiliar_ruta"],
    ["almacenista entregas", "almacenista_entregas"],
    ["supervisor ventas", "supervisor_ventas"],
    ["auxiliar administrativa", "auxiliar_admin"],
    ["gerente de sucursal", "gerente_sucursal"],
    ["jefe de ruta", "jefe_ruta"],
    ["operador torres", "operador_torres"],
  ];

  const match = roleMap.find(([needle]) => normalized.includes(needle));
  return match?.[1] || "";
}

function buildSessionFromOdoo(result, cleanPin, cleanBarcode) {
  const employee = result?.employee || {};
  const jobTitle = employee?.job_title || employee?.job_id?.[1] || "";
  const role = resolveRole(employee, jobTitle);
  const userId = result?.user_id || employee?.user_id?.[0] || 0;
  const employeeId = employee?.id || result?.employee_id || 0;
  const companyId = employee?.company_id?.[0] || inferCompanyId(role);
  const company = employee?.company_id?.[1] || inferCompanyLabel(companyId, role);
  const now = Math.floor(Date.now() / 1000);

  const fallbackPayload = {
    source: "odoo",
    role,
    job_key: role,
    job_title: jobTitle,
    employee_id: employeeId,
    name: employee?.name || result?.message?.replace(/^Bienvenido,\s*/, "") || "Empleado",
    company_id: companyId,
    company,
    turno: employee?.turno || employee?.x_turno || result?.turno || "",
    api_key: result?.api_key || "",
    odoo_api_key: result?.api_key || "",
    odoo_employee_token: result?.gf_employee_token || "",
    odoo_employee_session_id: result?.gf_employee_session_id || null,
    odoo_employee_session_expires_at: result?.gf_employee_session_expires_at || "",
    employee_has_user: Boolean(result?.employee_has_user),
    user_id: userId,
    exp: now + 86400 * 7,
    iat: now,
  };

  const sessionToken = result?.session_token || buildLocalSessionToken(fallbackPayload);
  const decoded = decodeSessionToken(sessionToken, fallbackPayload);

  return {
    ...decoded,
    ...fallbackPayload,
    session_token: sessionToken,
  };
}

/*
// ── Legacy WhatsApp OTP flow ───────────────────────────────────────────────
// Conservado para reactivarlo después sin reconstruir la integración.

async function requestMagicLink(phone) {
  const res = await fetch(`${WEBHOOK_URL}/pwa-auth-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, app: "pwa_colaboradores" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Error ${res.status}`;
    try {
      const err = JSON.parse(text);
      message = err.message || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const text = await res.text().catch(() => "");
  if (!text) return { status: "sent" };

  try {
    return JSON.parse(text);
  } catch {
    return { status: "sent", message: text };
  }
}

async function verifyMagicToken(token, phone) {
  const res = await fetch(`${WEBHOOK_URL}/pwa-auth-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, phone, app: "pwa_colaboradores" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Error ${res.status}`;
    try {
      const err = JSON.parse(text);
      message = err.message || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const text = await res.text().catch(() => "");
  if (!text) throw new Error("Respuesta vacía del servidor");
  return JSON.parse(text);
}
*/

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

// ── Bypass admin — empleados registrados en Odoo (x_job_key) ─────────────
// Actualizado: 2026-04-02 desde hr.employee con x_job_key != false
const ADMIN_EMPLOYEES = [
  // ── Dirección / TI ─────────────────────────────────────────────────────
  { id: 1,   name: 'Yamil Esteban Higareda',               role: 'direccion_general',     company: 'CSC GF',                             job: 'Dirección General' },
  { id: 673, name: 'Sebastian Cervera Maltos',              role: 'director_ti',           company: 'CSC GF',                             job: 'Director de TI' },
  { id: 706, name: 'Carlos Alexander Valencia Tapia',       role: 'auxiliar_ti',           company: 'CSC GF',                             job: 'Jefe de mantenimiento' },
  { id: 693, name: 'Javier Alejandro Cedillo Villalpando',  role: 'jefe_legal',            company: 'CSC GF',                             job: 'Jefe de legal' },
  // ── Producción — Fabricación de Congelados ─────────────────────────────
  { id: 714, name: 'José Manuel Ávila',                     role: 'operador_barra',        company: 'Fabricación de Congelados',           job: 'Auxiliar de barra' },
  { id: 691, name: 'Julio Raul de la Cruz González',        role: 'auxiliar_produccion',    company: 'Fabricación de Congelados',           job: 'Auxiliar de producción' },
  { id: 690, name: 'Arturo Narciso',                        role: 'supervisor_produccion',  company: 'Fabricación de Congelados',           job: 'Jefe de líneas' },
  // ── Administración ─────────────────────────────────────────────────────
  { id: 692, name: 'Claudia Martinez Balcazar',             role: 'auxiliar_admin',         company: 'Soluciones en Producción GLACIEM',    job: 'Auxiliar Administrativa' },
  { id: 699, name: 'Dirección Grupo Frío',                  role: 'gerente_sucursal',       company: 'Soluciones en Producción GLACIEM',    job: 'Gerente de Sucursal' },
  // ── Logística / Ventas — Jefes de Ruta ─────────────────────────────────
  { id: 698, name: 'Alfredo Isaac Reyes Pérez',             role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 710, name: 'Angel Danael Pérez Vera',               role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 679, name: 'Esteban Aleman Serrado',                role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 684, name: 'Estevan Valerio Guzmán',                role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 681, name: 'Jhony Irvin Marquina Rodríguez',        role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 686, name: 'Luis Molina Cholula',                   role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 682, name: 'Manuel Cruz Armenta',                   role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 683, name: 'Orlando Tlatempa Rodríguez',            role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
  { id: 711, name: 'Sebastian Tadeo Amado Sánchez',         role: 'jefe_ruta',             company: 'Soluciones en Producción GLACIEM',    job: 'Jefe de ruta' },
];

// Roles que aún no tienen empleados asignados en Odoo — se mantienen como genéricos
const ADMIN_EXTRA_ROLES = [
  { role: 'operador_rolito',      label: 'Operador Rolito',        desc: 'Producción — Congelados (sin empleado asignado)' },
  { role: 'almacenista_pt',       label: 'Almacenista PT',         desc: 'Almacén PT (sin empleado asignado)' },
  { role: 'auxiliar_ruta',        label: 'Auxiliar de Ruta',       desc: 'Logística (sin empleado asignado)' },
  { role: 'almacenista_entregas', label: 'Almacenista Entregas',   desc: 'Logística (sin empleado asignado)' },
  { role: 'supervisor_ventas',    label: 'Supervisor Ventas',      desc: 'Ventas (sin empleado asignado)' },
  { role: 'operador_torres',      label: 'Operador Torres',        desc: 'Torres de Control (sin empleado asignado)' },
];

function buildMockSession(emp) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: emp.role,
    name: emp.name || emp.label || 'Admin',
    employee_id: emp.id || 0,
    company: emp.company || emp.desc || '',
    company_id: 0,
    exp: now + 86400 * 7,
    iat: now,
    _bypass: true,
  };
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const session_token = `${header}.${body}.bypass`;
  return { ...payload, session_token };
}

// ── Componente principal ────────────────────────────────────────────────
export default function LoginScreen() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [barcode, setBarcode] = useState("");
  const [step, setStep] = useState("input"); // input | loading | admin
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Admin bypass: 5 taps en "COLABORADORES" ─────────────────────────
  const handleAdminTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 5) {
      setStep("admin");
      setTapCount(0);
    }
  };

  const handleBypassLogin = (profile) => {
    const session = buildMockSession(profile);
    login(session);
    navigate("/", { replace: true });
  };

  const handleSubmit = async () => {
    const cleanPin = pin.trim();
    const cleanBarcode = barcode.trim();

    if (!cleanPin || !cleanBarcode) {
      setError("Ingresa tu PIN y barcode");
      return;
    }

    setError("");
    setStep("loading");

    try {
      const result = await requestEmployeeSession(cleanPin, cleanBarcode);
      if (!result || result.status !== 200 || result.case !== 1) {
        throw new Error(
          result?.error ||
          result?.message ||
          "No se pudo validar el PIN y barcode"
        );
      }

      const session = buildSessionFromOdoo(result, cleanPin, cleanBarcode);
      login(session);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e.message || "Error iniciando sesión");
      setStep("input");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
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
                <img
                  src="/icons/logo-grupo-frio.svg"
                  alt="Grupo Frío"
                  className="w-[168px] h-auto object-contain"
                />
              </div>
            </div>
          </div>

          <span
            className="text-[11px] font-medium uppercase tracking-[0.42em] text-white/35 cursor-default select-none"
            onClick={handleAdminTap}
          >
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
        {step === "admin" ? (
          <div className={`w-full flex flex-col gap-3 ${mounted ? "fade-up-3" : "opacity-0"}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                Bypass — Elegir empleado
              </p>
              <button
                onClick={() => { setStep("input"); setTapCount(0); }}
                className="text-white/30 text-xs underline hover:text-white/50 transition-colors"
              >
                Cancelar
              </button>
            </div>
            <div
              className="w-full rounded-2xl border overflow-hidden"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                maxHeight: "52vh",
                overflowY: "auto",
              }}
            >
              {/* Empleados reales de Odoo */}
              {ADMIN_EMPLOYEES.map((emp) => (
                <button
                  key={`emp-${emp.id}`}
                  onClick={() => handleBypassLogin(emp)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: "rgba(43,143,224,0.15)",
                      color: "#61b2ff",
                    }}
                  >
                    {emp.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-white/30 text-[10px] truncate">
                      <span className="text-blue-400/60">{emp.role}</span>
                      {' · '}{emp.job} · {emp.company}
                    </p>
                  </div>
                </button>
              ))}

              {/* Separador — roles sin empleado */}
              <div className="px-4 py-2" style={{ background: "rgba(245,158,11,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-yellow-400/50 text-[10px] font-semibold uppercase tracking-wider">
                  Roles sin empleado asignado
                </p>
              </div>
              {ADMIN_EXTRA_ROLES.map((p) => (
                <button
                  key={`role-${p.role}`}
                  onClick={() => handleBypassLogin(p)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: "rgba(245,158,11,0.12)",
                      color: "#f59e0b",
                    }}
                  >
                    {p.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/60 text-sm font-medium truncate">{p.label}</p>
                    <p className="text-white/30 text-[10px] truncate">{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-yellow-400/40 text-[10px] text-center mt-1">
              Sesión de prueba — las llamadas a API no funcionarán sin JWT real
            </p>
          </div>
        ) : (
          <div className={`w-full flex flex-col gap-4 ${mounted ? "fade-up-3" : "opacity-0"}`}>
            <div>
              <label className="block text-white/40 text-xs font-medium tracking-widest uppercase mb-2.5">
                PIN de empleado
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ingresa tu PIN"
                  disabled={step === "loading"}
                  className="input-gf w-full rounded-2xl py-4 pr-4 text-base font-medium"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={{ paddingLeft: "16px" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-white/40 text-xs font-medium tracking-widest uppercase mb-2.5">
                Barcode
              </label>

              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ingresa o escanea el barcode"
                  disabled={step === "loading"}
                  className="input-gf w-full rounded-2xl py-4 pr-4 text-base font-medium"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={{ paddingLeft: "16px" }}
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-xs mt-0 flex items-center gap-1.5">
                <span>⚠</span> {error}
              </p>
            )}

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
                  <span>Validando...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>

            <p className="text-white/20 text-xs text-center leading-relaxed">
              Ingresa tu PIN y barcode para obtener tu clave de PWA.
            </p>
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
