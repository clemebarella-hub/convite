// POST /api/v1/lead-create
// Captura un lead, lo persiste cifrado en Supabase y notifica a Convite por email

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
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Notificación por email usando SendGrid (falla silenciosamente si no hay API key)
async function sendLeadNotification(lead, provider, body) {
  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) return;

  const eventDate = new Date(body.event_date).toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0A0A0A;color:#F5F0E8;padding:2rem;border-radius:12px;">
      <h2 style="color:#C8B89A;margin-top:0;">🎉 Nueva cotización en Convite</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#888;width:140px;">Proveedor</td><td style="padding:8px 0;font-weight:bold;">${provider.name}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Cliente</td><td style="padding:8px 0;">${body.client_name}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Teléfono</td><td style="padding:8px 0;">${body.client_phone}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Fecha evento</td><td style="padding:8px 0;">${eventDate}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Hora</td><td style="padding:8px 0;">${body.event_time || 'No especificada'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Comuna</td><td style="padding:8px 0;">${body.event_comuna}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Tipo de evento</td><td style="padding:8px 0;">${body.event_type || 'No especificado'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Personas</td><td style="padding:8px 0;font-weight:bold;">${body.guest_count}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Espacio</td><td style="padding:8px 0;">${body.event_space || 'No especificado'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Mensaje</td><td style="padding:8px 0;">${body.message || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Lead ID</td><td style="padding:8px 0;font-size:0.75rem;color:#666;">${lead.id}</td></tr>
      </table>
      <p style="margin-top:1.5rem;font-size:0.85rem;color:#666;">
        Este lead fue guardado automáticamente en Supabase con los datos del cliente cifrados.
      </p>
    </div>
  `;

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sgKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'convitechile@gmail.com' }] }],
        from: { email: 'convitechile@gmail.com', name: 'Convite' },
        subject: `🎉 Nueva cotización — ${provider.name} · ${body.guest_count} personas · ${body.event_comuna}`,
        content: [{ type: 'text/html', value: html }],
      }),
    });
  } catch (e) {
    console.error('SendGrid error (non-fatal):', e.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const required = ['provider_slug', 'client_name', 'client_phone', 'event_date', 'event_comuna', 'guest_count'];
  for (const field of required) {
    if (!body[field]) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Campo requerido: ${field}` }) };
    }
  }

  const { data: provider, error: provErr } = await supabase
    .from('providers')
    .select('id, name')
    .eq('slug', body.provider_slug)
    .eq('active', true)
    .single();

  if (provErr || !provider) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Proveedor no encontrado' }) };
  }

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

  await supabase.from('lead_status_log').insert({
    lead_id:      lead.id,
    from_status:  null,
    to_status:    'PENDIENTE',
    triggered_by: 'client',
    metadata:     { provider_slug: body.provider_slug, comuna: body.event_comuna },
  });

  // Notificación email — no bloquea la respuesta
  sendLeadNotification(lead, provider, body).catch(() => {});

  return {
    statusCode: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id:    lead.id,
      status:     lead.status,
      provider:   provider.name,
      created_at: lead.created_at,
    }),
  };
};
