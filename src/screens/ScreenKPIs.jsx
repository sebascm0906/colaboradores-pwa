import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet as _apiGet } from "../lib/api";

/* ============================================================================
   DESIGN TOKENS (mismo sistema que Pantalla 2)
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
    textMuted: "rgba(255,255,255,0.60)",  /* ↑ 0.52→0.60 legible bajo sol */
    textLow: "rgba(255,255,255,0.55)",    /* ↑ 0.34→0.55 campo/exterior */
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
  motion: { fast: "180ms ease", normal: "280ms ease", spring: "380ms cubic-bezier(0.34,1.56,0.64,1)" },
};

const SHOW_DEV_SWITCHER = true;

/* ============================================================================
   API CONFIG
============================================================================ */
const apiGet = _apiGet;

function getTypo(sw) {
  const sm = sw < 340;
  return {
    display: { fontSize: sm ? 22 : 28, fontWeight: 700, letterSpacing: "-0.04em" },
    h1:      { fontSize: sm ? 20 : 24, fontWeight: 700, letterSpacing: "-0.03em" },
    h2:      { fontSize: sm ? 17 : 20, fontWeight: 700, letterSpacing: "-0.02em" },
    body:    { fontSize: sm ? 12 : 14, fontWeight: 500 },
    caption: { fontSize: sm ? 11 : 12, fontWeight: 500 },
    overline:{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" },
  };
}

/* ============================================================================
   NAV (mismo que Pantalla 2)
============================================================================ */
const NAV_ITEMS = [
  { id:"home",     label:"Inicio",   icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:"kpis",     label:"KPIs",     icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:"encuestas",label:"Encuestas",icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { id:"logros",   label:"Logros",   icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> },
  { id:"perfil",   label:"Yo",       icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

function BottomNav({ active = "kpis", sw }) {
  const navigate = useNavigate();
  const ROUTES = { home: "/", kpis: "/kpis", encuestas: "/surveys", logros: "/badges", badges: "/badges", perfil: "/profile" };
  const navH = sw < 340 ? 58 : 64;
  const itemW = sw < 340 ? 48 : 58;
  return (
    <div style={{ position:"absolute", left:10, right:10, bottom:10, height:navH, borderRadius:20, background:TOKENS.glass.panel, border:`1px solid ${TOKENS.colors.border}`, backdropFilter:"blur(16px)", boxShadow:TOKENS.shadow.md, display:"flex", alignItems:"center", justifyContent:"space-around", zIndex:5 }}>
      {NAV_ITEMS.map(item => {
        const isActive = item.id === active;
        const Icon = item.icon;
        return (
          <button key={item.id} onClick={() => navigate(ROUTES[item.id] || "/")} style={{ width:itemW, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, color:isActive?TOKENS.colors.blue3:"rgba(255,255,255,0.42)", transition:`all ${TOKENS.motion.fast}` }}>
            <div style={{ width:34, height:34, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", background:isActive?"rgba(43,143,224,0.10)":"transparent", border:isActive?"1px solid rgba(97,178,255,0.14)":"1px solid transparent", boxShadow:isActive?"0 0 16px rgba(43,143,224,0.12)":"none" }}>
              <Icon/>
            </div>
            <span style={{ fontSize:9, fontWeight:isActive?700:500 }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   PARTÍCULAS
============================================================================ */
function IceParticles() {
  const p = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    id:i, x:(i*37+11)%100, y:(i*53+7)%100, size:(i%3)+1,
    delay:(i*0.4)%6, duration:((i%4)*1.5)+7, opacity:(i%4)*0.03+0.03,
  })), []);
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {p.map(x => <div key={x.id} style={{ position:"absolute", left:`${x.x}%`, top:`${x.y}%`, width:x.size, height:x.size, borderRadius:"50%", background:"rgba(71,161,255,0.7)", opacity:x.opacity, animation:`float ${x.duration}s ${x.delay}s ease-in-out infinite alternate` }}/>)}
    </div>
  );
}

/* ============================================================================
   FADE IN
============================================================================ */
function FadeIn({ children, delay = 0, y = 12 }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ opacity:v?1:0, transform:v?"translateY(0)":`translateY(${y}px)`, transition:`opacity ${TOKENS.motion.normal}, transform ${TOKENS.motion.normal}` }}>
      {children}
    </div>
  );
}

/* ============================================================================
   PERIOD SELECTOR
============================================================================ */
const PERIODS = [
  { id:"hoy",    label:"Hoy" },
  { id:"semana", label:"Semana" },
  { id:"mes",    label:"Mes" },
];

function PeriodSelector({ value, onChange, sw }) {
  return (
    <div style={{ display:"flex", gap:6, padding:"4px", background:"rgba(255,255,255,0.04)", border:`1px solid ${TOKENS.colors.border}`, borderRadius:TOKENS.radius.pill, alignSelf:"flex-start" }}>
      {PERIODS.map(p => {
        const active = p.id === value;
        return (
          <button key={p.id} onClick={() => onChange(p.id)} style={{ border:"none", cursor:"pointer", padding: sw < 340 ? "10px 12px" : "11px 18px", minHeight:44, /* Touch target ≥44px — estándar Apple HIG */ borderRadius:TOKENS.radius.pill, background:active?"linear-gradient(90deg,#15499B,#2B8FE0)":"transparent", color:active?"white":"rgba(255,255,255,0.60)", fontSize:sw<340?11:12, fontWeight:700, transition:`all ${TOKENS.motion.normal}`, boxShadow:active?TOKENS.shadow.blue:"none", letterSpacing:"0.02em", fontFamily:"inherit" }}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   METABASE EMBED SIMULADO
   En producción: src viene de n8n con JWT firmado
   /webhook/metabase-token?dashboard_id=X&period=hoy&employee_id=123
============================================================================ */

// Skeleton loader mientras carga el iframe
function EmbedSkeleton() {
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", gap:12, padding:"16px" }}>
      {[80, 120, 90, 150].map((h, i) => (
        <div key={i} style={{ height:h, borderRadius:14, background:"linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)", backgroundSize:"200% 100%", animation:`shimmer 1.6s ${i*0.2}s ease-in-out infinite` }}/>
      ))}
    </div>
  );
}

// Dashboard simulado (reemplaza al iframe real en producción)
function MockMetabaseDashboard({ period, sw }) {
  const typo = getTypo(sw);
  const [animVal, setAnimVal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimVal(1), 100);
    return () => clearTimeout(t);
  }, [period]);

  useEffect(() => { setAnimVal(0); }, [period]);

  const data = {
    hoy:    { pct:82, visitas:14, meta:17, cobranza:8200, metaCob:10000, label:"Hoy" },
    semana: { pct:74, visitas:68, meta:85, cobranza:41000, metaCob:52000, label:"Esta semana" },
    mes:    { pct:91, visitas:312, meta:340, cobranza:198000, metaCob:218000, label:"Este mes" },
  }[period];

  const pctColor = data.pct >= 85 ? TOKENS.colors.success : data.pct >= 65 ? TOKENS.colors.warning : TOKENS.colors.error;

  const Bar = ({ label, val, max, color }) => {
    const pct = Math.min(100, Math.round((val/max)*100));
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <span style={{ fontSize:11, color:TOKENS.colors.textMuted }}>{label}</span>
          <span style={{ fontSize:11, fontWeight:700, color:"white" }}>{pct}%</span>
        </div>
        <div style={{ height:7, borderRadius:4, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${animVal * pct}%`, borderRadius:4, background:`linear-gradient(90deg, ${color}88, ${color})`, transition:"width 0.9s cubic-bezier(0.34,1.56,0.64,1)" }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:10, color:TOKENS.colors.textLow }}>{val.toLocaleString()} / {max.toLocaleString()}</span>
          <span style={{ fontSize:10, color, fontWeight:600 }}>{val >= max ? "✓ Meta" : `${max-val} restantes`}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width:"100%", height:"100%", overflowY:"auto", padding:"14px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Gauge principal */}
      <div style={{ textAlign:"center", padding:"16px 0 8px" }}>
        <div style={{ position:"relative", width:120, height:60, margin:"0 auto 12px" }}>
          <svg width="120" height="60" viewBox="0 0 120 60">
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round"/>
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={pctColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${animVal * data.pct * 1.571} 200`}
              style={{ transition:"stroke-dasharray 0.9s cubic-bezier(0.34,1.56,0.64,1)" }}
            />
          </svg>
          <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:pctColor, lineHeight:1 }}>{data.pct}%</div>
          </div>
        </div>
        <div style={{ ...typo.caption, color:TOKENS.colors.textMuted }}>Cumplimiento · {data.label}</div>
      </div>

      <div style={{ height:1, background:"rgba(255,255,255,0.06)" }}/>

      {/* Barras KPI */}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Bar label="Visitas / Pedidos" val={data.visitas} max={data.meta} color={TOKENS.colors.blue3}/>
        <Bar label="Cobranza" val={data.cobranza} max={data.metaCob} color={TOKENS.colors.warning}/>
      </div>

      <div style={{ height:1, background:"rgba(255,255,255,0.06)" }}/>

      {/* Mini stats grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[
          { label:"Clientes nuevos",  value: period==="hoy"?"2": period==="semana"?"8":"31",   accent:TOKENS.colors.success },
          { label:"Devoluciones",     value: period==="hoy"?"1": period==="semana"?"3":"9",    accent:TOKENS.colors.error },
          { label:"Ticket promedio",  value: period==="hoy"?"$586": period==="semana"?"$603":"$635", accent:"white" },
          { label:"Tiempo en ruta",   value: period==="hoy"?"6.2h": period==="semana"?"38h":"154h",  accent:"white" },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:14, padding:"10px 12px", background:"rgba(255,255,255,0.04)", border:`1px solid ${TOKENS.colors.border}` }}>
            <div style={{ fontSize:10, color:TOKENS.colors.textMuted, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:16, fontWeight:700, color:s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Nota Metabase */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:12, background:"rgba(43,143,224,0.06)", border:"1px solid rgba(97,178,255,0.12)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue3} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize:10, color:"rgba(97,178,255,0.7)", lineHeight:1.4 }}>
          Dashboard live en producción via Metabase embed con JWT firmado por n8n
        </span>
      </div>

      <div style={{ height:4 }}/>
    </div>
  );
}

/* ============================================================================
   METABASE FRAME (switcher loading → mock/real)
============================================================================ */
function MetabaseFrame({ period, sw, sh, embedHeight, jobKey, refreshKey = 0 }) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const prevPeriod = useRef(period);

  useEffect(() => {
    if (prevPeriod.current !== period) {
      setLoading(true);
      setHasError(false);
      prevPeriod.current = period;
    }
  }, [period]);

  // Cargar token Metabase real desde W18
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHasError(false);
    const key = jobKey || getSession()?.job_key || "VENDEDOR";
    apiGet(`/pwa-metabase-token?job_key=${key}`)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.embed_url) {
          setEmbedUrl(`${res.embed_url}&period=${period}`);
          setLoading(false);
        } else {
          setHasError(true);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { setHasError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [retryKey, refreshKey, jobKey, period]);

  const handleRetry = () => {
    setLoading(true);
    setHasError(false);
    setRetryKey(k => k + 1);
  };

  return (
    <div style={{ width:"100%", height:embedHeight, borderRadius:20, overflow:"hidden", border:`1px solid ${TOKENS.colors.borderBlue}`, background:"rgba(4,10,24,0.85)", position:"relative", flexShrink:0 }}>
      {/* Header del frame */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:36, background:"rgba(4,10,24,0.96)", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", gap:8, padding:"0 14px", zIndex:2 }}>
        <div style={{ display:"flex", gap:5 }}>
          {["#ef4444","#f59e0b","#22c55e"].map(c => <div key={c} style={{ width:8, height:8, borderRadius:"50%", background:c, opacity:0.6 }}/>)}
        </div>
        <div style={{ flex:1, height:20, borderRadius:6, background:"rgba(255,255,255,0.05)", display:"flex", alignItems:"center", paddingLeft:8 }}>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.25)", letterSpacing:"0.04em" }}>dashboard.grupofrio.mx · Mis KPIs</span>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ position:"absolute", top:36, left:0, right:0, bottom:0 }}>
        {hasError ? (
          /* ── Error state: conductor sin señal ── */
          <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"24px 32px", textAlign:"center" }}>
            <div style={{ width:56, height:56, borderRadius:18, background:"rgba(245,158,11,0.10)", border:"1px solid rgba(245,158,11,0.20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>
              📡
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:TOKENS.colors.textSoft, margin:"0 0 6px" }}>
                No se pudieron cargar los datos
              </p>
              <p style={{ fontSize:12, color:TOKENS.colors.textMuted, margin:0, lineHeight:1.5 }}>
                Revisa tu conexión a internet e intenta de nuevo.
              </p>
            </div>
            <button
              onClick={handleRetry}
              style={{ border:"none", cursor:"pointer", padding:"12px 24px", minHeight:44, /* Touch target ≥44px */ borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:13, fontWeight:700, boxShadow:TOKENS.shadow.blue, fontFamily:"inherit" }}
            >
              ↩ Reintentar conexión
            </button>
          </div>
        ) : loading ? (
          <EmbedSkeleton/>
        ) : embedUrl ? (
          <iframe
            key={retryKey}
            src={embedUrl}
            title="KPI Dashboard"
            style={{ width:"100%", height:"100%", border:"none" }}
            onError={() => setHasError(true)}
          />
        ) : (
          <MockMetabaseDashboard period={period} sw={sw}/>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   KPI SCREEN PRINCIPAL
============================================================================ */
function KPIScreen({ sw = 390, sh = 844 }) {
  const [period, setPeriod] = useState("hoy");
  const [refreshKey, setRefreshKey] = useState(0);
  const session = getSession();
  const jobKey = session.job_key || "VENDEDOR";
  const jobTitle = session.job_title || "Grupo Frío";
  const typo = getTypo(sw);

  const handleRetry = () => setRefreshKey(k => k + 1);

  const navH       = sw < 340 ? 58 : 64;
  const navBot     = 10;
  const scrollBottom = navBot + navH + 6;
  const topPad     = sw < 340 ? 36 : 44;
  const sidePad    = sw < 340 ? 14 : 18;

  // Altura disponible para el embed dentro del scroll
  // header ~80px + period selector ~44px + gaps ~32px = ~156px de UI fija
  const embedHeight = Math.max(320, sh - scrollBottom - topPad - 156);

  return (
    <div style={{ position:"relative", width:sw, height:sh, overflow:"hidden", background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.20) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", fontFamily:"'DM Sans',system-ui,sans-serif", overscrollBehaviorY:"none", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      <IceParticles/>
      <div style={{ position:"absolute", inset:0, opacity:0.032, backgroundImage:"linear-gradient(rgba(43,143,224,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(43,143,224,.45) 1px,transparent 1px)", backgroundSize:"48px 48px" }}/>

      {/* SCROLL */}
      <div style={{ position:"absolute", top:0, left:0, right:0, bottom:scrollBottom, overflowY:"auto", zIndex:2, padding:`${topPad}px ${sidePad}px 20px`, display:"flex", flexDirection:"column", gap:16 }}>

        {/* HEADER */}
        <FadeIn delay={60}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ ...typo.overline, color:"rgba(97,178,255,0.6)", marginBottom:6 }}>MIS KPIS</div>
              <div style={{ ...typo.h1, color:TOKENS.colors.text, lineHeight:1.05 }}>Dashboard</div>
              <div style={{ ...typo.caption, color:"rgba(97,178,255,0.75)", marginTop:4, fontWeight:600 }}>{jobTitle}</div>
            </div>
            {/* Botón refresh */}
            <button style={{ width:38, height:38, borderRadius:12, background:"rgba(255,255,255,0.05)", border:`1px solid ${TOKENS.colors.border}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}
              onClick={handleRetry}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
              </svg>
            </button>
          </div>
        </FadeIn>

        {/* PERIOD SELECTOR */}
        <FadeIn delay={120}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <PeriodSelector value={period} onChange={setPeriod} sw={sw}/>
            {/* Timestamp */}
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:TOKENS.colors.success, boxShadow:"0 0 8px #22c55e" }}/>
              <span style={{ fontSize:9, color:TOKENS.colors.textLow, fontWeight:600 }}>En vivo</span>
            </div>
          </div>
        </FadeIn>

        {/* METABASE EMBED FRAME */}
        <FadeIn delay={200}>
          <MetabaseFrame period={period} sw={sw} sh={sh} embedHeight={embedHeight} jobKey={jobKey} refreshKey={refreshKey}/>
        </FadeIn>

        <div style={{ height:4 }}/>
      </div>

      <BottomNav active="kpis" sw={sw}/>
    </div>
  );
}

/* ============================================================================
   PHONE FRAME
============================================================================ */
function PhoneFrame({ sw, sh, label, note, children }) {
  const borderR = Math.min(46, sw * 0.12);
  const notchW  = Math.min(120, sw * 0.33);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", letterSpacing:"0.06em", textAlign:"center" }}>{label}</div>
      <div style={{ position:"relative", borderRadius:borderR+4, border:"2px solid rgba(103,146,204,0.55)", boxShadow:"0 0 0 1px rgba(173,205,255,0.07), 0 28px 70px rgba(0,0,0,0.7), 0 0 30px rgba(43,143,224,0.12)", overflow:"hidden", background:"#071327", flexShrink:0 }}>
        <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:notchW, height:22, background:"#0a1320", borderRadius:"0 0 14px 14px", zIndex:50 }}/>
        <div style={{ position:"absolute", left:-3, top:80,  width:3, height:32, borderRadius:2, background:"rgba(103,146,204,0.55)" }}/>
        <div style={{ position:"absolute", left:-3, top:120, width:3, height:52, borderRadius:2, background:"rgba(103,146,204,0.55)" }}/>
        <div style={{ position:"absolute", right:-3, top:116, width:3, height:62, borderRadius:2, background:"rgba(103,146,204,0.55)" }}/>
        <KPIScreen sw={sw} sh={sh}/>
      </div>
      <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", textAlign:"center", lineHeight:1.5 }}>{sw}×{sh}px · {note}</div>
    </div>
  );
}

/* ============================================================================
   DEVICES
============================================================================ */
const DEVICES = [
  { label:"iPhone SE 3",         sw:320, sh:568, note:"pantalla pequeña" },
  { label:"iPhone 14 / 15",      sw:375, sh:812, note:"tamaño base" },
  { label:"iPhone 14 Pro Max",   sw:430, sh:932, note:"pantalla grande" },
];

/* ============================================================================
   ROOT
============================================================================ */
export function MultiDeviceKPIPreview() {
  return (
    <div style={{ minHeight:"100vh", background:"radial-gradient(circle at center, #102a57 0%, #07183a 35%, #050d1a 75%, #030811 100%)", padding:"36px 20px 60px", fontFamily:"system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes float { from{transform:translateY(0)scale(1)} to{transform:translateY(-16px)scale(1.3)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:0 }
        button { font-family:inherit }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"rgba(97,178,255,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6 }}>PWA Trabajadores · Grupo Frío</div>
        <div style={{ fontSize:20, fontWeight:700, color:"white", letterSpacing:"-0.02em" }}>Pantalla 3 — Mis KPIs</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
          Embed Metabase · Selector hoy/semana/mes · Nav activa en KPIs
        </div>
      </div>

      <div style={{ display:"flex", gap:28, alignItems:"flex-end", justifyContent:"center", flexWrap:"wrap" }}>
        {DEVICES.map(d => (
          <PhoneFrame key={d.label} sw={d.sw} sh={d.sh} label={d.label} note={d.note}/>
        ))}
      </div>
    </div>
  );
}

export default KPIScreen;
