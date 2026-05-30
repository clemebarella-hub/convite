// GET /api/v1/lead-status?id=UUID
// Devuelve el estado público de un lead (sin datos sensibles)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://convite.cl',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: corsHeaders };

  const lead_id = event.queryStringParameters?.id;
  if (!lead_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id requerido' }) };

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, status, event_date, event_comuna, guest_count, anticipo_amount, unlocked_at, created_at, provider:providers(name, slug)')
    .eq('id', lead_id)
    .single();

  if (error || !lead) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Lead no encontrado' }) };

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id:       lead.id,
      status:        lead.status,
      provider_name: lead.provider?.name,
      provider_slug: lead.provider?.slug,
      event_date:    lead.event_date,
      event_comuna:  lead.event_comuna,
      guest_count:   lead.guest_count,
      anticipo:      lead.anticipo_amount,
      unlocked:      ['DESBLOQUEADO', 'COMPLETADO'].includes(lead.status),
      created_at:    lead.created_at,
    }),
  };
};
