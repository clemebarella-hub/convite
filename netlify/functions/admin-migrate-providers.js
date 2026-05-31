// POST /api/v1/admin-migrate-providers
// Función de un solo uso: cifra los números de WhatsApp reales y los guarda en Supabase
// Protegida por ADMIN_MIGRATE_SECRET para que nadie más pueda invocarla

const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const encrypt = (val) =>
  CryptoJS.AES.encrypt(String(val), process.env.ENCRYPTION_KEY).toString();

const PROVIDERS_DATA = [
  { slug: 'a-la-medida',           whatsapp: '56971258275' },
  { slug: 'agostinos',             whatsapp: '56944434912' },
  { slug: 'beefy',                 whatsapp: '56935051613' },
  { slug: 'brisket-in-law',        whatsapp: '56975555803' },
  { slug: 'chili-fries',           whatsapp: '56966877747' },
  { slug: 'churrascos-patagonia',  whatsapp: '56979913075' },
  { slug: 'crispy-fries',          whatsapp: '56974888028' },
  { slug: 'de-niros',              whatsapp: '56932012310' },
  { slug: 'dirty-smash',           whatsapp: '56944995639' },
  { slug: 'el-buen-mordisco',      whatsapp: '56996184239' },
  { slug: 'el-club',               whatsapp: '56973781047' },
  { slug: 'el-compadre-parrillero',whatsapp: '56964145553' },
  { slug: 'el-frito-jack',         whatsapp: '56993890867' },
  { slug: 'entrepanes',            whatsapp: '56961111667' },
  { slug: 'grillers',              whatsapp: '56994102074' },
  { slug: 'k-burgas',              whatsapp: '56966546898' },
  { slug: 'naturapura',            whatsapp: '56923825434' },
  { slug: 'nunos-smash',           whatsapp: '56961614383' },
  { slug: 'salva-bajon',           whatsapp: '56964145553' },
  { slug: 'tacon-todo',            whatsapp: '56952353821' },
  { slug: 'wild-smash',            whatsapp: '56963413321' },
];

exports.handler = async (event) => {
  // Protección: requiere secret en header
  const secret = event.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_MIGRATE_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const results = [];

  for (const p of PROVIDERS_DATA) {
    const { error } = await supabase
      .from('providers')
      .update({ whatsapp_enc: encrypt(p.whatsapp) })
      .eq('slug', p.slug);

    results.push({ slug: p.slug, ok: !error, error: error?.message });
  }

  const failed = results.filter(r => !r.ok);

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: results.length,
      migrated: results.filter(r => r.ok).length,
      failed,
    }),
  };
};
