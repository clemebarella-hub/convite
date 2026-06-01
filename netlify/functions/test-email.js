// GET /api/v1/test-email — diagnóstico temporal de SendGrid
exports.handler = async () => {
  const sgKey = process.env.SENDGRID_API_KEY;

  if (!sgKey) {
    return { statusCode: 200, body: JSON.stringify({ error: 'SENDGRID_API_KEY no encontrada en env vars' }) };
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sgKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'convitechile@gmail.com' }] }],
        from: { email: 'convitechile@gmail.com', name: 'Convite Test' },
        subject: 'Test diagnóstico Convite',
        content: [{ type: 'text/plain', value: 'Si ves esto, SendGrid está funcionando.' }],
      }),
    });

    const text = await res.text();
    return {
      statusCode: 200,
      body: JSON.stringify({
        sg_status: res.status,
        sg_response: text || '(vacío — 202 es éxito)',
        key_prefix: sgKey.substring(0, 10) + '...',
      }),
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ error: e.message }) };
  }
};
