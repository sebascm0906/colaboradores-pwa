import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
    spring: "380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
};

const SHOW_DEV_SWITCHER = false;

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

const MODULE_TONES = {
  blue:     { bg: "linear-gradient(180deg, rgba(21,73,155,0.24), rgba(21,73,155,0.10))", border: "rgba(97,178,255,0.18)", glow: "rgba(43,143,224,0.16)" },
  blueSoft: { bg: "linear-gradient(180deg, rgba(43,143,224,0.18), rgba(43,143,224,0.07))", border: "rgba(97,178,255,0.16)", glow: "rgba(43,143,224,0.12)" },
  blueDeep: { bg: "linear-gradient(180deg, rgba(10,38,84,0.34), rgba(10,38,84,0.14))", border: "rgba(97,178,255,0.14)", glow: "rgba(21,73,155,0.12)" },
  steel:    { bg: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))", border: "rgba(255,255,255,0.11)", glow: "rgba(255,255,255,0.06)" },
};

/* ============================================================================
   API CONFIG
============================================================================ */
const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_URL;

function getSession() {
  try { return JSON.parse(localStorage.getItem("gf_session") || "{}"); }
  catch { return {}; }
}

async function apiGet(path) {
  const { session_token } = getSession();
  if (!session_token) throw new Error("no_session");
  const res = await fetch(`${N8N_BASE}${path}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${session_token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

/* ============================================================================
   DATA
============================================================================ */
const NAV_ITEMS = [
  { id:"home",      label:"Inicio",    icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:"kpis",      label:"KPIs",      icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:"encuestas", label:"Encuestas", icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { id:"logros",    label:"Logros",    icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> },
  { id:"perfil",    label:"Yo",        icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

const MODULES = [
  { id:"kpis",       label:"Mis KPIs",   tone:"blue",     badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" stroke="rgba(255,255,255,0.35)"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg> },
  { id:"encuestas",  label:"Encuestas",  tone:"blueSoft", badge:2,    icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" stroke="rgba(255,255,255,0.35)"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><path d="M9 17l1.6 1.6L15 14.2" strokeWidth="2"/></svg> },
  { id:"objetivos",  label:"Objetivos",  tone:"steel",    badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.35)"/><circle cx="12" cy="12" r="5" stroke="rgba(255,255,255,0.55)"/><circle cx="12" cy="12" r="1.8" fill="white" stroke="none"/></svg> },
  { id:"datos",      label:"Mis Datos",  tone:"blueDeep", badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" stroke="rgba(255,255,255,0.35)"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M7 15h4"/><path d="M15 15h2" strokeWidth="2"/></svg> },
  { id:"traspasos",  label:"Traspasos",  tone:"blueSoft", badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M21 3l-6 6"/><path d="M8 21H3v-5"/><path d="M3 21l6-6"/></svg> },
  { id:"produccion", label:"Cap. Prod.", tone:"blueDeep", badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18" stroke="rgba(255,255,255,0.35)"/><path d="M7 20V9"/><path d="M12 20V5"/><path d="M17 20v-7"/></svg> },
  { id:"logros",     label:"Premios",    tone:"steel",    badge:null, icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M8 4h8" stroke="rgba(255,255,255,0.35)"/><path d="M17 4v7a5 5 0 0 1-10 0V4" stroke="rgba(255,255,255,0.45)"/></svg> },
  { id:"mensajes",   label:"Mensajes",   tone:"blue",     badge:1,    icon:()=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.7-.84L3 21l1.85-5.47A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z" stroke="rgba(255,255,255,0.45)"/><path d="M9 12h.01" strokeWidth="3"/><path d="M15 12h.01" strokeWidth="3"/></svg> },
];

/* ============================================================================
   SHARED UI
============================================================================ */
function IconGrupoFrio({ size = 28 }) {
  return (
    <img
      src="/icons/icon-grupo-frio.svg"
      alt="Grupo Frío"
      style={{ width: size, height: size, display: "block", objectFit: "contain" }}
    />
  );
}

function IceParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % 100,
        size: (i % 3) + 1,
        delay: (i * 0.4) % 6,
        duration: ((i % 4) * 1.5) + 7,
        opacity: (i % 4) * 0.03 + 0.03,
      })),
    []
  );

  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position:"absolute",
            left:`${p.x}%`,
            top:`${p.y}%`,
            width:p.size,
            height:p.size,
            borderRadius:"50%",
            background:"rgba(71,161,255,0.7)",
            opacity:p.opacity,
            animation:`float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

function FadeIn({ children, delay = 0, y = 14 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity ${TOKENS.motion.normal}, transform ${TOKENS.motion.normal}`,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: TOKENS.glass.panel,
        border: `1px solid ${TOKENS.colors.border}`,
        borderRadius: TOKENS.radius.xl,
        boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function MiniStat({ label, value, accent, typo }) {
  return (
    <div
      style={{
        flex:1,
        minWidth:0,
        borderRadius:TOKENS.radius.md,
        padding:"10px 10px",
        background:TOKENS.glass.panelSoft,
        border:`1px solid ${TOKENS.colors.border}`,
      }}
    >
      <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, marginBottom:3 }}>{label}</div>
      <div style={{ fontSize: typo.h2.fontSize - 2, fontWeight:700, color:accent || TOKENS.colors.text, letterSpacing:"-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function StatusState({ type="loading", title, message, actionLabel, onAction, typo }) {
  const config = {
    loading: { emoji:"🧊", color:TOKENS.colors.blue3, bg:TOKENS.colors.blueGlow },
    empty:   { emoji:"📭", color:TOKENS.colors.textSoft, bg:"rgba(255,255,255,0.05)" },
    error:   { emoji:"⚠️", color:TOKENS.colors.error, bg:TOKENS.colors.errorSoft },
    success: { emoji:"✅", color:TOKENS.colors.success, bg:TOKENS.colors.successSoft },
  }[type];

  return (
    <Card style={{ padding:20, textAlign:"center" }}>
      <div style={{ width:56, height:56, margin:"0 auto 12px", borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center", background:config.bg, border:`1px solid ${config.color}33`, fontSize:24 }}>
        {config.emoji}
      </div>
      <div style={{ ...typo.h2, color:TOKENS.colors.text, marginBottom:6 }}>{title}</div>
      <div style={{ ...typo.body, color:TOKENS.colors.textMuted, lineHeight:1.6 }}>{message}</div>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            marginTop:14,
            border:"none",
            cursor:"pointer",
            padding:"10px 16px",
            borderRadius:TOKENS.radius.md,
            background:"linear-gradient(90deg,#15499B,#2B8FE0)",
            color:"white",
            fontWeight:700,
            boxShadow:TOKENS.shadow.blue,
            fontSize:13,
          }}
        >
          {actionLabel}
        </button>
      )}
    </Card>
  );
}

function AppTile({ mod, delay = 0, tileSize = 62 }) {
  const navigate = useNavigate();
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const tone = MODULE_TONES[mod.tone || "blue"];
  const TILE_ROUTES = { kpis: "/kpis", encuestas: "/surveys", objetivos: null, datos: null, traspasos: null, produccion: null, logros: "/badges", mensajes: null };
  const target = TILE_ROUTES[mod.id];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const radius = Math.round(tileSize * 0.29);

  return (
    <button
      type="button"
      onClick={() => target && navigate(target)}
      onMouseDown={()=>setPressed(true)}
      onMouseUp={()=>setPressed(false)}
      onMouseLeave={()=>setPressed(false)}
      onTouchStart={()=>setPressed(true)}
      onTouchEnd={()=>setPressed(false)}
      style={{
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        gap:7,
        cursor:target?"pointer":"default",
        background:"transparent",
        border:"none",
        padding:0,
        opacity:visible?1:0,
        transform:visible?(pressed?"scale(0.94)":"scale(1)"):"translateY(18px)",
        transition:`transform ${pressed?TOKENS.motion.fast:TOKENS.motion.spring}, opacity ${TOKENS.motion.normal}`,
      }}
    >
      <div style={{ position:"relative" }}>
        <div
          style={{
            width:tileSize,
            height:tileSize,
            borderRadius:radius,
            background:tone.bg,
            border:`1px solid ${tone.border}`,
            boxShadow:pressed?"0 4px 10px rgba(0,0,0,0.18)":`0 8px 20px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            backdropFilter:"blur(10px)",
          }}
        >
          <mod.icon />
        </div>

        {mod.badge ? (
          <div
            style={{
              position:"absolute",
              top:-4,
              right:-4,
              minWidth:17,
              height:17,
              padding:"0 4px",
              borderRadius:999,
              background:TOKENS.colors.error,
              border:"2px solid #07162b",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              fontSize:9,
              fontWeight:700,
              color:"white",
              boxShadow:"0 3px 10px rgba(239,68,68,0.30)",
            }}
          >
            {mod.badge}
          </div>
        ) : null}
      </div>

      <span
        style={{
          fontSize:Math.max(9, tileSize * 0.16),
          fontWeight:600,
          color:TOKENS.colors.textSoft,
          textAlign:"center",
          lineHeight:1.2,
          width:tileSize + 8,
        }}
      >
        {mod.label}
      </span>
    </button>
  );
}

function BottomNav({ sw }) {
  const navigate = useNavigate();
  const ROUTES = { home: "/", kpis: "/kpis", encuestas: "/surveys", logros: "/badges", badges: "/badges", perfil: "/profile" };
  const navH = sw < 340 ? 58 : 64;
  const itemW = sw < 340 ? 48 : 58;

  return (
    <div
      style={{
        position:"absolute",
        left:10,
        right:10,
        bottom:10,
        height:navH,
        borderRadius:20,
        background:TOKENS.glass.panel,
        border:`1px solid ${TOKENS.colors.border}`,
        backdropFilter:"blur(16px)",
        boxShadow:TOKENS.shadow.md,
        display:"flex",
        alignItems:"center",
        justifyContent:"space-around",
        zIndex:5,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === "home";
        const Icon = item.icon;

        return (
          <button onClick={() => navigate(ROUTES[item.id] || "/")}
            key={item.id}
            style={{
              width:itemW,
              display:"flex",
              flexDirection:"column",
              alignItems:"center",
              justifyContent:"center",
              gap:3,
              color:isActive?TOKENS.colors.blue3:"rgba(255,255,255,0.42)",
              transition:`all ${TOKENS.motion.fast}`,
            }}
          >
            <div
              style={{
                width:34,
                height:34,
                borderRadius:10,
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                background:isActive?"rgba(43,143,224,0.10)":"transparent",
                border:isActive?"1px solid rgba(97,178,255,0.14)":"1px solid transparent",
                boxShadow:isActive?"0 0 16px rgba(43,143,224,0.12)":"none",
              }}
            >
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
   HOME SCREEN
============================================================================ */
function HomeScreenPremium({ sw = 390, sh = 844 }) {
  const [dataState, setDataState] = useState("loading");
  const [employee, setEmployee] = useState(null);
  const [homeSummary, setHomeSummary] = useState(null);
  const typo = getTypo(sw);

  const navH = sw < 340 ? 58 : 64;
  const navBot = 10;
  const scrollBottom = navBot + navH + (sw >= 390 ? 12 : 6);
  const tileSize = Math.round(Math.max(48, sw * 0.158));
  const padding = sw < 340 ? "36px 14px 24px" : "44px 18px 24px";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  // Cargar datos reales desde W16
  useEffect(() => {
    let cancelled = false;
    setDataState("loading");
    apiGet("/pwa-home-summary")
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          const d = res.data;
          setEmployee({
            firstName: (d.employee?.name || "").split(" ")[0],
            jobTitle: d.employee?.job_title || "",
            company: d.employee?.company || "Grupo Frío",
            initials: (d.employee?.name || "?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(),
            image_128: d.employee?.image_128 || null,
          });
          setHomeSummary(d);
          setDataState("ready");
        } else {
          setDataState("empty");
        }
      })
      .catch(() => { if (!cancelled) setDataState("error"); });
    return () => { cancelled = true; };
  }, []);

  const avatarSize = sw < 340 ? 42 : 50;

  const renderState = () => {
    if (dataState === "loading") {
      return <StatusState type="loading" title="Cargando..." message="Preparando tus indicadores del día." typo={typo} />;
    }
    if (dataState === "empty") {
      return <StatusState type="empty" title="Sin datos" message="Todavía no tienes actividad hoy." actionLabel="Actualizar" onAction={()=>{ setDataState("loading"); apiGet("/pwa-home-summary").then(r=>{ if(r.success&&r.data){setEmployee({firstName:(r.data.employee?.name||"").split(" ")[0],jobTitle:r.data.employee?.job_title||"",company:r.data.employee?.company||"Grupo Frío",initials:(r.data.employee?.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(),image_128:r.data.employee?.image_128||null});setHomeSummary(r.data);setDataState("ready");}else{setDataState("empty");}}).catch(()=>setDataState("error")); }} typo={typo} />;
    }
    if (dataState === "error") {
      return <StatusState type="error" title="Error al cargar" message="Hubo un problema al consultar." actionLabel="Reintentar" onAction={()=>{ setDataState("loading"); apiGet("/pwa-home-summary").then(r=>{ if(r.success&&r.data){setEmployee({firstName:(r.data.employee?.name||"").split(" ")[0],jobTitle:r.data.employee?.job_title||"",company:r.data.employee?.company||"Grupo Frío",initials:(r.data.employee?.name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(),image_128:r.data.employee?.image_128||null});setHomeSummary(r.data);setDataState("ready");}else{setDataState("empty");}}).catch(()=>setDataState("error")); }} typo={typo} />;
    }

    return (
      <>
        <FadeIn delay={180}>
          <Card
            style={{
              padding: sw < 340 ? 14 : 18,
              border:`1px solid ${TOKENS.colors.borderBlue}`,
              background: TOKENS.glass.hero,
              boxShadow: `${TOKENS.shadow.lg}, ${TOKENS.shadow.inset}, ${TOKENS.shadow.blue}`,
            }}
          >
            <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, marginBottom:6 }}>Bienvenido de vuelta</div>
            <div style={{ ...typo.display, color:TOKENS.colors.text, lineHeight:1.05 }}>{homeSummary?.employee?.job_title || "Grupo Frío"}</div>
            <div style={{ ...typo.body, color:TOKENS.colors.blue3, marginTop:6, fontWeight:600 }}>{homeSummary?.employee?.company || ""}</div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <MiniStat label="Canal" value={homeSummary?.canal_pwa || "—"} typo={typo} />
              <MiniStat label="Empresa" value={homeSummary?.employee?.company?.split(" ")[0] || "—"} typo={typo} />
              <MiniStat label="App" value="v1.0" accent={TOKENS.colors.blue3} typo={typo} />
            </div>
          </Card>
        </FadeIn>

        <FadeIn delay={220}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:2 }}>
            <div style={{ flex:1, height:1, background:"linear-gradient(90deg, rgba(87,175,255,0.26), transparent)" }} />
            <span style={{ ...typo.overline, color:"rgba(97,178,255,0.72)" }}>MÓDULOS</span>
            <div style={{ flex:1, height:1, background:"linear-gradient(90deg, transparent, rgba(87,175,255,0.26))" }} />
          </div>
        </FadeIn>

        <FadeIn delay={260}>
          <div
            style={{
              display:"grid",
              gridTemplateColumns:"repeat(4, minmax(0, 1fr))",
              rowGap: sw < 340 ? 14 : 20,
              columnGap: 4,
              justifyItems:"center",
              paddingBottom:14,
            }}
          >
            {MODULES.map((mod, idx) => (
              <AppTile key={mod.id} mod={mod} delay={140 + idx * 35} tileSize={tileSize} />
            ))}
          </div>
        </FadeIn>
      </>
    );
  };

  return (
    <div
      style={{
        position:"relative",
        width:sw,
        height:sh,
        overflow:"hidden",
        background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.22) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)",
        fontFamily:"'DM Sans', system-ui, sans-serif",
        overscrollBehaviorY:"none",
        paddingTop:"env(safe-area-inset-top)",
        paddingBottom:"env(safe-area-inset-bottom)",
      }}
    >
      <IceParticles />

      <div
        style={{
          position:"absolute",
          inset:0,
          opacity:0.032,
          backgroundImage:"linear-gradient(rgba(43,143,224,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(43,143,224,.45) 1px,transparent 1px)",
          backgroundSize:"48px 48px",
        }}
      />

      <div
        style={{
          position:"absolute",
          top:0,
          left:0,
          right:0,
          bottom:scrollBottom,
          overflowY:"auto",
          zIndex:2,
          padding,
          display:"flex",
          flexDirection:"column",
          gap:sw < 340 ? 14 : 18,
        }}
      >
        {/* HEADER */}
        <FadeIn delay={60}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
            <div>
              <div style={{ ...typo.caption, color:"rgba(255,255,255,0.45)", marginBottom:4 }}>{greeting}</div>
              <div style={{ ...typo.h1, color:TOKENS.colors.text, lineHeight:1.05 }}>{employee?.firstName || getSession()?.name?.split(" ")[0] || "Hola"}</div>
              <div style={{ ...typo.body, color:"rgba(97,178,255,0.82)", marginTop:4 }}>{employee?.jobTitle || "Grupo Frío"}</div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div
                style={{
                  background:"rgba(255,255,255,0.05)",
                  border:"1px solid rgba(97,178,255,0.16)",
                  borderRadius:999,
                  padding:"5px 10px",
                  display:"flex",
                  alignItems:"center",
                  gap:5,
                  boxShadow:TOKENS.shadow.soft,
                }}
              >
                <span style={{ fontSize:11 }}>⭐</span>
                <span style={{ fontSize:11, fontWeight:700, color:"white" }}>{(getSession()?.points || 0).toLocaleString()}</span>
              </div>

              <div
                style={{
                  width:avatarSize,
                  height:avatarSize,
                  borderRadius:"50%",
                  background:"linear-gradient(135deg,#15499B,#2B8FE0)",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  color:"white",
                  fontWeight:700,
                  fontSize:avatarSize * 0.34,
                  border:"2px solid rgba(255,255,255,0.16)",
                  boxShadow:"0 6px 16px rgba(21,73,155,0.34)",
                }}
              >
                {employee?.initials || "GF"}
              </div>
            </div>
          </div>
        </FadeIn>

        {/* CHIP EMPRESA */}
        <FadeIn delay={120}>
          <Card style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:TOKENS.radius.md }}>
            <div
              style={{
                width:34,
                height:34,
                borderRadius:10,
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                background:"linear-gradient(180deg, rgba(21,73,155,0.18), rgba(21,73,155,0.06))",
                border:"1px solid rgba(97,178,255,0.16)",
                flexShrink:0,
              }}
            >
              <IconGrupoFrio size={22} />
            </div>

            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ ...typo.body, fontWeight:700, color:TOKENS.colors.text }}>Grupo Frío</div>
              <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {employee?.company || homeSummary?.canal_pwa || "Grupo Frío"}
              </div>
            </div>

            <div
              style={{
                flexShrink:0,
                display:"flex",
                alignItems:"center",
                gap:5,
                background:TOKENS.colors.successSoft,
                border:"1px solid rgba(34,197,94,0.22)",
                borderRadius:999,
                padding:"5px 8px",
              }}
            >
              <div style={{ width:7, height:7, borderRadius:"50%", background:TOKENS.colors.success, boxShadow:"0 0 8px #22c55e" }} />
              <span style={{ fontSize:10, color:"#4ade80", fontWeight:700 }}>Activo</span>
            </div>
          </Card>
        </FadeIn>

        {/* DEMO SWITCHER */}
        {SHOW_DEV_SWITCHER ? (
          <FadeIn delay={150}>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {["ready","loading","empty","error"].map((s) => (
                <button
                  key={s}
                  onClick={() => setDataState(s)}
                  style={{
                    border:"none",
                    cursor:"pointer",
                    padding:"6px 10px",
                    borderRadius:999,
                    background:dataState===s?"rgba(43,143,224,0.14)":"rgba(255,255,255,0.04)",
                    color:dataState===s?TOKENS.colors.blue3:TOKENS.colors.textMuted,
                    fontSize:9,
                    fontWeight:700,
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </FadeIn>
        ) : null}

        {renderState()}
      </div>

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
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", letterSpacing:"0.06em", textAlign:"center" }}>
        {label}
      </div>

      <div
        style={{
          position:"relative",
          borderRadius:borderR + 4,
          border:"2px solid rgba(103,146,204,0.55)",
          boxShadow:"0 0 0 1px rgba(173,205,255,0.07), 0 28px 70px rgba(0,0,0,0.7), 0 0 30px rgba(43,143,224,0.12)",
          overflow:"hidden",
          background:"#071327",
          flexShrink:0,
        }}
      >
        <div
          style={{
            position:"absolute",
            top:0,
            left:"50%",
            transform:"translateX(-50%)",
            width:notchW,
            height:22,
            background:"#0a1320",
            borderRadius:"0 0 14px 14px",
            zIndex:50,
          }}
        />
        <div style={{ position:"absolute", left:-3, top:80, width:3, height:32, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />
        <div style={{ position:"absolute", left:-3, top:120, width:3, height:52, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />
        <div style={{ position:"absolute", right:-3, top:116, width:3, height:62, borderRadius:2, background:"rgba(103,146,204,0.55)" }} />

        <HomeScreenPremium sw={sw} sh={sh} />
      </div>

      <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", textAlign:"center", lineHeight:1.5 }}>
        {sw}×{sh}px{note ? `\n${note}` : ""}
      </div>
    </div>
  );
}

/* ============================================================================
   DEVICES
============================================================================ */
const DEVICES = [
  { label:"iPhone SE 3ª gen",  sw:320, sh:568, note:"pantalla pequeña" },
  { label:"iPhone 14 / 15",    sw:375, sh:812, note:"tamaño base" },
  { label:"iPhone 14 Pro Max", sw:430, sh:932, note:"pantalla grande" },
];

/* ============================================================================
   ROOT PREVIEW
============================================================================ */
export function MultiDevicePreview() {
  return (
    <div
      style={{
        minHeight:"100vh",
        background:"radial-gradient(circle at center, #102a57 0%, #07183a 35%, #050d1a 75%, #030811 100%)",
        padding:"36px 20px 60px",
        fontFamily:"system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes float { from{transform:translateY(0)scale(1)} to{transform:translateY(-16px)scale(1.3)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:0 }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"rgba(97,178,255,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6 }}>
          PWA Trabajadores · Grupo Frío
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"white", letterSpacing:"-0.02em" }}>
          Pantalla 2 — Home Dashboard
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
          Nav clearance fijo · Tipografía responsive · Tiles adaptativos por ancho
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

export default HomeScreenPremium;
