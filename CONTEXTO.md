# CONVITE.CL — Contexto Técnico

## Negocio
- Marketplace de catering y food trucks para eventos en Chile
- Conecta clientes que piden cotización con 21 proveedores verificados
- Modelo actual: gratuito — leads se reenvían al proveedor por WhatsApp
- Modelo futuro: cliente paga 10% anticipo online → Convite 70% / proveedor 30%
- Proyección con 25 proveedores activos: ~$3.000.000 CLP/mes

## Producto — 4 Etapas
- Etapa 1 ✅ Landing + 21 perfiles + formulario de cotización (live en convite.cl)
- Etapa 2 ❌ Integración Mercado Pago Chile (deadline: 1 sept 2026)
- Etapa 3 ❌ Revelar contacto del proveedor después del pago
- Etapa 4 ❌ Dashboards de proveedor y panel admin

## Stack
- Frontend: HTML/CSS/JS vanilla — Netlify (publish dir: `cartfinder/`)
- Backend: Netlify Functions (Node.js) en `netlify/functions/`
- Base de datos: Supabase PostgreSQL (tablas: users, providers, leads, lead_status_log)
- Emails: SendGrid (remitente: convitechile@gmail.com)
- Pagos: Mercado Pago Chile — pendiente
- Cifrado: AES-256 via crypto-js (números WhatsApp de proveedores)
- Analytics: GA4 (tag: G-S9W7R379VW) en las 23 páginas

## Archivos Principales
- `cartfinder/index.html` — landing, buscador y cards de proveedores
- `cartfinder/[slug].html` — perfil individual de cada proveedor (21 archivos)
- `netlify/functions/lead-create.js` — captura lead en Supabase + email SendGrid
- `netlify/functions/lead-status.js` — estado público de un lead
- `cartfinder/convite-api.js` — script inyectado en las 21 páginas de proveedores
- `netlify.toml` — config: redirects /api/v1/* → /.netlify/functions/:splat

## Deadlines
- 1 sept 2026: Etapa 2 lista (pagos) — temporada alta de eventos en Chile
- 15 oct 2026: UAI Startup Fest (1.500 personas, $2M presupuesto, requiere factura)

## Equipo
- Clemente Barella — desarrollo + operaciones (70% equity)
- José Pedro Eguiguren — comercial, proveedores, RRSS (30% equity)

## Credenciales y Servicios
- Variables de entorno en Netlify dashboard (SUPABASE_URL, SUPABASE_SERVICE_KEY, SENDGRID_API_KEY)
- NO commitear .env ni secrets al repo
- Repo: github.com/clemebarella-hub/convite

## Notas Importantes
- Los webhooks de Mercado Pago requieren servidor persistente → usar Render.com ($7/mes)
- Los números de proveedores están visibles en el HTML — la Etapa 3 los oculta
- Temporada alta: sept–dic. El sprint de pagos debe terminar antes de septiembre
- Proveedores son conocidos del equipo, muchos informales — plataforma opera como intermediario puro (legal en Chile)
