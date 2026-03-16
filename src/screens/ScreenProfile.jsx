import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../App";

/* ============================================================================
   DESIGN TOKENS
============================================================================ */
const TOKENS = {
  colors: {
    bg0: "#030811",
    bg1: "#04101f",
    bg2: "#07162b",
    surface: "rgba(255,255,255,0.05)",
    surfaceSoft: "rgba(255,255,255,0.03)",
    surfaceStrong: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.08)",
    borderBlue: "rgba(97,178,255,0.18)",
    blue: "#15499B",
    blue2: "#2B8FE0",
    blue3: "#61b2ff",
    blueGlow: "rgba(43,143,224,0.16)",
    text: "#FFFFFF",
    textSoft: "rgba(255,255,255,0.82)",
    textMuted: "rgba(255,255,255,0.60)",
    textLow: "rgba(255,255,255,0.55)",
    success: "#22c55e",
    successSoft: "rgba(34,197,94,0.12)",
    warning: "#f59e0b",
    error: "#ef4444",
    errorSoft: "rgba(239,68,68,0.12)",
  },
  radius: { sm: 14, md: 18, lg: 22, xl: 24, pill: 999 },
  shadow: {
    soft: "0 8px 20px rgba(0,0,0,0.18)",
    md: "0 14px 30px rgba(0,0,0,0.22)",
    lg: "0 20px 44px rgba(0,0,0,0.28)",
    blue: "0 0 22px rgba(43,143,224,0.16)",
    inset: "inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  glass: {
    panel: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    panelSoft: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
    hero: "linear-gradient(180deg, rgba(21,73,155,0.20), rgba(255,255,255,0.03))",
  },
  motion: {
    fast: "180ms ease",
    normal: "280ms ease",
    spring: "380ms cubic-bezier(0.34,1.56,0.64,1)",
  },
};

function getTypo(sw) {
  const sm = sw < 340;
  return {
    display:  { fontSize: sm ? 22 : 28, fontWeight: 700, letterSpacing: "-0.04em" },
    h1:       { fontSize: sm ? 20 : 24, fontWeight: 700, letterSpacing: "-0.03em" },
    h2:       { fontSize: sm ? 17 : 20, fontWeight: 700, letterSpacing: "-0.02em" },
    title:    { fontSize: sm ? 14 : 16, fontWeight: 700, letterSpacing: "-0.01em" },
    body:     { fontSize: sm ? 12 : 14, fontWeight: 500 },
    caption:  { fontSize: sm ? 11 : 12, fontWeight: 500 },
    overline: { fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" },
  };
}

/* ============================================================================
   API CONFIG
============================================================================ */
const N8N_BASE = "/api-n8n";
function getSession() {
  try { return JSON.parse(localStorage.getItem("gf_session") || "{}"); } catch { return {}; }
}
function clearSession() {
  try { localStorage.removeItem("gf_session"); } catch {}
}
async function apiGet(path) {
  const { session_token } = getSession();
  if (!session_token) throw new Error("no_session");
  const res = await fetch(`${N8N_BASE}${path}`, {
    method: "GET", headers: { "Authorization": `Bearer ${session_token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}
async function apiPatch(path, body) {
  const { session_token } = getSession();
  if (!session_token) throw new Error("no_session");
  const res = await fetch(`${N8N_BASE}${path}`, {
    method: "PATCH", headers: { "Authorization": `Bearer ${session_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const { session_token } = getSession();
  if (!session_token) throw new Error("no_session");
  const res = await fetch(`${N8N_BASE}${path}`, {
    method: "POST", headers: { "Authorization": `Bearer ${session_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

// Mapea response de /pwa-employee-profile al shape que usa la pantalla
function mapOdooEmployee(d) {
  return {
    id: d.id,
    name: d.name || "Empleado",
    job_id: [d.job_id || 0, d.job_title || "Grupo Frío"],
    department_id: [d.department_id || 0, d.department || "—"],
    work_location_id: [d.work_location_id || 0, d.work_location || "—"],
    company_id: [d.company_id || 0, d.company || "Grupo Frío"],
    mobile_phone: d.mobile_phone || "",
    image_128: d.image_128 || null,
    date_start: d.date_start || null,
    remaining_leaves: d.remaining_leaves || 0,
    partner_id: [d.partner_id || 0, d.name || ""],
  };
}

/* ============================================================================
   HELPERS
============================================================================ */
function getInitials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function calcAntiguedad(dateStart) {
  const start = new Date(dateStart);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years < 0) return "Recién ingresado";
  if (years > 0) return `${years} año${years > 1 ? "s" : ""}${months > 0 ? ` ${months} mes${months > 1 ? "es" : ""}` : ""}`;
  return `${months} mes${months !== 1 ? "es" : ""}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 14;
}

/* ============================================================================
   NAV
============================================================================ */
const NAV_ITEMS = [
  { id:"home",   label:"Inicio",  icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:"kpis",   label:"KPIs",    icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:"encuestas", label:"Encuestas", icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { id:"logros", label:"Logros",  icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> },
  { id:"perfil", label:"Yo",      icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

function BottomNav({ sw }) {
  const navigate = useNavigate();
  const { logout } = useSession();
  const ROUTES = { home: "/", kpis: "/kpis", encuestas: "/surveys", logros: "/badges", badges: "/badges", perfil: "/profile" };
  const navH = sw < 340 ? 58 : 64;
  const itemW = sw < 340 ? 48 : 58;
  return (
    <div style={{ position:"absolute", left:10, right:10, bottom:10, height:navH, borderRadius:20, background:TOKENS.glass.panel, border:`1px solid ${TOKENS.colors.border}`, backdropFilter:"blur(16px)", boxShadow:TOKENS.shadow.md, display:"flex", alignItems:"center", justifyContent:"space-around", zIndex:5 }}>
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === "perfil";
        const Icon = item.icon;
        return (
          <button key={item.id} onClick={() => navigate(ROUTES[item.id] || "/")} style={{ width:itemW, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, color:isActive?TOKENS.colors.blue3:"rgba(255,255,255,0.42)", transition:`all ${TOKENS.motion.fast}` }}>
            <div style={{ width:34, height:34, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", background:isActive?"rgba(43,143,224,0.10)":"transparent", border:isActive?"1px solid rgba(97,178,255,0.14)":"1px solid transparent", boxShadow:isActive?"0 0 16px rgba(43,143,224,0.12)":"none" }}>
              <Icon />
            </div>
            <span style={{ fontSize:9, fontWeight:isActive?700:500 }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   SHARED
============================================================================ */
function IceParticles() {
  const particles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id:i, x:(i*37+11)%100, y:(i*53+7)%100, size:(i%3)+1,
      delay:(i*0.4)%6, duration:((i%4)*1.5)+7, opacity:(i%4)*0.03+0.03,
    })),
    []
  );
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {particles.map((p) => (
        <div key={p.id} style={{ position:"absolute", left:`${p.x}%`, top:`${p.y}%`, width:p.size, height:p.size, borderRadius:"50%", background:"rgba(71,161,255,0.7)", opacity:p.opacity, animation:`float ${p.duration}s ${p.delay}s ease-in-out infinite alternate` }} />
      ))}
    </div>
  );
}

function FadeIn({ children, delay = 0, y = 12 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{ opacity:visible?1:0, transform:visible?"translateY(0)":`translateY(${y}px)`, transition:`opacity ${TOKENS.motion.normal}, transform ${TOKENS.motion.normal}` }}>
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background:TOKENS.glass.panel, border:`1px solid ${TOKENS.colors.border}`, borderRadius:TOKENS.radius.xl, boxShadow:`${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`, backdropFilter:"blur(12px)", ...style }}>
      {children}
    </div>
  );
}

/* ============================================================================
   AVATAR
============================================================================ */
function Avatar({ employee, size = 80, editable = false, onEdit }) {
  const [pressed, setPressed] = useState(false);
  const initials = getInitials(employee.name);

  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <div
        onMouseDown={() => editable && setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onTouchStart={() => editable && setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onClick={() => editable && onEdit?.()}
        style={{
          width:size, height:size, borderRadius:"50%",
          background:"linear-gradient(135deg, rgba(43,143,224,0.40), rgba(21,73,155,0.55))",
          border:"2px solid rgba(97,178,255,0.30)",
          boxShadow:"0 0 24px rgba(43,143,224,0.22), inset 0 1px 0 rgba(255,255,255,0.12)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:size * 0.32, fontWeight:800, color:TOKENS.colors.text, letterSpacing:"-0.02em",
          cursor:editable?"pointer":"default",
          transform:pressed?"scale(0.96)":"scale(1)",
          transition:`transform ${TOKENS.motion.spring}`,
          overflow:"hidden",
        }}
      >
        {employee.image_128
          ? <img src={employee.image_128} alt={employee.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          : initials
        }
      </div>
      {editable && (
        <div style={{ position:"absolute", bottom:0, right:0, width:size * 0.32, height:size * 0.32, borderRadius:"50%", background:"linear-gradient(135deg, #2B8FE0, #15499B)", border:"2px solid #07162b", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:TOKENS.shadow.soft, cursor:"pointer" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   HERO CARD
============================================================================ */
function HeroCard({ employee, sw, delay, onEditPhoto }) {
  const typo = getTypo(sw);
  const antiguedad = calcAntiguedad(employee.date_start);
  return (
    <FadeIn delay={delay}>
      <Card style={{ padding: sw < 340 ? 16 : 20, background:TOKENS.glass.hero, border:`1px solid ${TOKENS.colors.borderBlue}`, boxShadow:`${TOKENS.shadow.lg}, ${TOKENS.shadow.inset}, ${TOKENS.shadow.blue}` }}>
        <div style={{ display:"flex", alignItems:"center", gap: sw < 340 ? 14 : 18 }}>
          <Avatar employee={employee} size={sw < 340 ? 68 : 78} editable onEdit={onEditPhoto} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ ...typo.overline, color:"rgba(97,178,255,0.60)", marginBottom:4 }}>MI PERFIL</div>
            <div style={{ ...typo.h2, color:TOKENS.colors.text, lineHeight:1.1, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {employee.name}
            </div>
            <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {employee.job_id[1]}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:TOKENS.colors.success, boxShadow:`0 0 6px ${TOKENS.colors.success}` }} />
              <span style={{ fontSize:9, color:TOKENS.colors.success, fontWeight:700 }}>{antiguedad} en Grupo Frío</span>
            </div>
          </div>
        </div>
      </Card>
    </FadeIn>
  );
}

/* ============================================================================
   VACATION CARD
============================================================================ */
function VacationCard({ days, sw, delay }) {
  const typo = getTypo(sw);
  const color = days >= 10 ? TOKENS.colors.success : days >= 5 ? TOKENS.colors.warning : TOKENS.colors.error;
  const glowColor = days >= 10 ? "rgba(34,197,94,0.16)" : days >= 5 ? "rgba(245,158,11,0.16)" : "rgba(239,68,68,0.16)";
  const label = days >= 10 ? "Buen saldo" : days >= 5 ? "Úsalos pronto" : "Quedan pocos";
  return (
    <FadeIn delay={delay}>
      <Card style={{ padding:`14px ${sw < 340 ? 14 : 18}px`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ ...typo.overline, color:"rgba(97,178,255,0.55)", marginBottom:5 }}>VACACIONES DISPONIBLES</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <div style={{ fontSize: sw < 340 ? 32 : 38, fontWeight:800, color, letterSpacing:"-0.04em", lineHeight:1, textShadow:`0 0 20px ${glowColor}` }}>
              {days}
            </div>
            <div style={{ fontSize:12, color:TOKENS.colors.textMuted, fontWeight:600, lineHeight:1.2 }}>días</div>
          </div>
          <div style={{ fontSize:9, color, fontWeight:700, marginTop:4 }}>{label}</div>
        </div>
        <div style={{ width:52, height:52, borderRadius:16, background:`rgba(34,197,94,0.08)`, border:`1px solid rgba(34,197,94,0.14)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>
          🏖️
        </div>
      </Card>
    </FadeIn>
  );
}

/* ============================================================================
   INFO ROW
============================================================================ */
function InfoRow({ label, value, icon, editable = false, onEdit, isEditing = false, editValue, onEditChange, onEditSave, onEditCancel, saving = false, isLast = false, sw }) {
  const typo = getTypo(sw);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:`12px 0`, borderBottom: isLast ? "none" : `1px solid ${TOKENS.colors.border}` }}>
      <div style={{ width:32, height:32, borderRadius:10, background:"rgba(43,143,224,0.08)", border:`1px solid rgba(43,143,224,0.14)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:TOKENS.colors.blue3 }}>
        {icon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:"0.12em", color:TOKENS.colors.textLow, marginBottom:3, textTransform:"uppercase" }}>{label}</div>
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditSave();
              if (e.key === "Escape") onEditCancel();
            }}
            disabled={saving}
            style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${TOKENS.colors.borderBlue}`, borderRadius:8, padding:"6px 8px", color:TOKENS.colors.text, fontSize:13, fontWeight:600, fontFamily:"inherit", outline:"none", boxShadow:`0 0 0 2px rgba(97,178,255,0.14)`, opacity:saving ? 0.7 : 1 }}
          />
        ) : (
          <div style={{ ...typo.body, color:TOKENS.colors.textSoft, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {value}
          </div>
        )}
      </div>

      {editable && !isEditing && (
        <button onClick={onEdit} style={{ width:30, height:30, borderRadius:8, background:"rgba(43,143,224,0.08)", border:`1px solid rgba(43,143,224,0.14)`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, color:TOKENS.colors.blue3 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}

      {isEditing && (
        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
          <button
            onClick={onEditSave}
            disabled={saving}
            style={{ width:30, height:30, borderRadius:8, background:"rgba(34,197,94,0.12)", border:`1px solid rgba(34,197,94,0.24)`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:TOKENS.colors.success, opacity:saving?0.6:1 }}
          >
            {saving ? (
              <div style={{ width:10, height:10, borderRadius:"50%", border:"2px solid rgba(34,197,94,0.35)", borderTopColor:TOKENS.colors.success, animation:"spin 0.8s linear infinite" }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </button>
          <button
            onClick={onEditCancel}
            disabled={saving}
            style={{ width:30, height:30, borderRadius:8, background:TOKENS.colors.errorSoft, border:`1px solid rgba(239,68,68,0.24)`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:TOKENS.colors.error, opacity:saving?0.6:1 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   DIALOGS
============================================================================ */
function LogoutDialog({ onConfirm, onCancel, sw }) {
  const [visible, setVisible] = useState(false);
  const typo = getTypo(sw);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const handleCancel = () => { setVisible(false); setTimeout(onCancel, 200); };
  const handleConfirm = () => { setVisible(false); setTimeout(onConfirm, 200); };

  return (
    <div onClick={handleCancel} style={{ position:"absolute", inset:0, zIndex:20, background:`rgba(3,8,17,${visible ? 0.78 : 0})`, transition:"background 200ms ease", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width:"100%", maxWidth:320, background:"linear-gradient(180deg, #07162b, #04101f)", borderRadius:TOKENS.radius.xl, border:`1px solid ${TOKENS.colors.borderBlue}`, padding:24, boxShadow:`${TOKENS.shadow.lg}, 0 0 40px rgba(43,143,224,0.10)`, transform:visible?"scale(1)":"scale(0.88)", opacity:visible?1:0, transition:`transform 280ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease`, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>👋</div>
        <div style={{ ...typo.h2, color:TOKENS.colors.text, marginBottom:8 }}>¿Cerrar sesión?</div>
        <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, lineHeight:1.55, marginBottom:22 }}>
          Tendrás que volver a ingresar con tu número de celular y el enlace de WhatsApp.
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={handleCancel} style={{ flex:1, height:44, borderRadius:TOKENS.radius.md, background:"rgba(255,255,255,0.06)", border:`1px solid ${TOKENS.colors.border}`, color:TOKENS.colors.textMuted, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancelar</button>
          <button onClick={handleConfirm} style={{ flex:1, height:44, borderRadius:TOKENS.radius.md, background:TOKENS.colors.errorSoft, border:`1px solid rgba(239,68,68,0.30)`, color:TOKENS.colors.error, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Salir</button>
        </div>
      </div>
    </div>
  );
}

function EditPhotoSheet({ onClose, sw }) {
  const [visible, setVisible] = useState(false);
  const typo = getTypo(sw);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => { setVisible(false); setTimeout(onClose, 220); };

  const options = [
    { icon:"📷", label:"Tomar foto",       sub:"Usa la cámara de tu teléfono" },
    { icon:"🖼️", label:"Elegir de galería", sub:"Selecciona desde tus fotos" },
    { icon:"🗑️", label:"Eliminar foto",     sub:"Usar iniciales", destructive:true },
  ];

  return (
    <div onClick={handleClose} style={{ position:"absolute", inset:0, zIndex:20, background:`rgba(3,8,17,${visible ? 0.72 : 0})`, transition:"background 220ms ease", display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background:"linear-gradient(180deg, #07162b, #04101f)", borderRadius:"24px 24px 0 0", border:`1px solid ${TOKENS.colors.borderBlue}`, borderBottom:"none", padding:`22px ${sw < 340 ? 16 : 22}px 36px`, boxShadow:`0 -20px 60px rgba(0,0,0,0.6)`, transform:visible?"translateY(0)":"translateY(100%)", transition:`transform 280ms cubic-bezier(0.34,1.56,0.64,1)` }}>
        <div style={{ width:36, height:4, borderRadius:2, background:"rgba(255,255,255,0.14)", margin:"0 auto 18px" }} />
        <div style={{ ...typo.title, color:TOKENS.colors.text, marginBottom:16, textAlign:"center" }}>Editar foto de perfil</div>
        {options.map((opt, i) => (
          <div key={i} onClick={handleClose} style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 0", borderBottom: i < options.length - 1 ? `1px solid ${TOKENS.colors.border}` : "none", cursor:"pointer" }}>
            <div style={{ fontSize:22, width:34, textAlign:"center" }}>{opt.icon}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color: opt.destructive ? TOKENS.colors.error : TOKENS.colors.text }}>{opt.label}</div>
              <div style={{ fontSize:11, color:TOKENS.colors.textLow, marginTop:2 }}>{opt.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   SKELETONS
============================================================================ */
function SkeletonShimmer({ style = {} }) {
  return (
    <div style={{ background:"linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.05) 75%)", backgroundSize:"200% 100%", animation:"shimmerMove 1.4s ease infinite", ...style }} />
  );
}

function SkeletonHero({ sw }) {
  return (
    <Card style={{ padding:sw < 340 ? 16 : 20 }}>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        <SkeletonShimmer style={{ width:78, height:78, borderRadius:"50%" }} />
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
          <SkeletonShimmer style={{ height:10, borderRadius:4, width:"30%" }} />
          <SkeletonShimmer style={{ height:16, borderRadius:4, width:"62%" }} />
          <SkeletonShimmer style={{ height:10, borderRadius:4, width:"42%" }} />
          <SkeletonShimmer style={{ height:9,  borderRadius:4, width:"36%" }} />
        </div>
      </div>
    </Card>
  );
}

function SkeletonVacation() {
  return (
    <Card style={{ padding:"16px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div style={{ flex:1 }}>
        <SkeletonShimmer style={{ height:10, borderRadius:4, width:"42%", marginBottom:8 }} />
        <SkeletonShimmer style={{ height:32, borderRadius:6, width:"22%", marginBottom:8 }} />
        <SkeletonShimmer style={{ height:9,  borderRadius:4, width:"26%" }} />
      </div>
      <SkeletonShimmer style={{ width:52, height:52, borderRadius:16 }} />
    </Card>
  );
}

function SkeletonInfoCard() {
  return (
    <Card style={{ padding:"4px 18px 6px" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom: i < 5 ? `1px solid ${TOKENS.colors.border}` : "none" }}>
          <SkeletonShimmer style={{ width:32, height:32, borderRadius:10 }} />
          <div style={{ flex:1 }}>
            <SkeletonShimmer style={{ height:8,  borderRadius:4, width:"22%", marginBottom:6 }} />
            <SkeletonShimmer style={{ height:12, borderRadius:4, width: i % 2 === 0 ? "48%" : "64%" }} />
          </div>
          {i === 5 && <SkeletonShimmer style={{ width:28, height:28, borderRadius:8 }} />}
        </div>
      ))}
    </Card>
  );
}

/* ============================================================================
   MAIN SCREEN
============================================================================ */
function PerfilScreen({ sw = 390, sh = 844 }) {
  const typo = getTypo(sw);
  const [isLoading, setIsLoading]       = useState(true);
  const [employee, setEmployee]         = useState(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue]     = useState("");
  const [phoneSaving, setPhoneSaving]   = useState(false);
  const [phoneSaved, setPhoneSaved]     = useState(false);
  const [phoneError, setPhoneError]     = useState("");
  const [saveError, setSaveError]       = useState("");
  const [showLogout, setShowLogout]     = useState(false);
  const [showEditPhoto, setShowEditPhoto] = useState(false);
  const [logoutDone, setLogoutDone]     = useState(false);

  const navH = sw < 340 ? 58 : 64;
  const navBot = 10;
  const scrollBottom = navBot + navH + 10;
  const topPad = sw < 340 ? 36 : 44;
  const sidePad = sw < 340 ? 14 : 18;

  // Cargar perfil real desde W16
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiGet("/pwa-employee-profile")
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          setEmployee(mapOdooEmployee(res.data));
        }
        setIsLoading(false);
      })
      .catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePhoneEdit = () => {
    if (!employee) return;
    setPhoneValue(employee.mobile_phone);
    setPhoneError("");
    setSaveError("");
    setEditingPhone(true);
  };

  const handlePhoneSave = () => {
    if (phoneSaving) return;

    const clean = phoneValue.trim();
    if (!isValidPhone(clean)) {
      setPhoneError("Ingresa un número válido (10-14 dígitos)");
      return;
    }

    setPhoneError("");
    setSaveError("");
    setPhoneSaving(true);

    // PATCH real a W17 → Odoo hr.employee.mobile_phone
    apiPatch("/pwa-employee-phone", { mobile_phone: clean })
      .then(res => {
        if (res.success) {
          setEmployee((prev) => ({ ...prev, mobile_phone: clean }));
          setPhoneSaving(false);
          setEditingPhone(false);
          setPhoneSaved(true);
          const t = setTimeout(() => setPhoneSaved(false), 2200);
          return () => clearTimeout(t);
        } else {
          setPhoneSaving(false);
          setSaveError(res.error || "No se pudo guardar. Intenta de nuevo.");
        }
      })
      .catch(() => {
        setPhoneSaving(false);
        setSaveError("Error de conexión. Intenta de nuevo.");
      });
  };

  const handlePhoneCancel = () => {
    if (phoneSaving) return;
    setEditingPhone(false);
    setPhoneValue("");
    setPhoneError("");
    setSaveError("");
  };

  const handleLogoutConfirm = () => {
    setShowLogout(false);
    // POST real a W17 → limpia token en Odoo + localStorage
    apiPost("/pwa-logout", {})
      .catch(() => {}) // fire-and-forget, limpiar igual
      .finally(() => {
        clearSession();   // limpia localStorage
        logout();         // limpia SessionContext en memoria
        navigate("/login", { replace: true });
      });
  };

  const infoRows = employee ? [
    {
      label: "Puesto",
      value: employee.job_id[1],
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
    },
    {
      label: "Departamento",
      value: employee.department_id[1],
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      label: "Sucursal",
      value: employee.work_location_id[1],
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    },
    {
      label: "Empresa",
      value: employee.company_id[1],
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    },
    {
      label: "Fecha de ingreso",
      value: formatDate(employee.date_start),
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      label: "Celular",
      value: employee.mobile_phone,
      editable: true,
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
    },
  ] : [];

  return (
    <div style={{ position:"relative", width:sw, height:sh, overflow:"hidden", background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.20) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", fontFamily:"'DM Sans',system-ui,sans-serif", overscrollBehaviorY:"none", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      <IceParticles />
      <div style={{ position:"absolute", inset:0, opacity:0.032, backgroundImage:"linear-gradient(rgba(43,143,224,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(43,143,224,.45) 1px,transparent 1px)", backgroundSize:"48px 48px" }} />

      {/* SCROLL CONTAINER */}
      <div style={{ position:"absolute", top:0, left:0, right:0, bottom:scrollBottom, overflowY:"auto", zIndex:2, padding:`${topPad}px ${sidePad}px 20px`, display:"flex", flexDirection:"column", gap:14 }}>
        {isLoading ? (
          <>
            <SkeletonHero sw={sw} />
            <SkeletonVacation />
            <SkeletonInfoCard />
          </>
        ) : !employee ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"32px 0", textAlign:"center" }}>
            <div style={{ fontSize:28 }}>📡</div>
            <div style={{ fontSize:14, fontWeight:500, color:TOKENS.colors.textMuted }}>No se pudo cargar el perfil</div>
            <button onClick={()=>{ setIsLoading(true); apiGet("/pwa-employee-profile").then(r=>{ if(r.success&&r.data) setEmployee(mapOdooEmployee(r.data)); setIsLoading(false); }).catch(()=>setIsLoading(false)); }} style={{ border:"none", cursor:"pointer", padding:"10px 22px", minHeight:44, borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:13, fontWeight:700, fontFamily:"inherit" }}>Reintentar</button>
          </div>
        ) : (
          <>
            <HeroCard employee={employee} sw={sw} delay={40} onEditPhoto={() => setShowEditPhoto(true)} />
            <VacationCard days={employee.remaining_leaves} sw={sw} delay={100} />

            <FadeIn delay={160}>
              <Card style={{ padding:`4px ${sw < 340 ? 14 : 18}px 6px` }}>
                {/* Toast éxito */}
                {phoneSaved && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 0 6px", borderBottom:`1px solid ${TOKENS.colors.border}` }}>
                    <div style={{ width:16, height:16, borderRadius:"50%", background:TOKENS.colors.successSoft, border:`1px solid rgba(34,197,94,0.28)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style={{ fontSize:10, color:TOKENS.colors.success, fontWeight:700 }}>Celular actualizado</span>
                  </div>
                )}
                {/* Toast error validación */}
                {phoneError && editingPhone && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 0 6px", borderBottom:`1px solid ${TOKENS.colors.border}` }}>
                    <div style={{ width:16, height:16, borderRadius:"50%", background:TOKENS.colors.errorSoft, border:`1px solid rgba(239,68,68,0.28)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.error} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <span style={{ fontSize:10, color:TOKENS.colors.error, fontWeight:700 }}>{phoneError}</span>
                  </div>
                )}
                {/* Toast error servidor */}
                {saveError && (
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 0 6px", borderBottom:`1px solid ${TOKENS.colors.border}` }}>
                    <span style={{ fontSize:10, color:TOKENS.colors.error, fontWeight:700 }}>⚠️ {saveError}</span>
                  </div>
                )}

                {infoRows.map((row, i) => (
                  <InfoRow
                    key={i}
                    label={row.label}
                    value={row.value}
                    icon={row.icon}
                    editable={row.editable}
                    isEditing={row.editable && editingPhone}
                    editValue={phoneValue}
                    onEdit={handlePhoneEdit}
                    onEditChange={setPhoneValue}
                    onEditSave={handlePhoneSave}
                    onEditCancel={handlePhoneCancel}
                    saving={phoneSaving}
                    isLast={i === infoRows.length - 1}
                    sw={sw}
                  />
                ))}
              </Card>
            </FadeIn>

            <FadeIn delay={220}>
              <button
                onClick={() => setShowLogout(true)}
                style={{ width:"100%", height:48, borderRadius:TOKENS.radius.md, background:TOKENS.colors.errorSoft, border:`1px solid rgba(239,68,68,0.22)`, color:TOKENS.colors.error, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:TOKENS.shadow.soft, transition:`all ${TOKENS.motion.fast}` }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Cerrar sesión
              </button>
            </FadeIn>

            <FadeIn delay={260}>
              <div style={{ textAlign:"center", padding:"2px 0 8px" }}>
                <span style={{ fontSize:9, color:TOKENS.colors.textLow }}>
                  Grupo Frío PWA v1.0 · Odoo 18 · {new Date().getFullYear()}
                </span>
              </div>
            </FadeIn>
          </>
        )}
      </div>

      {/* DIALOGS — fuera del scroll container */}
      {showLogout && <LogoutDialog onConfirm={handleLogoutConfirm} onCancel={() => setShowLogout(false)} sw={sw} />}
      {showEditPhoto && <EditPhotoSheet onClose={() => setShowEditPhoto(false)} sw={sw} />}

      {/* LOGOUT DONE — overlay absoluto correcto */}
      {logoutDone && (
        <div style={{ position:"absolute", inset:0, background:TOKENS.colors.bg0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:30, gap:14 }}>
          <div style={{ fontSize:48 }}>👋</div>
          <div style={{ ...typo.h2, color:TOKENS.colors.text }}>¡Hasta pronto!</div>
          <div style={{ ...typo.caption, color:TOKENS.colors.textMuted }}>Sesión cerrada correctamente</div>
          <button
            onClick={() => { setLogoutDone(false); navigate("/login", { replace: true }); }}
            style={{ marginTop:12, padding:"10px 24px", borderRadius:TOKENS.radius.pill, background:"rgba(43,143,224,0.12)", border:`1px solid ${TOKENS.colors.borderBlue}`, color:TOKENS.colors.blue3, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
          >
            Volver al inicio
          </button>
        </div>
      )}

      <BottomNav sw={sw} />
    </div>
  );
}

/* ============================================================================
   PHONE FRAME
============================================================================ */
function PhoneFrame({ sw, sh, label, note }) {
  const borderR = Math.min(46, sw * 0.12);
  const notchW = Math.min(120, sw * 0.33);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", letterSpacing:"0.06em", textAlign:"center" }}>{label}</div>
      <div style={{ position:"relative", borderRadius:borderR+4, border:"2px solid rgba(103,146,204,0.55)", boxShadow:"0 0 0 1px rgba(173,205,255,0.07), 0 28px 70px rgba(0,0,0,0.7), 0 0 30px rgba(43,143,224,0.12)", overflow:"hidden", background:"#071327", flexShrink:0 }}>
        <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:notchW, height:22, background:"#0a1320", borderRadius:"0 0 14px 14px", zIndex:50 }} />
        <div style={{ position:"absolute", left:-3, top:80, width:3, height:32, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />
        <div style={{ position:"absolute", left:-3, top:120, width:3, height:52, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />
        <div style={{ position:"absolute", right:-3, top:116, width:3, height:62, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />
        <PerfilScreen sw={sw} sh={sh} />
      </div>
      <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", textAlign:"center", lineHeight:1.5 }}>{sw}×{sh}px · {note}</div>
    </div>
  );
}

const DEVICES = [
  { label:"iPhone SE 3",       sw:320, sh:568, note:"pantalla pequeña" },
  { label:"iPhone 14 / 15",    sw:375, sh:812, note:"tamaño base" },
  { label:"iPhone 14 Pro Max", sw:430, sh:932, note:"pantalla grande" },
];

/* ============================================================================
   ROOT
============================================================================ */
export function MultiDevicePerfilPreview() {
  return (
    <div style={{ minHeight:"100vh", background:"radial-gradient(circle at center, #102a57 0%, #07183a 35%, #050d1a 75%, #030811 100%)", padding:"36px 20px 60px", fontFamily:"system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes float      { from{transform:translateY(0)scale(1)} to{transform:translateY(-16px)scale(1.3)} }
        @keyframes shimmerMove { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin       { to{transform:rotate(360deg)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:0 }
        button { font-family:inherit }
        input  { font-family:inherit }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"rgba(97,178,255,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6 }}>
          PWA Trabajadores · Grupo Frío
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"white", letterSpacing:"-0.02em" }}>
          Pantalla 6 — Mi Perfil
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
          Avatar editable · Datos hr.employee · Vacaciones · Celular inline edit · isValidPhone · Logout confirm
        </div>
      </div>

      <div style={{ display:"flex", gap:28, alignItems:"flex-end", justifyContent:"center", flexWrap:"wrap" }}>
        {DEVICES.map((d) => (
          <PhoneFrame key={d.label} sw={d.sw} sh={d.sh} label={d.label} note={d.note} />
        ))}
      </div>
    </div>
  );
}

export default PerfilScreen;
