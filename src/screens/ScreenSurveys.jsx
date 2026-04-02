import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet as _apiGet } from "../lib/api";

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
const ODOO_BASE = import.meta.env.VITE_ODOO_URL;
const apiGet = _apiGet;

// Transforma datos de Odoo al formato que espera SurveyCard
function mapOdooSurvey(s) {
  const now = new Date();
  const deadline = s.deadline ? new Date(s.deadline) : null;
  return {
    id: s.id,
    survey_id: s.survey_id,
    title: s.survey_title || `Encuesta #${s.id}`,
    description: "Responde esta encuesta para acumular puntos.",
    duration: "~3 min",
    questionCount: null,  // Odoo no lo expone en la lista
    status: s.state === "in_progress" ? "pending" : s.state === "new" ? "pending" : "done",
    dueDate: deadline ? `${deadline.getDate()} ${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][deadline.getMonth()]}` : null,
    points: 80,
    access_token: s.access_token,
    is_overdue: s.is_overdue,
    completedDate: s.state === "done" ? "Completada" : null,
    // URL de Odoo para abrir la encuesta real
    survey_url: `${ODOO_BASE}/survey/start/${s.access_token}`,
  };
}

/* ============================================================================
   NAV
============================================================================ */
const NAV_ITEMS = [
  { id:"home",      label:"Inicio",    icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:"kpis",      label:"KPIs",      icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:"encuestas", label:"Encuestas", icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { id:"logros",    label:"Logros",    icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> },
  { id:"perfil",    label:"Yo",        icon:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

function BottomNav({ sw }) {
  const navigate = useNavigate();
  const ROUTES = { home: "/", kpis: "/kpis", encuestas: "/surveys", logros: "/badges", badges: "/badges", perfil: "/profile" };
  const navH = sw < 340 ? 58 : 64;
  const itemW = sw < 340 ? 48 : 58;

  return (
    <div style={{ position:"absolute", left:10, right:10, bottom:10, height:navH, borderRadius:20, background:TOKENS.glass.panel, border:`1px solid ${TOKENS.colors.border}`, backdropFilter:"blur(16px)", boxShadow:TOKENS.shadow.md, display:"flex", alignItems:"center", justifyContent:"space-around", zIndex:5 }}>
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === "encuestas";
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
   SHARED UI
============================================================================ */
function IceParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
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
    <div
      style={{
        opacity:visible?1:0,
        transform:visible?"translateY(0)":`translateY(${y}px)`,
        transition:`opacity ${TOKENS.motion.normal}, transform ${TOKENS.motion.normal}`,
      }}
    >
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
   SURVEY LIST VIEW
============================================================================ */
function SurveyCard({ survey, onStart, sw, delay }) {
  const [pressed, setPressed] = useState(false);
  const typo = getTypo(sw);
  const isPending = survey.status === "pending";

  return (
    <FadeIn delay={delay}>
      <div
        onMouseDown={() => isPending && setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onTouchStart={() => isPending && setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onClick={() => isPending && onStart(survey)}
        style={{
          cursor:isPending?"pointer":"default",
          transform:pressed?"scale(0.985)":"scale(1)",
          transition:`transform ${TOKENS.motion.spring}`,
        }}
      >
        <Card
          style={{
            padding: sw < 340 ? 14 : 16,
            border: isPending ? `1px solid ${TOKENS.colors.borderBlue}` : `1px solid ${TOKENS.colors.border}`,
            background: isPending ? TOKENS.glass.hero : TOKENS.glass.panel,
            boxShadow: isPending ? `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}, ${TOKENS.shadow.blue}` : `${TOKENS.shadow.soft}, ${TOKENS.shadow.inset}`,
            opacity: isPending ? 1 : 0.86,
          }}
        >
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, background:isPending?TOKENS.colors.blueGlow:TOKENS.colors.successSoft, border:`1px solid ${isPending?"rgba(97,178,255,0.22)":"rgba(34,197,94,0.22)"}`, borderRadius:999, padding:"4px 8px" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:isPending?TOKENS.colors.blue3:TOKENS.colors.success, boxShadow:isPending?"0 0 6px #61b2ff":"0 0 6px #22c55e" }} />
              <span style={{ fontSize:9, fontWeight:700, color:isPending?TOKENS.colors.blue3:"#4ade80" }}>
                {isPending ? "Pendiente" : "Completada"}
              </span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,0.05)", borderRadius:999, padding:"4px 8px", border:`1px solid ${TOKENS.colors.border}` }}>
              <span style={{ fontSize:10 }}>⭐</span>
              <span style={{ fontSize:10, fontWeight:700, color:TOKENS.colors.textSoft }}>+{survey.points} pts</span>
            </div>
          </div>

          <div style={{ ...typo.title, color:TOKENS.colors.text, marginBottom:6 }}>{survey.title}</div>
          <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, lineHeight:1.5, marginBottom:12 }}>
            {survey.description}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.textLow} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontSize:10, color:TOKENS.colors.textLow, fontWeight:600 }}>{survey.duration}</span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.textLow} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
              <span style={{ fontSize:10, color:TOKENS.colors.textLow, fontWeight:600 }}>{survey.questionCount} preguntas</span>
            </div>

            <div style={{ marginLeft:"auto" }}>
              {isPending ? (
                <span style={{ fontSize:10, color:TOKENS.colors.warning, fontWeight:700 }}>Vence {survey.dueDate}</span>
              ) : (
                <span style={{ fontSize:10, color:TOKENS.colors.textLow }}>Completada {survey.completedDate}</span>
              )}
            </div>
          </div>

          {isPending && (
            <div style={{ marginTop:12, height:40, borderRadius:TOKENS.radius.md, background:"linear-gradient(90deg,#15499B,#2B8FE0)", display:"flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:TOKENS.shadow.blue }}>
              <span style={{ fontSize:12, fontWeight:700, color:"white" }}>Responder encuesta</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
          )}
        </Card>
      </div>
    </FadeIn>
  );
}

/* ============================================================================
   QUESTION COMPONENTS
============================================================================ */
function RatingQuestion({ value, onChange, sw }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? value ?? 0;
  const labels = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
      <div style={{ display:"flex", gap:sw < 340 ? 10 : 14 }}>
        {[1,2,3,4,5].map((star) => (
          <div
            key={star}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor:"pointer", transition:`transform ${TOKENS.motion.spring}`, transform: display >= star ? "scale(1.14)" : "scale(1)" }}
          >
            <svg
              width={sw < 340 ? 34 : 40}
              height={sw < 340 ? 34 : 40}
              viewBox="0 0 24 24"
              fill={display >= star ? "#f59e0b" : "none"}
              stroke={display >= star ? "#f59e0b" : "rgba(255,255,255,0.25)"}
              strokeWidth="1.5"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
        ))}
      </div>
      <div style={{ fontSize:12, fontWeight:700, color: display > 0 ? TOKENS.colors.warning : TOKENS.colors.textLow, minHeight:18 }}>
        {display > 0 ? labels[display] : "Toca para calificar"}
      </div>
    </div>
  );
}

function SingleChoiceQuestion({ options, value, onChange, sw }) {
  const typo = getTypo(sw);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              display:"flex",
              alignItems:"center",
              gap:12,
              padding:"12px 14px",
              minHeight:48,
              cursor:"pointer",
              borderRadius:TOKENS.radius.md,
              background:selected ? "rgba(43,143,224,0.12)" : TOKENS.colors.surfaceSoft,
              border:`1px solid ${selected ? "rgba(97,178,255,0.32)" : TOKENS.colors.border}`,
              transition:`all ${TOKENS.motion.normal}`,
              boxShadow:selected ? TOKENS.shadow.blue : "none",
            }}
          >
            <div
              style={{
                width:20,
                height:20,
                borderRadius:"50%",
                flexShrink:0,
                border:`2px solid ${selected ? TOKENS.colors.blue2 : "rgba(255,255,255,0.25)"}`,
                background:selected ? TOKENS.colors.blue2 : "transparent",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
              }}
            >
              {selected && <div style={{ width:8, height:8, borderRadius:"50%", background:"white" }} />}
            </div>
            <span style={{ ...typo.body, color:selected ? TOKENS.colors.text : TOKENS.colors.textSoft, fontWeight:selected ? 700 : 500 }}>
              {opt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NPSQuestion({ value, onChange, sw }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? value;

  const getColor = (n) => {
    if (display === null || display === undefined) return TOKENS.colors.border;
    if (n <= display) {
      if (display <= 6) return TOKENS.colors.error;
      if (display <= 8) return TOKENS.colors.warning;
      return TOKENS.colors.success;
    }
    return TOKENS.colors.border;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", gap:sw < 340 ? 3 : 4, justifyContent:"center", flexWrap:"nowrap" }}>
        {Array.from({ length:11 }, (_, i) => (
          <div
            key={i}
            onClick={() => onChange(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              width: sw < 340 ? 24 : 28,
              height: sw < 340 ? 28 : 32,
              minHeight:44,
              borderRadius:8,
              cursor:"pointer",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              background: value === i ? getColor(i) : (display === i ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"),
              border:`1px solid ${value === i ? getColor(i) : "rgba(255,255,255,0.10)"}`,
              fontSize: sw < 340 ? 10 : 11,
              fontWeight:700,
              color: value === i ? "white" : TOKENS.colors.textMuted,
              transition:`all ${TOKENS.motion.normal}`,
              transform: value === i ? "scale(1.08)" : "scale(1)",
            }}
          >
            {i}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:9, color:TOKENS.colors.textLow }}>Muy improbable</span>
        <span style={{ fontSize:9, color:TOKENS.colors.textLow }}>Muy probable</span>
      </div>
    </div>
  );
}

function TextQuestion({ value, onChange, placeholder, sw }) {
  return (
    <textarea
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      style={{
        width:"100%",
        resize:"none",
        outline:"none",
        fontFamily:"'DM Sans', system-ui, sans-serif",
        fontSize: sw < 340 ? 12 : 13,
        fontWeight:500,
        color:TOKENS.colors.textSoft,
        background:"rgba(255,255,255,0.04)",
        border:`1px solid ${TOKENS.colors.border}`,
        borderRadius:TOKENS.radius.md,
        padding:"12px 14px",
        lineHeight:1.6,
        caretColor:TOKENS.colors.blue3,
        transition:`border-color ${TOKENS.motion.normal}`,
        boxSizing:"border-box",
      }}
      onFocus={(e) => {
        e.target.style.borderColor = "rgba(97,178,255,0.32)";
        e.target.style.boxShadow = TOKENS.shadow.blue;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = TOKENS.colors.border;
        e.target.style.boxShadow = "none";
      }}
    />
  );
}

/* ============================================================================
   SURVEY FLOW
============================================================================ */
function SurveyFlow({ survey, onClose, onComplete, sw }) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const topPad = sw < 340 ? 36 : 44;
  const sidePad = sw < 340 ? 14 : 18;

  // Odoo Survey URL real via access_token
  const surveyUrl = survey.survey_url;

  return (
    <div style={{ position:"absolute", inset:0, zIndex:10, background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.22) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:`${topPad}px ${sidePad}px 14px`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div onClick={onClose} style={{ width:36, height:36, borderRadius:12, background:"rgba(255,255,255,0.05)", border:`1px solid ${TOKENS.colors.border}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"rgba(97,178,255,0.6)", letterSpacing:"0.18em", marginBottom:2 }}>ENCUESTA</div>
            <div style={{ fontSize:12, fontWeight:500, color:TOKENS.colors.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{survey.title}</div>
          </div>
          <button
            onClick={() => onComplete(survey.id)}
            style={{ border:"none", cursor:"pointer", padding:"8px 14px", minHeight:36, borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:11, fontWeight:700, fontFamily:"inherit", flexShrink:0 }}
          >
            Completar ✓
          </button>
        </div>
      </div>

      {/* Iframe Odoo Survey */}
      <div style={{ flex:1, position:"relative", margin:`0 ${sidePad}px 14px`, borderRadius:TOKENS.radius.lg, overflow:"hidden", border:`1px solid ${TOKENS.colors.borderBlue}` }}>
        {iframeLoading && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, background:"rgba(4,10,24,0.9)" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", border:`3px solid rgba(97,178,255,0.2)`, borderTop:`3px solid ${TOKENS.colors.blue2}`, animation:"spin 0.9s linear infinite" }}/>
            <span style={{ fontSize:12, color:TOKENS.colors.textMuted }}>Cargando encuesta...</span>
          </div>
        )}
        {iframeError ? (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"24px", textAlign:"center" }}>
            <div style={{ fontSize:28 }}>📡</div>
            <div style={{ fontSize:13, color:TOKENS.colors.textMuted }}>No se pudo cargar la encuesta.</div>
            <div style={{ fontSize:11, color:TOKENS.colors.textLow, lineHeight:1.5 }}>Verifica tu conexión o intenta desde el navegador.</div>
            <a href={surveyUrl} target="_blank" rel="noreferrer" style={{ padding:"10px 22px", borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:12, fontWeight:700, textDecoration:"none" }}>
              Abrir en navegador ↗
            </a>
          </div>
        ) : (
          <iframe
            src={surveyUrl}
            title={survey.title}
            style={{ width:"100%", height:"100%", border:"none" }}
            onLoad={() => setIframeLoading(false)}
            onError={() => { setIframeLoading(false); setIframeError(true); }}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   DONE STATE
============================================================================ */
function DoneState({ survey, onBack, sw }) {
  const typo = getTypo(sw);
  const [pulse, setPulse] = useState(false);
  const navH = sw < 340 ? 58 : 64;
  const scrollBottom = 10 + navH + 10;

  useEffect(() => {
    const t = setTimeout(() => setPulse(true), 260);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position:"absolute", inset:0, zIndex:10, background:"radial-gradient(circle at 50% 30%, rgba(34,197,94,0.10) 0%, transparent 50%), radial-gradient(circle at 50% 0%, rgba(33,98,183,0.20) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <IceParticles />

      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          style={{
            position:"absolute",
            left:`${[15,25,40,55,70,80,30,65][i]}%`,
            top:`${[20,35,15,25,18,30,45,42][i]}%`,
            width:[6,4,5,3,6,4,5,3][i],
            height:[6,4,5,3,6,4,5,3][i],
            borderRadius:"50%",
            background:[TOKENS.colors.success, TOKENS.colors.blue3, TOKENS.colors.warning, TOKENS.colors.success, TOKENS.colors.blue3, TOKENS.colors.warning, TOKENS.colors.success, TOKENS.colors.blue2][i],
            opacity: pulse ? 0.7 : 0,
            transition:`opacity 0.6s ease ${i * 0.08}s, transform 0.6s ease ${i * 0.08}s`,
            transform: pulse ? "scale(1)" : "scale(0)",
          }}
        />
      ))}

      <div style={{ padding:`0 ${sw < 340 ? 20 : 28}px`, width:"100%", maxWidth:380, display:"flex", flexDirection:"column", alignItems:"center", gap:22 }}>
        <FadeIn delay={100}>
          <div
            style={{
              width:80,
              height:80,
              borderRadius:26,
              background:TOKENS.colors.successSoft,
              border:"1px solid rgba(34,197,94,0.30)",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              boxShadow:"0 0 40px rgba(34,197,94,0.20)",
              fontSize:34,
              transform: pulse ? "scale(1)" : "scale(0.72)",
              transition:`transform ${TOKENS.motion.spring} 0.18s`,
            }}
          >
            ✓
          </div>
        </FadeIn>

        <FadeIn delay={200} y={16}>
          <div style={{ textAlign:"center" }}>
            <div style={{ ...typo.display, color:TOKENS.colors.text, marginBottom:8 }}>¡Listo!</div>
            <div style={{ ...typo.body, color:TOKENS.colors.textMuted, lineHeight:1.65 }}>
              Gracias por responder <span style={{ color:TOKENS.colors.textSoft, fontWeight:700 }}>"{survey.title}"</span>. Tu opinión es clave para Grupo Frío.
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={320}>
          <Card style={{ padding:"16px 20px", border:`1px solid ${TOKENS.colors.borderBlue}`, background:TOKENS.glass.hero, width:"100%", textAlign:"center", boxShadow:`${TOKENS.shadow.md}, ${TOKENS.shadow.inset}, ${TOKENS.shadow.blue}` }}>
            <div style={{ ...typo.caption, color:TOKENS.colors.textMuted, marginBottom:4 }}>Puntos ganados</div>
            <div style={{ fontSize:34, fontWeight:700, color:TOKENS.colors.blue3, letterSpacing:"-0.04em" }}>+{survey.points}</div>
            <div style={{ ...typo.caption, color:"rgba(255,255,255,0.40)", marginTop:2 }}>Se reflejarán en tu balance hoy</div>
          </Card>
        </FadeIn>

        <FadeIn delay={420}>
          <button
            onClick={onBack}
            style={{ width:"100%", height:48, borderRadius:TOKENS.radius.md, background:"linear-gradient(90deg,#15499B,#2B8FE0)", border:"none", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:TOKENS.shadow.blue }}
          >
            Volver a Encuestas
          </button>
        </FadeIn>
      </div>

      <div style={{ position:"absolute", bottom:scrollBottom + 14, left:0, right:0, textAlign:"center" }}>
        <span style={{ fontSize:9, color:TOKENS.colors.textLow }}>Respuestas guardadas en Odoo · Sync automático</span>
      </div>

      <BottomNav sw={sw} />
    </div>
  );
}

/* ============================================================================
   MAIN SCREEN
============================================================================ */
function SurveysScreen({ sw = 390, sh = 844 }) {
  const [view, setView] = useState("list");
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error | empty
  const [completedIds, setCompletedIds] = useState([]);
  const typo = getTypo(sw);

  const navH = sw < 340 ? 58 : 64;
  const navBot = 10;
  const scrollBottom = navBot + navH + 10;
  const topPad = sw < 340 ? 36 : 44;
  const sidePad = sw < 340 ? 14 : 18;

  // Cargar surveys reales desde W16
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    apiGet("/pwa-surveys")
      .then(res => {
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          const mapped = res.data.map(mapOdooSurvey);
          setSurveys(mapped);
          setLoadState(mapped.length > 0 ? "ready" : "empty");
        } else {
          setLoadState("empty");
        }
      })
      .catch(() => { if (!cancelled) setLoadState("error"); });
    return () => { cancelled = true; };
  }, []);

  const displaySurveys = surveys.map(s => ({
    ...s,
    status: completedIds.includes(s.id) ? "done" : s.status,
    completedDate: completedIds.includes(s.id) ? "Hoy" : s.completedDate,
  }));

  const pendingCount = displaySurveys.filter(s => s.status === "pending").length;

  const handleStart = (survey) => {
    setActiveSurvey(survey);
    setView("survey");
  };

  const handleComplete = (id) => {
    setCompletedIds(prev => prev.includes(id) ? prev : [...prev, id]);
    setView("done");
  };

  const handleBack = () => {
    setActiveSurvey(null);
    setView("list");
  };

  return (
    <div style={{ position:"relative", width:sw, height:sh, overflow:"hidden", background:"radial-gradient(circle at 50% 0%, rgba(33,98,183,0.20) 0%, transparent 34%), linear-gradient(160deg, #04101f 0%, #07162b 45%, #04101d 100%)", fontFamily:"'DM Sans',system-ui,sans-serif", overscrollBehaviorY:"none", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      <IceParticles />

      <div style={{ position:"absolute", inset:0, opacity:0.032, backgroundImage:"linear-gradient(rgba(43,143,224,.45) 1px,transparent 1px),linear-gradient(90deg,rgba(43,143,224,.45) 1px,transparent 1px)", backgroundSize:"48px 48px" }} />

      <div style={{ position:"absolute", top:0, left:0, right:0, bottom:scrollBottom, overflowY:"auto", zIndex:2, padding:`${topPad}px ${sidePad}px 20px`, display:"flex", flexDirection:"column", gap:14, opacity:view==="list"?1:0, pointerEvents:view==="list"?"auto":"none", transition:`opacity ${TOKENS.motion.normal}` }}>
        <FadeIn delay={60}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
            <div>
              <div style={{ ...typo.overline, color:"rgba(97,178,255,0.6)", marginBottom:6 }}>MIS ENCUESTAS</div>
              <div style={{ ...typo.h1, color:TOKENS.colors.text, lineHeight:1.05 }}>Encuestas</div>
              <div style={{ ...typo.caption, color:"rgba(97,178,255,0.75)", marginTop:4, fontWeight:600 }}>
                {loadState === "loading" ? "Cargando..." : loadState === "error" ? "Error al cargar" : pendingCount > 0 ? `${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}` : "Todo al día ✓"}
              </div>
            </div>

            {pendingCount > 0 && (
              <div style={{ width:38, height:38, borderRadius:12, background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.22)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:16, fontWeight:800, color:TOKENS.colors.error }}>{pendingCount}</span>
              </div>
            )}
          </div>
        </FadeIn>

        {loadState === "loading" && (
          <FadeIn delay={100}>
            {[1,2].map(i => (
              <div key={i} style={{ height:110, borderRadius:TOKENS.radius.xl, background:"rgba(255,255,255,0.04)", border:`1px solid ${TOKENS.colors.border}`, overflow:"hidden", position:"relative" }}>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)", animation:"shimmerMove 1.6s infinite" }}/>
              </div>
            ))}
          </FadeIn>
        )}

        {loadState === "error" && (
          <FadeIn delay={100}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"32px 0", textAlign:"center" }}>
              <div style={{ fontSize:28 }}>📡</div>
              <div style={{ ...typo.body, color:TOKENS.colors.textMuted }}>No se pudieron cargar las encuestas</div>
              <button onClick={()=>{ setLoadState("loading"); apiGet("/pwa-surveys").then(r=>{ if(r.success&&Array.isArray(r.data)){const m=r.data.map(mapOdooSurvey);setSurveys(m);setLoadState(m.length>0?"ready":"empty");}else{setLoadState("empty");}}).catch(()=>setLoadState("error")); }} style={{ border:"none", cursor:"pointer", padding:"10px 22px", minHeight:44, borderRadius:TOKENS.radius.pill, background:"linear-gradient(90deg,#15499B,#2B8FE0)", color:"white", fontSize:13, fontWeight:700, fontFamily:"inherit" }}>Reintentar</button>
            </div>
          </FadeIn>
        )}

        {loadState === "empty" && (
          <FadeIn delay={100}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"32px 0", textAlign:"center" }}>
              <div style={{ fontSize:28 }}>✅</div>
              <div style={{ ...typo.body, color:TOKENS.colors.textMuted }}>No tienes encuestas pendientes</div>
            </div>
          </FadeIn>
        )}

        {loadState === "ready" && pendingCount > 0 && (
          <FadeIn delay={100}>
            <Card style={{ padding:"12px 14px", background:"rgba(43,143,224,0.07)", border:"1px solid rgba(97,178,255,0.16)", display:"flex", alignItems:"center", gap:10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize:11, color:"rgba(97,178,255,0.8)", lineHeight:1.4 }}>
                Tus respuestas son anónimas y se envían directo a RRHH en Odoo.
              </span>
            </Card>
          </FadeIn>
        )}

        {loadState === "ready" && displaySurveys.some(s => s.status === "pending") && (
          <FadeIn delay={140}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, height:1, background:"linear-gradient(90deg, rgba(87,175,255,0.26), transparent)" }} />
              <span style={{ ...typo.overline, color:"rgba(97,178,255,0.72)" }}>PENDIENTES</span>
              <div style={{ flex:1, height:1, background:"linear-gradient(90deg, transparent, rgba(87,175,255,0.26))" }} />
            </div>
          </FadeIn>
        )}

        {loadState === "ready" && displaySurveys.filter(s => s.status === "pending").map((s, i) => (
          <SurveyCard key={s.id} survey={s} onStart={handleStart} sw={sw} delay={180 + i * 60} />
        ))}

        {loadState === "ready" && displaySurveys.some(s => s.status === "done") && (
          <FadeIn delay={320}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:4 }}>
              <div style={{ flex:1, height:1, background:"linear-gradient(90deg, rgba(87,175,255,0.14), transparent)" }} />
              <span style={{ ...typo.overline, color:"rgba(255,255,255,0.28)" }}>COMPLETADAS</span>
              <div style={{ flex:1, height:1, background:"linear-gradient(90deg, transparent, rgba(87,175,255,0.14))" }} />
            </div>
          </FadeIn>
        )}

        {loadState === "ready" && displaySurveys.filter(s => s.status === "done").map((s, i) => (
          <SurveyCard key={s.id} survey={s} onStart={() => {}} sw={sw} delay={360 + i * 40} />
        ))}

        <div style={{ height:4 }} />
      </div>

      {view === "survey" && activeSurvey && (
        <SurveyFlow survey={activeSurvey} onClose={handleBack} onComplete={handleComplete} sw={sw} />
      )}

      {view === "done" && activeSurvey && (
        <DoneState survey={activeSurvey} onBack={handleBack} sw={sw} />
      )}

      {view === "list" && <BottomNav sw={sw} />}
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
        <SurveysScreen sw={sw} sh={sh} />
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
export function MultiDeviceSurveysPreview() {
  return (
    <div style={{ minHeight:"100vh", background:"radial-gradient(circle at center, #102a57 0%, #07183a 35%, #050d1a 75%, #030811 100%)", padding:"36px 20px 60px", fontFamily:"system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes float { from{transform:translateY(0)scale(1)} to{transform:translateY(-16px)scale(1.3)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:0 }
        button { font-family:inherit }
        textarea { font-family:'DM Sans',system-ui,sans-serif }
        textarea::placeholder { color:rgba(255,255,255,0.28) }
      `}</style>

      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"rgba(97,178,255,0.55)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:6 }}>
          PWA Trabajadores · Grupo Frío
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"white", letterSpacing:"-0.02em" }}>
          Pantalla 4 — Encuestas
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
          Lista → Preguntas interactivas → Done · Rating / Single choice / NPS / Texto · Sync Odoo
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

export default SurveysScreen;
