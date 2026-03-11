/**
 * Webhook server per ricevere ordini da e-commerce esterni.
 * Avvia con: node server/webhook.js
 * Richiede: POCKETBASE_URL, ECCOMMERCE_WEBHOOK_SECRET
 *
 * Nginx: location /webhook/ { proxy_pass http://127.0.0.1:3001; }
 */
import { createServer } from 'http';
import PocketBase from 'pocketbase';

const PORT = parseInt(process.env.WEBHOOK_PORT || '3001', 10);
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SECRET = process.env.ECCOMMERCE_WEBHOOK_SECRET || '';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';

const pb = new PocketBase(PB_URL);

async function ensureAuth() {
  if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD && !pb.authStore.isValid) {
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function findOrCreateClient(pb, payload) {
  const email = payload.customer?.email || payload.email || '';
  const name = payload.customer?.name || payload.customer_name || payload.billing?.name || 'Cliente E-commerce';
  const ragioneSociale = payload.customer?.company || payload.billing?.company || name;

  if (email) {
    const existing = await pb.collection('clients').getList(1, 1, {
      filter: `email = "${String(email).replace(/"/g, '\\"')}"`
    });
    if (existing.items.length > 0) return existing.items[0].id;
  }

  const created = await pb.collection('clients').create({
    ragione_sociale: ragioneSociale || 'Cliente E-commerce',
    tipo: 'ecommerce',
    email: email || undefined,
    indirizzo: payload.billing?.address || payload.shipping?.address,
    citta: payload.billing?.city || payload.shipping?.city,
    cap: payload.billing?.postal_code || payload.shipping?.postal_code,
    provincia: payload.billing?.state || payload.shipping?.state
  });
  return created.id;
}

async function findProductBySku(pb, sku) {
  const list = await pb.collection('products').getList(1, 1, {
    filter: `sku = "${String(sku).replace(/"/g, '\\"')}"`
  });
  return list.items[0] || null;
}

async function processOrder(pb, payload) {
  const clienteId = await findOrCreateClient(pb, payload);
  const items = payload.items || payload.line_items || payload.products || [];
  if (items.length === 0) {
    throw new Error('Nessun prodotto nell\'ordine');
  }

  let totale = 0;
  const orderItems = [];

  for (const item of items) {
    const sku = item.sku || item.variant_id || item.product_id;
    const product = await findProductBySku(pb, sku);
    if (!product) {
      throw new Error(`Prodotto non trovato: ${sku}`);
    }
    const qty = parseInt(item.quantity || item.quantita || 1, 10);
    const prezzo = parseFloat(item.price || item.prezzo || product.prezzo_ecommerce || product.prezzo_listino || 0);
    const totaleRiga = qty * prezzo;
    totale += totaleRiga;
    orderItems.push({
      prodotto: product.id,
      quantita: qty,
      prezzo_unitario: prezzo,
      sconto_percentuale: item.discount_percent || 0,
      totale_riga: totaleRiga
    });
  }

  const orderId = `EC-${Date.now()}`;
  const order = await pb.collection('orders').create({
    numero_ordine: payload.order_id || payload.id || orderId,
    cliente: clienteId,
    data_ordine: new Date().toISOString().split('T')[0],
    stato: 'confermato',
    canale: 'ecommerce',
    totale,
    note: payload.note || `Ordine e-commerce: ${payload.order_id || payload.id || ''}`
  });

  for (const oi of orderItems) {
    await pb.collection('order_items').create({
      ordine: order.id,
      ...oi
    });
  }

  for (const oi of orderItems) {
    const inv = await pb.collection('inventory').getList(1, 1, {
      filter: `prodotto = "${oi.prodotto}"`
    });
    if (inv.items.length > 0) {
      const invRecord = inv.items[0];
      const newGiacenza = Math.max(0, (invRecord.giacenza || 0) - oi.quantita);
      await pb.collection('inventory').update(invRecord.id, { giacenza: newGiacenza });
    }
    await pb.collection('inventory_movements').create({
      prodotto: oi.prodotto,
      tipo: 'scarico',
      quantita: oi.quantita,
      causale: `Ordine e-commerce ${order.numero_ordine}`,
      ordine_rif: order.id
    });
  }

  return order;
}

async function logWebhook(pb, status, orderId, errorMsg, payloadSummary) {
  try {
    await pb.collection('activity_log').create({
      azione: 'webhook_ecommerce',
      collection_rif: 'orders',
      record_rif: orderId || '',
      dettagli: JSON.stringify({
        status,
        order_id: orderId,
        error: errorMsg,
        payload_summary: payloadSummary,
        timestamp: new Date().toISOString()
      })
    });
  } catch {
    // ignore log errors
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Secret'
    });
    res.end();
    return;
  }

  if (req.url !== '/webhook/ecommerce' && req.url !== '/ecommerce') {
    send(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  const auth = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (SECRET && auth !== SECRET) {
    await logWebhook(pb, 'error', null, 'Unauthorized', {});
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    payload = await parseBody(req);
  } catch {
    await logWebhook(pb, 'error', null, 'Invalid JSON', {});
    send(res, 400, { error: 'Invalid JSON' });
    return;
  }

  try {
    await ensureAuth();
    const order = await processOrder(pb, payload);
    await logWebhook(pb, 'success', order.id, null, {
      order_id: order.numero_ordine,
      totale: order.totale,
      items_count: (payload.items || payload.line_items || []).length
    });
    send(res, 200, { success: true, order_id: order.id, numero_ordine: order.numero_ordine });
  } catch (e) {
    const msg = e?.message || 'Errore elaborazione';
    await logWebhook(pb, 'error', null, msg, {
      order_id: payload.order_id || payload.id,
      items_count: (payload.items || payload.line_items || []).length
    });
    send(res, 422, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  if (!SECRET) console.warn('WARNING: ECCOMMERCE_WEBHOOK_SECRET not set - webhook accepts any request');
});
