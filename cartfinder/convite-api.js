// convite-api.js — Script global de Convite
// Inyectado en todas las páginas de proveedor
// Versión: 1.0.0 — Etapa 1: Captura de leads en Supabase

(function () {
  'use strict';

  const CONVITE_API = '/api/v1';

  // ─────────────────────────────────────────
  // Utilidad: leer productos seleccionados
  // (ya definidos en cada página)
  // ─────────────────────────────────────────
  function getSelectedProducts() {
    if (typeof window._selectedProducts !== 'undefined') return window._selectedProducts;
    const checks = document.querySelectorAll('.product-check:checked');
    if (!checks.length) return null;
    const products = [];
    checks.forEach((chk) => {
      const row = chk.closest('[data-product]') || chk.closest('label');
      const qty = row?.querySelector('.product-qty')?.value || 1;
      products.push({ id: chk.value, qty: parseInt(qty, 10) });
    });
    return products;
  }

  // ─────────────────────────────────────────
  // Interceptar el submit del formulario
  // y enviar a la API antes del WhatsApp
  // ─────────────────────────────────────────
  function attachLeadCapture() {
    const form = document.getElementById('consultForm');
    if (!form) return;

    // Guardar el handler original de WhatsApp que ya existe en la página
    // No lo eliminamos — en Etapa 1 el WhatsApp sigue funcionando
    form.addEventListener('submit', async function handleApiSubmit(e) {
      // El handler original ya llamó preventDefault — no hace falta repetirlo
      // Solo necesitamos capturar el lead en paralelo

      const inputs = this.querySelectorAll(
        'input:not(.product-check):not(.product-qty), select, textarea'
      );

      const payload = {
        provider_slug: window.VENDOR_ID   || '',
        client_name:   inputs[0]?.value   || '',
        client_phone:  inputs[1]?.value   || '',
        event_date:    inputs[2]?.value   || '',
        event_type:    inputs[3]?.value   || '',
        guest_count:   inputs[4]?.value   || '',
        event_time:    inputs[5]?.value   || '',
        event_comuna:  inputs[6]?.value   || '',
        event_space:   inputs[7]?.value   || '',
        message:       inputs[8]?.value   || '',
        client_email:  '',                       // se agrega en Etapa 3
        products_json: getSelectedProducts(),
      };

      // Fire-and-forget: no bloquea el flujo de WhatsApp existente
      fetch(`${CONVITE_API}/lead-create`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.lead_id) {
            // Guardar para consultar el estado más adelante (Etapa 2)
            sessionStorage.setItem('convite_lead_id',       data.lead_id);
            sessionStorage.setItem('convite_lead_provider', data.provider || '');
            sessionStorage.setItem('convite_lead_status',   data.status   || 'PENDIENTE');
          }
        })
        .catch(() => {
          // Silencioso: el fallo de la API nunca interrumpe al usuario
        });
    }, true); // capture=true para ejecutarse antes que el handler de WhatsApp
  }

  // ─────────────────────────────────────────
  // Inicializar cuando el DOM esté listo
  // ─────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLeadCapture);
  } else {
    attachLeadCapture();
  }

  // Exponer función para uso futuro (Etapa 2 — iniciar pago)
  window.conviteGetLeadId = () => sessionStorage.getItem('convite_lead_id');
  window.conviteCheckStatus = async (leadId) => {
    const id = leadId || sessionStorage.getItem('convite_lead_id');
    if (!id) return null;
    try {
      const res = await fetch(`${CONVITE_API}/lead-status?id=${id}`);
      return await res.json();
    } catch {
      return null;
    }
  };
})();
