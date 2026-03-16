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
   LEVELS
============================================================================ */
const LEVELS = [
  { id: "bronze", label: "Bronce",  min: 0,   max: 299,  color: "#cd7f32", glow: "rgba(205,127,50,0.25)", bg: "rgba(205,127,50,0.10)", border: "rgba(205,127,50,0.28)", emoji: "🥉" },
  { id: "silver", label: "Plata",   min: 300, max: 699,  color: "#b8c4cc", glow: "rgba(184,196,204,0.25)", bg: "rgba(184,196,204,0.10)", border: "rgba(184,196,204,0.28)", emoji: "🥈" },
  { id: "gold",   label: "Oro",     min: 700, max: 1299, color: "#f59e0b", glow: "rgba(245,158,11,0.30)", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", emoji: "🥇" },
  { id: "plat",   label: "Platino", min: 1300,max: 9999, color: "#61b2ff", glow: "rgba(97,178,255,0.30)", bg: "rgba(97,178,255,0.10)", border: "rgba(97,178,255,0.30)", emoji: "💎" },
];

function getLevelForPoints(pts) {
  return LEVELS.find((l) => pts >= l.min && pts <= l.max) ?? LEVELS[0];
}

function getNextLevel(pts) {
  const idx = LEVELS.findIndex((l) => pts >= l.min && pts <= l.max);
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

/* ============================================================================
   API CONFIG
============================================================================ */
const N8N_BASE = "/api-n8n";
function getSession() {
  try { return JSON.parse(localStorage.getItem("gf_session") || "{}"); } catch { return {}; }
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

// Mapa de íconos por categoría inferida del nombre del badge
function getBadgeIcon(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("nuevo") || n.includes("bienvenid")) return "👋";
  if (n.includes("encuesta") || n.includes("survey")) return "📋";
  if (n.includes("racha") || n.includes("streak")) return "🔥";
  if (n.includes("meta") || n.includes("objetivo")) return "🎯";
  if (n.includes("colaborador") || n.includes("mes")) return "⭐";
  if (n.includes("produc")) return "🧊";
  if (n.includes("ventas") || n.includes("venta")) return "📈";
  if (n.includes("equipo") || n.includes("team")) return "🤝";
  return "🏅";
}

function mapOdooBadge(b) {
  return {
    id: b.id,
    badge_id: [b.badge_id, b.badge_name],
    badge_name: b.badge_name || "Logro",
    create_date: b.create_date || new Date().toISOString().split("T")[0],
    comment: b.comment || "Logro obtenido en Grupo Frío",
    x_points: b.x_points || 0,
    icon: getBadgeIcon(b.badge_name),
    category: "general",
    isNew: b.isNew || false,
  };
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
  const ROUTES = { home: "/", kpis: "/kpis", encuestas: "/surveys", logros: "/badges", badges: "/badges", perfil: "/profile" };
  const navH = sw < 340 ? 58 : 64;
  const itemW = sw < 340 ? 48 : 58;

  return (
    <div style={{ position:"absolute", left:10, right:10, bottom:10, height:navH, borderRadius:20, background:TOKENS.glass.panel, border:`1px solid ${TOKENS.colors.border}`, backdropFilter:"blur(16px)", boxShadow:TOKENS.shadow.md, display:"flex", alignItems:"center", justifyContent:"space-around", zIndex:5 }}>
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === "logros";
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
      id:i,
      x:(i*37+11)%100,
      y:(i*53+7)%100,
      size:(i%3)+1,
      delay:(i*0.4)%6,
      duration:((i%4)*1.5)+7,
      opacity:(i%4)*0.03+0.03,
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
   HERO
============================================================================ */
function HeroPoints({ points, sw, delay = 80 }) {
  const typo = getTypo(sw);
  const level = getLevelForPoints(points);
  const nextLvl = getNextLevel(points);
  const ptsInLevel = points - level.min;
  const ptsRange = (nextLvl?.min ?? level.max + 1) - level.min;
  const pct = Math.min(100, (ptsInLevel / ptsRange) * 100);
  const [animateBar, setAnimateBar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimateBar(true), 160);
    return () => clearTimeout(t);
  }, []);

  return (
    <FadeIn delay={delay}>
      <Card
        style={{
          padding: sw < 340 ? 16 : 20,
          background: TOKENS.glass.hero,
          border: `1px solid ${TOKENS.colors.borderBlue}`,
          boxShadow: `${TOKENS.shadow.lg}, ${TOKENS.shadow.inset}, ${TOKENS.shadow.blue}`,
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, background:level.bg, border:`1px solid ${level.border}`, borderRadius:999, padding:"5px 10px", boxShadow:`0 0 14px ${level.glow}` }}>
            <span style={{ fontSize:14 }}>{level.emoji}</span>
            <div>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:"0.14em", color:level.color, opacity:0.7, lineHeight:1 }}>NIVEL</div>
              <div style={{ fontSize:11, fontWeight:800, color:level.color, lineHeight:1.2 }}>{level.label}</div>
            </div>
          </div>

          <div style={{ textAlign:"right" }}>
            <div style={{ ...typo.overline, color:"rgba(97,178,255,0.6)", marginBottom:2 }}>PUNTOS TOTALES</div>
            <div style={{ fontSize: sw < 340 ? 30 : 36, fontWeight:800, color:TOKENS.colors.text, letterSpacing:"-0.05em", lineHeight:1 }}>
              {points.toLocaleString()}
            </div>
          </div>
        </div>

        {nextLvl ? (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:9, color:TOKENS.colors.textLow, fontWeight:600 }}>Progreso a {nextLvl.label}</span>
              <span style={{ fontSize:9, color:level.color, fontWeight:700 }}>{points} / {nextLvl.min} pts</span>
            </div>

            <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.06)", overflow:"hidden" }}>
              <div
                style={{
                  height:"100%",
                  borderRadius:3,
                  width: animateBar ? `${pct}%` : "0%",
                  background:`linear-gradient(90deg, ${level.color}, ${nextLvl.color})`,
                  transition:"width 1s ease 0.2s",
                  boxShadow:`0 0 8px ${level.glow}`,
                }}
              />
            </div>

            <div style={{ marginTop:5, fontSize:9, color:TOKENS.colors.textLow, textAlign:"right" }}>
              Faltan {nextLvl.min - points} pts para {nextLvl.emoji} {nextLvl.label}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"6px 0" }}>
            <span style={{ fontSize:11, color:level.color, fontWeight:700 }}>💎 Nivel máximo alcanzado</span>
          </div>
        )}
      </Card>
    </FadeIn>
  );
}

/* ============================================================================
   BADGE SHEET
============================================================================ */
function BadgeSheet({ badge, onClose, sw }) {
  const [visible, setVisible] = useState(false);
  const typo = getTypo(sw);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  const formattedDate = new Date(badge.create_date).toLocaleDateString("es-MX", {
    day:"numeric",
    month:"long",
    year:"numeric",
  });

  return (
    <div
      onClick={handleClose}
      style={{
        position:"absolute",
        inset:0,
        zIndex:20,
        background:`rgba(3,8,17,${visible ? 0.72 : 0})`,
        transition:"background 220ms ease",
        display:"flex",
        flexDirection:"column",
        justifyContent:"flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:"linear-gradient(180deg, #07162b, #04101f)",
          borderRadius:"24px 24px 0 0",
          border:`1px solid ${TOKENS.colors.borderBlue}`,
          borderBottom:"none",
          padding:`22px ${sw < 340 ? 16 : 22}px 36px`,
          boxShadow:`0 -20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(43,143,224,0.10)`,
          transform:visible ? "translateY(0)" : "translateY(100%)",
          transition:`transform 280ms cubic-bezier(0.34,1.56,0.64,1)`,
        }}
      >
        <div style={{ width:36, height:4, borderRadius:2, background:"rgba(255,255,255,0.14)", margin:"0 auto 20px" }} />

        <div style={{ textAlign:"center", marginBottom:18 }}>
          <div style={{ fontSize:58, lineHeight:1, marginBottom:10 }}>{badge.icon}</div>
          <div style={{ ...typo.h2, color:TOKENS.colors.text, marginBottom:4 }}>{badge.badge_name}</div>
          <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, lineHeight:1.55 }}>{badge.comment}</div>
        </div>

        <Card style={{ padding:"12px 16px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ textAlign:"center", flex:1 }}>
              <div style={{ ...typo.overline, color:"rgba(97,178,255,0.55)", marginBottom:4 }}>PUNTOS</div>
              <div style={{ fontSize:22, fontWeight:800, color:TOKENS.colors.blue3, letterSpacing:"-0.03em" }}>+{badge.x_points}</div>
            </div>
            <div style={{ width:1, height:36, background:TOKENS.colors.border }} />
            <div style={{ textAlign:"center", flex:1 }}>
              <div style={{ ...typo.overline, color:"rgba(97,178,255,0.55)", marginBottom:4 }}>OBTENIDO</div>
              <div style={{ fontSize:11, fontWeight:700, color:TOKENS.colors.textSoft }}>{formattedDate}</div>
            </div>
          </div>
        </Card>

        <button
          onClick={handleClose}
          style={{ width:"100%", height:46, borderRadius:TOKENS.radius.md, background:"rgba(255,255,255,0.06)", border:`1px solid ${TOKENS.colors.border}`, color:TOKENS.colors.textMuted, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   BADGE TILES
============================================================================ */
function BadgeTile({ badge, sw, delay, onPress }) {
  const [pressed, setPressed] = useState(false);
  const [shimmer, setShimmer] = useState(badge.isNew);

  useEffect(() => {
    if (!badge.isNew) return;
    const t = setTimeout(() => setShimmer(false), 2600);
    return () => clearTimeout(t);
  }, [badge.isNew]);

  const tileSize = sw < 340 ? 90 : sw < 390 ? 100 : 108;

  return (
    <FadeIn delay={delay} y={16}>
      <div
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onClick={() => onPress(badge)}
        style={{
          width:tileSize,
          cursor:"pointer",
          transform:pressed?"scale(0.94)":"scale(1)",
          transition:`transform ${TOKENS.motion.spring}`,
        }}
      >
        <div
          style={{
            width:tileSize,
            height:tileSize,
            borderRadius:TOKENS.radius.lg,
            background: shimmer
              ? "linear-gradient(135deg, rgba(245,158,11,0.20), rgba(97,178,255,0.12))"
              : TOKENS.glass.hero,
            border: shimmer
              ? "1px solid rgba(245,158,11,0.40)"
              : `1px solid ${TOKENS.colors.borderBlue}`,
            display:"flex",
            flexDirection:"column",
            alignItems:"center",
            justifyContent:"center",
            gap:6,
            position:"relative",
            overflow:"hidden",
            boxShadow: shimmer
              ? `${TOKENS.shadow.md}, 0 0 24px rgba(245,158,11,0.22)`
              : `${TOKENS.shadow.soft}, ${TOKENS.shadow.inset}`,
            transition:`all ${TOKENS.motion.normal}`,
          }}
        >
          {shimmer && (
            <div
              style={{
                position:"absolute",
                inset:0,
                background:"linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.14) 50%, transparent 70%)",
                animation:"shimmerSweep 1.8s ease 0.3s 2",
                borderRadius:"inherit",
              }}
            />
          )}

          <span style={{ fontSize: tileSize < 100 ? 28 : 32, lineHeight:1 }}>{badge.icon}</span>

          {badge.isNew && (
            <div style={{ position:"absolute", top:6, right:6, background:"rgba(245,158,11,0.85)", borderRadius:999, padding:"2px 5px" }}>
              <span style={{ fontSize:7, fontWeight:800, color:"#030811", letterSpacing:"0.08em" }}>NUEVO</span>
            </div>
          )}

          <div style={{ fontSize: tileSize < 100 ? 8 : 9, fontWeight:700, color:TOKENS.colors.textMuted, textAlign:"center", paddingInline:5, lineHeight:1.2 }}>
            {badge.badge_name}
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:5 }}>
          <span style={{ fontSize:9, color:"rgba(97,178,255,0.70)", fontWeight:700 }}>+{badge.x_points} pts</span>
        </div>
      </div>
    </FadeIn>
  );
}

function LockedBadgeTile({ badge, sw }) {
  const tileSize = sw < 340 ? 90 : sw < 390 ? 100 : 108;

  return (
    <div style={{ width:tileSize, opacity:0.52 }}>
      <div style={{ width:tileSize, height:tileSize, borderRadius:TOKENS.radius.lg, background:"rgba(255,255,255,0.02)", border:`1px solid ${TOKENS.colors.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, position:"relative" }}>
        <span style={{ fontSize: tileSize < 100 ? 28 : 32, lineHeight:1, filter:"grayscale(100%) opacity(0.4)" }}>{badge.icon}</span>
        <div style={{ position:"absolute", bottom:7, right:7 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: tileSize < 100 ? 8 : 9, fontWeight:700, color:"rgba(255,255,255,0.35)", textAlign:"center", paddingInline:5, lineHeight:1.2 }}>
          {badge.badge_name}
        </div>
      </div>
      <div style={{ textAlign:"center", marginTop:5 }}>
        <span style={{ fontSize:8, color:"rgba(255,255,255,0.28)" }}>{badge.hint}</span>
      </div>
    </div>
  );
}

/* ============================================================================
   STATS ROW
============================================================================ */
function StatsRow({ badges, sw, delay }) {
  const typo = getTypo(sw);
  const totalPoints = badges.reduce((s, b) => s + b.x_points, 0);
  const totalBadges = badges.length;
  const newestDate = badges[0]?.create_date
    ? new Date(badges[0].create_date).toLocaleDateString("es-MX", { day:"numeric", month:"short" })
    : "—";

  const stats = [
    { label:"Insignias", value: totalBadges, isDate:false },
    { label:"Último",    value: newestDate,  isDate:true  },
    { label:"Puntos",    value: totalPoints, isDate:false },
  ];

  return (
    <FadeIn delay={delay}>
      <Card style={{ padding:"12px 14px", display:"flex", gap:0 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ flex:1, textAlign:"center", borderRight: i < stats.length - 1 ? `1px solid ${TOKENS.colors.border}` : "none" }}>
            <div style={{ fontSize: s.isDate ? 12 : 18, fontWeight:800, color:TOKENS.colors.text, letterSpacing: s.isDate ? 0 : "-0.04em", lineHeight:1.1 }}>
              {s.isDate ? s.value : s.value.toLocaleString()}
            </div>
            <div style={{ ...typo.overline, color:TOKENS.colors.textLow, marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </Card>
    </FadeIn>
  );
}

/* ============================================================================
   MAIN SCREEN
============================================================================ */
function BadgesScreen({ sw = 390, sh = 844 }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [badgesData, setBadgesData] = useState([]);
  const [lockedBadges, setLockedBadges] = useState([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const typo = getTypo(sw);

  const navH = sw < 340 ? 58 : 64;
  const navBot = 10;
  const scrollBottom = navBot + navH + 10;
  const topPad = sw < 340 ? 36 : 44;
  const sidePad = sw < 340 ? 14 : 18;

  // Cargar badges reales desde W16
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    apiGet("/pwa-badges")
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          const earned = (res.data.earned || []).map(mapOdooBadge);
          const locked = (res.data.locked || []).map(b => ({
            id: b.id,
            badge_name: b.badge_name || "Logro bloqueado",
            icon: getBadgeIcon(b.badge_name),
            x_points: b.x_points || 0,
            hint: b.hint || "Sigue acumulando puntos",
          }));
          setBadgesData(earned);
          setLockedBadges(locked);
          setTotalPoints(res.data.total_points || earned.reduce((s, b) => s + b.x_points, 0));
          setLoadState(earned.length > 0 ? "ready" : "empty");
        } else {
          setLoadState("empty");
        }
      })
      .catch(() => { if (!cancelled) setLoadState("error"); });
    return () => { cancelled = true; };
  }, []);

  const sortedBadges = useMemo(
    () =>
      [...badgesData].sort((a, b) => {
        if (a.isNew && !b.isNew) return -1;
        if (!a.isNew && b.isNew) return 1;
        return new Date(b.create_date) - new Date(a.create_date);
      }),
    [badgesData]
  );

  const tileSz = sw < 340 ? 90 : sw < 390 ? 100 : 108;
  const gapSz = 10;
  const availW = sw - sidePad * 2;
  const cols = Math.max(1, Math.floor((availW + gapSz) / (tileSz + gapSz)));

  return (
    <div style={{ position:"relative", width:sw, height:sh, overflow:"hidden", background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.20) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", fontFamily:"'DM Sans',system-ui,sans-serif", overscrollBehaviorY:"none", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      <IceParticles />

      <div style={{ position:"absolute", inset:0, opacity:0.032, backgroundImage:"linear-gradient(rgba(43,143,224,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(43,143,224,.45) 1px,transparent 1px)", backgroundSize:"48px 48px" }} />

      <div style={{ position:"absolute", top:0, left:0, right:0, bottom:scrollBottom, overflowY:"auto", zIndex:2, padding:`${topPad}px ${sidePad}px 20px`, display:"flex", flexDirection:"column", gap:16 }}>
        <FadeIn delay={40}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
            <div>
              <div style={{ ...typo.overline, color:"rgba(97,178,255,0.6)", marginBottom:6 }}>MIS LOGROS</div>
              <div style={{ ...typo.h1, color:TOKENS.colors.text, lineHeight:1.05 }}>Reconocimientos</div>
              <div style={{ ...typo.caption, color:"rgba(97,178,255,0.75)", marginTop:4, fontWeight:600 }}>
                {loadState === "loading" ? "Cargando..." : loadState === "error" ? "Error al cargar" : `${sortedBadges.length} insignias · ${totalPoints} pts acumulados`}
              </div>
            </div>

            <div style={{ width:40, height:40, borderRadius:13, background:"rgba(245,158,11,0.10)", border:"1px solid rgba(245,158,11,0.22)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:20 }}>
              🏆
            </div>
          </div>
        </FadeIn>

        <HeroPoints points={totalPoints} sw={sw} delay={80} />
        <StatsRow badges={sortedBadges} sw={sw} delay={140} />

        <FadeIn delay={180}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:1, background:"linear-gradient(90deg, rgba(87,175,255,0.26), transparent)" }} />
            <span style={{ ...typo.overline, color:"rgba(97,178,255,0.72)" }}>OBTENIDAS</span>
            <div style={{ flex:1, height:1, background:"linear-gradient(90deg, transparent, rgba(87,175,255,0.26))" }} />
          </div>
        </FadeIn>

        {loadState === "loading" && (
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols}, ${tileSz}px)`, gap:gapSz, justifyContent:"start" }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width:tileSz, height:tileSz + 30, borderRadius:16, background:"rgba(255,255,255,0.04)", border:`1px solid ${TOKENS.colors.border}`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)", animation:"shimmerMove 1.6s infinite" }}/>
              </div>
            ))}
          </div>
        )}

        {loadState === "error" && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"32px 0", textAlign:"center" }}>
            <div style={{ fontSize:28 }}>📡</div>
            <div style={{ ...typo.body, color:TOKENS.colors.textMuted }}>Error al cargar logros</div>
            <button onClick={()=>{ setLoadState("loading"); apiGet("/pwa-badges").then(r=>{if(r.success&&r.data){const e=(r.data.earned||[]).map(mapOdooBadge);setBadgesData(e);setLockedBadges((r.data.locked||[]).map(b=>({id:b.id,badge_name:b.badge_name||"Logro",icon:getBadgeIcon(b.badge_name),x_points:b.x_points||0,hint:b.hint||""})));setTotalPoints(r.data.total_points||0);setLoadState(e.length>0?"ready":"empty");}else{setLoadState("empty");}}).catch(()=>setLoadState("error")); }} style={{ border:"none", cursor:"pointer", padding:"10px 22px", minHeight:44, borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:13, fontWeight:700, fontFamily:"inherit" }}>Reintentar</button>
          </div>
        )}

        {loadState === "empty" && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"32px 0", textAlign:"center" }}>
            <div style={{ fontSize:28 }}>🎖️</div>
            <div style={{ ...typo.body, color:TOKENS.colors.textMuted }}>Aún no tienes insignias</div>
            <div style={{ ...typo.caption, color:TOKENS.colors.textLow }}>Completa encuestas y metas para ganar logros</div>
          </div>
        )}

        {loadState === "ready" && (
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols}, ${tileSz}px)`, gap:gapSz, justifyContent:"start" }}>
            {sortedBadges.map((badge, i) => (
              <BadgeTile key={badge.id} badge={badge} sw={sw} delay={220 + i * 60} onPress={setSelectedBadge} />
            ))}
          </div>
        )}

        {loadState === "ready" && lockedBadges.length > 0 && (
          <>
            <FadeIn delay={520}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ flex:1, height:1, background:"linear-gradient(90deg, rgba(87,175,255,0.12), transparent)" }} />
                <span style={{ ...typo.overline, color:"rgba(255,255,255,0.28)" }}>POR DESBLOQUEAR</span>
                <div style={{ flex:1, height:1, background:"linear-gradient(90deg, transparent, rgba(87,175,255,0.12))" }} />
              </div>
            </FadeIn>

            <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols}, ${tileSz}px)`, gap:gapSz, justifyContent:"start" }}>
              {lockedBadges.map((badge) => (
                <LockedBadgeTile key={badge.id} badge={badge} sw={sw} />
              ))}
            </div>
          </>
        )}

        <FadeIn delay={600}>
          <div style={{ textAlign:"center", padding:"2px 0 8px" }}>
            <span style={{ fontSize:9, color:TOKENS.colors.textLow }}>
              Puntos sincronizados con Odoo · Activos en sistema de gamificación
            </span>
          </div>
        </FadeIn>
      </div>

      {selectedBadge && <BadgeSheet badge={selectedBadge} onClose={() => setSelectedBadge(null)} sw={sw} />}

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
        <BadgesScreen sw={sw} sh={sh} />
      </div>

      <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", textAlign:"center", lineHeight:1.5 }}>
        {sw}×{sh}px · {note}
      </div>
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
export function MultiDeviceBadgesPreview() {
  return (
    <div style={{ minHeight:"100vh", background:"radial-gradient(circle at center, #102a57 0%, #07183a 35%, #050d1a 75%, #030811 100%)", padding:"36px 20px 60px", fontFamily:"system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes float { from{transform:translateY(0)scale(1)} to{transform:translateY(-16px)scale(1.3)} }
        @keyframes shimmerSweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:0 }
        button { font-family:inherit }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"rgba(97,178,255,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6 }}>
          PWA Trabajadores · Grupo Frío
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"white", letterSpacing:"-0.02em" }}>
          Pantalla 5 — Reconocimientos
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
          Nivel Bronce/Plata/Oro/Platino · Grid badges · Detalle sheet · Badges bloqueados · gamification.badge.user
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

export default BadgesScreen;
