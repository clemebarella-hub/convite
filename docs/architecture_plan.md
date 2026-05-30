# CONVITE.CL - PLAN DE MIGRACIÓN ARQUITECTÓNICA TRANSACCIONAL
## REFACTORIZACIÓN DE DIRECTORIO ESTÁTICO A MARKETPLACE BLINDADO

### 1. RESUMEN DE LA INFRAESTRUCTURA DE DESTINO
- **Frontend Stack:** HTML5 / CSS3 / JS Vanilla (Existente) + Fetch API integrada via `convite-api.js`
- **Backend Stack:** Netlify Functions (Node.js 18) — Etapas 1, 3 y 4
- **Webhook Handler:** Render.com (Node.js + Express) — Etapa 2 (Mercado Pago requiere endpoint persistente)
- **Base de Datos:** PostgreSQL en Supabase (Free tier: 500MB). Cliente: `@supabase/supabase-js`
- **Pasarela de Pagos:** Mercado Pago API Chile — Checkout Pro + Webhooks IPN
- **Cifrado:** AES-256 via `crypto-js` en app layer (campos sensibles de cliente y proveedor)
- **Autenticación:** JWT (HS256) via `jsonwebtoken`. Guard client-side en páginas protegidas
- **Emails:** SendGrid API via `@sendgrid/mail`

---

### 2. MATRIZ DE ESTADOS DEL LEAD (MÁQUINA DE ESTADOS)
| Estado | Trigger | Contacto Visible | Acción Pasarela |
| :--- | :--- | :--- | :--- |
| `PENDIENTE` | Cliente envía formulario | 🔒 Oculto | Ninguna |
| `PROPUESTA_ENVIADA` | Proveedor responde con tarifa | 🔒 Oculto | Creación de Preference MP |
| `PAGO_INICIADO` | Frontend carga Checkout Pro | 🔒 Oculto | Preference activa (expira 30 min) |
| `RESERVA_PAGADA` | Webhook MP `status=approved` | 🔒 Transitorio (<2s) | Captura automática |
| `DESBLOQUEADO` | `triggerUnlock()` post-webhook | ✅ **Ambas partes reciben datos por email** | Comisión retenida |
| `CANCELADO_CLIENTE` | Cliente cancela antes del pago | 🔒 Oculto | Preference anulada |
| `CANCELADO_PROVEEDOR` | Proveedor cancela post-desbloqueo | ✅ Ya revelado | Devolución 100% al cliente |
| `COMPLETADO` | Evento realizado | ✅ Revelado | Liberación 30% al proveedor |
| `DISPUTA` | Revisión manual | Según resolución | Congelado |

---

### 3. LÓGICA FINANCIERA
```
ANTICIPO       = quoted_amount × 10%
COMMISSION     = anticipo × 70%   → Convite retiene inmediatamente
TRUCK_SHARE    = anticipo × 30%   → Se libera al proveedor al COMPLETAR el evento
```

---

### 4. SEGURIDAD Y CIFRADO
- **Campos cifrados en BD:** `client_name_enc`, `client_phone_enc`, `client_email_enc`, `whatsapp_enc`, `email_enc`, `instagram_enc`
- **Algoritmo:** AES-256 con clave de 32 bytes almacenada en variable de entorno `ENCRYPTION_KEY`
- **RegEx Antifuga (Chat):**
  ```
  Teléfonos CL:  /(\+?56[-\s]?)?(\(9\)|9)\d[-\s]?\d{3}[-\s]?\d{4}/g
  Emails:        /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  Handles RRSS:  /@[a-zA-Z0-9_\.]{3,30}/g
  URLs:          /(https?:\/\/|www\.)[^\s]{3,}/gi
  Numérico:      /\b\d[\d\s\.\-]{6,}\d\b/g
  ```
- **JWT:** HS256, expiración 24h para proveedores, 1h para admins. Guard client-side verifica `exp` sin llamar al backend

---

### 5. VARIABLES DE ENTORNO REQUERIDAS (Netlify UI)
```
SUPABASE_URL          → URL del proyecto en supabase.com
SUPABASE_SERVICE_KEY  → Service Role Key (nunca la anon key)
ENCRYPTION_KEY        → Mínimo 32 chars aleatorios
JWT_SECRET            → Mínimo 64 chars aleatorios
MP_ACCESS_TOKEN       → Access Token de producción Mercado Pago Chile
SENDGRID_API_KEY      → API Key de SendGrid
SENDGRID_FROM_EMAIL   → convitechile@gmail.com
```

---

### 6. ESTRUCTURA DEL REPOSITORIO (TARGET)
```
clemebarella-hub/convite/
├── cartfinder/                        ← 21 páginas (sin modificar estructura)
│   ├── convite-api.js                 ← Script global inyectado en todas las páginas
│   ├── index.html
│   ├── dashboard.html                 ← Etapa 4: Dashboard proveedor
│   ├── admin.html                     ← Etapa 4: Panel admin
│   ├── login.html                     ← Etapa 4: Auth
│   ├── reserva-confirmada.html        ← Etapa 2: Success post-pago
│   └── [21 páginas de proveedor]
├── netlify/
│   └── functions/
│       ├── lead-create.js             ← ✅ IMPLEMENTADO (Etapa 1)
│       ├── lead-status.js             ← ✅ IMPLEMENTADO (Etapa 1)
│       ├── payment-create.js          ← Etapa 2
│       ├── payment-webhook.js         ← Etapa 2
│       ├── provider-unlock.js         ← Etapa 3
│       ├── auth-login.js              ← Etapa 4
│       ├── provider-metrics.js        ← Etapa 4
│       └── admin-dashboard.js         ← Etapa 4
├── docs/
│   ├── architecture_plan.md           ← ESTE ARCHIVO
│   └── supabase_schema.sql            ← Schema PostgreSQL completo
├── netlify.toml                       ← ✅ CONFIGURADO
└── package.json                       ← ✅ CONFIGURADO
```

---

### 7. ENDPOINTS API
```
POST /api/v1/lead-create              ← ✅ Etapa 1
GET  /api/v1/lead-status?id=UUID      ← ✅ Etapa 1
POST /api/v1/payment-create           ← Etapa 2
POST /api/v1/payment-webhook          ← Etapa 2
GET  /api/v1/provider-unlock?id=UUID  ← Etapa 3
POST /api/v1/auth-login               ← Etapa 4
GET  /api/v1/provider-metrics         ← Etapa 4
GET  /api/v1/admin-dashboard          ← Etapa 4
```

---

### 8. CRONOGRAMA DE CAMBIOS
| Versión | Etapa | Descripción | Autor | Fecha |
| :--- | :--- | :--- | :--- | :--- |
| v1.0.0 | Arquitectura Base | Plan de migración completo. Esquema relacional 4 tablas. Máquina de estados. | Claude AI | 2026-05-29 |
| v1.1.0 | Etapa 1 | `lead-create.js` + `lead-status.js` + `convite-api.js` inyectado en 21 páginas. `netlify.toml` configurado. | Claude AI | 2026-05-29 |
| v1.2.0 | Etapa 2 | Integración Mercado Pago: `payment-create.js` + `payment-webhook.js` | Pendiente | — |
| v1.3.0 | Etapa 3 | Blindaje activo: `provider-unlock.js` + emails automáticos + RegEx antifuga | Pendiente | — |
| v1.4.0 | Etapa 4 | Dashboard proveedor + panel admin + JWT auth | Pendiente | — |
