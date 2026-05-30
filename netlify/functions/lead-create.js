// POST /api/v1/lead-create
// Captura un lead del formulario de cotización y lo persiste en Supabase
// Reemplaza Netlify Forms como capa de captura

const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const encrypt = (value) => {
  if (!value) return '';
  return CryptoJS.AES.encrypt(String(value), process.env.ENCRYPTION_KEY).toString();
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://convite.cl',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Validación mínima
  const required = ['provider_slug', 'client_name', 'client_phone', 'event_date', 'event_comuna', 'guest_count'];
  for (const field of required) {
    if (!body[field]) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Campo requerido: ${field}` }) };
    }
  }

  // Buscar provider_id por slug
  const { data: provider, error: provErr } = await supabase
    .from('providers')
    .select('id, name')
    .eq('slug', body.provider_slug)
    .eq('active', true)
    .single();

  if (provErr || !provider) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Proveedor no encontrado' }) };
  }

  // Insertar lead con datos sensibles cifrados
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      provider_id:      provider.id,
      client_name_enc:  encrypt(body.client_name),
      client_phone_enc: encrypt(body.client_phone),
      client_email_enc: encrypt(body.client_email || ''),
      event_date:       body.event_date,
      event_time:       body.event_time || null,
      event_comuna:     body.event_comuna,
      event_type:       body.event_type || '',
      guest_count:      parseInt(body.guest_count, 10),
      event_space:      body.event_space || '',
      message:          body.message || '',
      products_json:    body.products_json || null,
      status:           'PENDIENTE',
    })
    .select('id, status, created_at')
    .single();

  if (leadErr) {
    console.error('Supabase insert error:', leadErr);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al guardar cotización' }) };
  }

  // Registrar en el log de auditoría
  await supabase.from('lead_status_log').insert({
    lead_id:      lead.id,
    from_status:  null,
    to_status:    'PENDIENTE',
    triggered_by: 'client',
    metadata:     { provider_slug: body.provider_slug, comuna: body.event_comuna },
  });

  return {
    statusCode: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id:      lead.id,
      status:       lead.status,
      provider:     provider.name,
      created_at:   lead.created_at,
    }),
  };
};
