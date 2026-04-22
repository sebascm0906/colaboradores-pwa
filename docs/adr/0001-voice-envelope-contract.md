# ADR 0001 — Voice envelope contract

* **Status**: Accepted
* **Date**: 2026-04-22
* **Supersedes**: —
* **Superseded by**: —

## Context

El sistema voice-to-form de la PWA de colaboradores tiene N pantallas consumiendo
la respuesta del workflow **W120** (n8n). Hoy existen 5 `context_id` en producción:

- `form_merma`
- `form_empaque_rolito`
- `form_incidencia_rolito`
- `form_cierre_bolsas`
- `form_reconciliacion_pt`

El feedback loop vive en **W122** (`/webhook/voice-feedback`), que recibe
diff AI vs humano por `trace_id`.

Sin contrato formal, cada screen puede asumir shapes distintas. Al crecer a más
puestos (operador barra, auxiliar, almacenista…) el riesgo de breaking changes
silenciosos se vuelve real.

Este ADR **congela el contrato actual** y define cómo extenderlo sin romper.

## Decision

### 1. Propósito del envelope

Es la respuesta estándar que W120 devuelve al frontend tras procesar un audio
para cualquier `context_id`. El frontend **solo** se basa en los campos
documentados aquí. Cualquier campo no listado se considera volátil y no debe
consumirse.

### 2. Shape general

El envelope es una **unión discriminada** por `ok`:

```ts
type VoiceEnvelope = VoiceEnvelopeSuccess | VoiceEnvelopeError

type VoiceEnvelopeSuccess = {
  ok: true
  trace_id: string
  context_id: string
  schema_version: 'v1'
  prompt_version: string        // ej 'form_merma_v1.0'
  pipeline_version: string      // ej 'w120_v2.0'
  data: Record<string, unknown> // shape depende de context_id (ver §5)
  timings: Timings
  meta: Meta
}

type VoiceEnvelopeError = {
  ok: false
  trace_id: string | null       // null solo si fallo antes de asignar trace_id
  error_code: VoiceErrorCode
  error_message: string
  errors?: string[]             // detalle estructurado, opcional
  ai_output?: unknown           // presente si paso el LLM pero fallo validation
  timings?: Partial<Timings>
  meta?: Partial<Meta>
}

type Timings = {
  stt_ms: number
  llm_ms: number
  validation_ms: number
  total_ms: number
}

type Meta = {
  stt_confidence: number
  transcript: string
  catalog_fallback?: boolean
  catalog_version?: string | null
}
```

### 3. Campos obligatorios

**Siempre presentes**, en todo envelope (éxito o error):

| Campo | Tipo | Notas |
|---|---|---|
| `ok` | boolean | Discriminador único que el frontend usa para bifurcar |
| `trace_id` | string \| null | `null` solo en errores tempranos previos a asignarlo |

**Solo en `VoiceEnvelopeSuccess`**:

- `context_id`, `schema_version`, `prompt_version`, `pipeline_version`
- `data`, `timings`, `meta`

**Solo en `VoiceEnvelopeError`**:

- `error_code`, `error_message`

### 4. Regla de compatibilidad: solo cambios aditivos

El contrato es inmutable excepto por **extensión aditiva**. Concretamente:

- **Permitido**: agregar un nuevo campo opcional en `data`, `meta` o `timings`.
- **Permitido**: agregar un nuevo `error_code` a la taxonomía (ver §5).
- **Permitido**: agregar un nuevo `context_id` con su propia shape de `data`.
- **Prohibido**: remover un campo existente.
- **Prohibido**: renombrar un campo.
- **Prohibido**: cambiar el tipo de un campo existente (ej. `string` → `string | null`).
- **Prohibido**: cambiar un campo de opcional a requerido (frontend viejo lo rompería).

Cambios no aditivos requieren un nuevo ADR que supersede este (`0002…`) y un
bump de `schema_version` a `v2` para que el frontend pueda bifurcar.

Si la shape de `data` para un `context_id` existente cambia, se bumpa
`prompt_version` (`form_merma_v1.0` → `form_merma_v1.1`) y el frontend decide
si actualiza su consumidor o mantiene el mínimo común.

### 5. Dónde vive cada cosa

| Campo | Responsable | Cuándo cambia |
|---|---|---|
| `error_code` | W120 `auth_context_size_gate`, `load_catalog`, `validate_business_rules`. Frontend mapea a mensaje via `ERROR_MESSAGES` en `VoiceInputButton` | Agregar un code requiere actualizar: el nodo W120 que lo emite + `VoiceInputButton.ERROR_MESSAGES` + este ADR |
| `data` | W120 `build_response`. Shape viene del `CONFIGS[context_id].getSchema()` en `load_catalog` | Agregar un campo requiere bump de `prompt_version` y actualizar el screen consumidor |
| `meta` | W120 `build_response` + `validate_business_rules` | Solo crecer aditivamente |
| `timings` | W120 calcula en cada nodo | Solo crecer aditivamente |

**Taxonomía actual de `error_code`** (congelada; extensión aditiva permitida):

```
AUTH_FAILED              token bearer invalido
MIC_PERMISSION_DENIED    getUserMedia NotAllowedError en frontend
AUDIO_TOO_SHORT          < 500ms, frontend
AUDIO_TOO_LARGE          > 1MB, W120 gate o frontend
STT_EMPTY                Deepgram transcript vacio
STT_LOW_CONFIDENCE       Deepgram confidence < 0.6
CATALOG_UNAVAILABLE      legacy, usado por form_merma (catalog vacio tolerado)
EMPTY_CATALOG            context distinto de form_merma con catalogo ausente
MODE_CATEGORY_MISMATCH   form_incidencia_rolito: category_id no existe en catalogo del mode
VALIDATION_FAILED        regla de negocio fallo post-LLM
LLM_TIMEOUT              OpenAI > timeout o fetch abort (frontend)
INTERNAL_ERROR           fallback no clasificado
```

### 6. Extensiones planificadas (roadmap)

Ambas son **aditivas**: no rompen consumidores actuales.

#### `meta.confirmation_text` (próxima extensión)

Frase natural generada por W120 para mostrar al usuario antes de guardar.

```ts
meta.confirmation_text?: string
// ejemplo: "Voy a registrar 5 bolsas de LAURITA ROLITO 5.5 kg"
```

Responsable: `build_response` en W120 con plantilla por `context_id`.
Frontend: si está presente, mostrarlo; si no, mantener el banner actual.

#### `meta.field_confidence` (extensión posterior)

Confianza por campo, no solo global. LLM emite junto con `data`.

```ts
meta.field_confidence?: Record<string, number> // 0-1 por cada key de data
// ejemplo: { product_id: 0.92, qty_bags: 0.99, cycle_num: 0.60 }
```

Responsable: system prompt pide al LLM emitirlo; `build_response` lo propaga.
Frontend: opcional color-code (verde ≥0.9 / amarillo 0.75-0.89 / rojo <0.75).

Ambas extensiones mantienen `schema_version: 'v1'`.

### 7. Relación con W120 y W122

**W120** (`/webhook/voice-intake`) produce el envelope. Topología fija: dispatcher
único con `CONFIGS[context_id]`. Agregar un `context_id` no requiere nuevo
workflow, solo una entrada más en `CONFIGS` + `VALIDATORS`.

**W122** (`/webhook/voice-feedback`) consume el `trace_id` del envelope para
correlacionar feedback AI vs humano. Su contrato de input:

```ts
type VoiceFeedbackInput = {
  trace_id: string             // viene de VoiceEnvelopeSuccess.trace_id
  ai_output: Record<string, unknown>  // copia de envelope.data
  final_output: Record<string, unknown>  // lo que el usuario realmente guardo
  metadata?: { context_id?: string, shift_id?: number, user_id?: number }
}
```

El frontend dispatcha este POST en submit exitoso, solo si hubo `voiceContext`.
Es fire-and-forget (no bloquea UX).

### 8. Implicación para el frontend

Las screens **no deben asumir** shapes fuera de este contrato. En concreto:

- Leer `envelope.ok` antes de tocar `envelope.data` o `envelope.error_code`.
- Ante `error_code` no mapeado en `ERROR_MESSAGES`, usar fallback genérico.
- `envelope.data.<campo>` puede ser `null` aunque el tipo nominal parezca obligatorio —
  siempre validar `typeof === 'number'` / `typeof === 'string'` antes de setear state.
- No inspeccionar campos no listados aquí. Si W120 emite algo extra por debug,
  es volátil y puede desaparecer.
- No depender del orden de keys en `data`.

## Consequences

### Positivas

- Cualquier screen nueva puede integrarse sabiendo exactamente qué esperar.
- Refactors internos de W120 (reorganizar CONFIGS, agregar nodos intermedios)
  son seguros mientras el envelope no cambie.
- Los 2 extensiones prioritarias (`confirmation_text`, `field_confidence`)
  tienen camino claro sin necesidad de breaking change.

### Negativas / costos

- Agregar un error_code nuevo requiere coordinación 3-way (W120 node +
  VoiceInputButton + este ADR). Acceptable porque son eventos raros.
- Si en el futuro el envelope crece mucho (>10 campos en `meta`), revisar si
  corresponde un `v2` con estructura anidada. Por ahora no aplica.

## Notas

- Las shapes de `data` por `context_id` NO se documentan en este ADR
  (son frágiles, bump de prompt_version las gestiona). Viven en los
  `CONFIGS[context_id].getSchema()` de W120.
- El archivo fuente del contrato en runtime es
  [`scripts/voice/workflows/OPS_W120_voice_intake_v2.json`](../../scripts/voice/workflows/OPS_W120_voice_intake_v2.json)
  (nodo `build_response` + `validate_business_rules`).
