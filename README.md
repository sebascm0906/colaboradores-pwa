# GF PWA Colaboradores

Portal interno Grupo Frío — Colaboradores (Intranet / RRHH)

**Stack:** React 18 · React Router v6 · Vite 5 · Vercel

---

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con los valores reales

# 3. Desarrollo local
npm run dev

# 4. Build producción
npm run build
```

## Variables de entorno requeridas

Ver `.env.example` para la lista completa.

Las variables `WA_ACCESS_TOKEN_OPERACIONES` (sin prefijo `VITE_`) **no van en Vercel** — viven exclusivamente en n8n (car12los023.app.n8n.cloud).

## Deploy en Vercel

1. Conectar repositorio en vercel.com
2. Framework: **Vite** (auto-detectado)
3. Agregar variables de entorno en *Project Settings > Environment Variables*
4. Dominio personalizado: `colaboradores.grupofrio.mx`

## Estructura

```
src/
├── screens/
│   ├── ScreenLogin.jsx     # P1 — Auth directa por PIN + barcode
│   ├── ScreenHome.jsx      # P2 — Dashboard principal
│   ├── ScreenKPIs.jsx      # P3 — Mis KPIs (iframe Metabase)
│   ├── ScreenSurveys.jsx   # P4 — Encuestas activas
│   ├── ScreenBadges.jsx    # P5 — Reconocimientos / Badges
│   └── ScreenProfile.jsx   # P6 — Mi Perfil
├── App.jsx                 # Router + SessionContext
├── main.jsx                # Entry point
└── index.css               # Global styles + design tokens
```

## Auth flow

```
PIN + barcode → Odoo `/api/employee-sign-in` → sesión local con {employee_id, job_key, api_key, gf_employee_token} → localStorage
```

La sesión local conserva `role`, `job_key`, `company_id` y los campos que consume la UI. `App.jsx` valida `exp` en cada carga.

> El flujo de WhatsApp OTP se conservó comentado en `ScreenLogin.jsx` como referencia para reactivarlo más adelante si hace falta.
