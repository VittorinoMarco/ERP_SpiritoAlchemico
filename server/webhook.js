/**
 * Webhook server per ricevere ordini da e-commerce esterni.
 * Avvia con: node server/webhook.js
 * Richiede: POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, ECCOMMERCE_WEBHOOK_SECRET
 *
 * Nginx: location /webhook/ { proxy_pass http://127.0.0.1:3001; }
 *
 * Garanzie (audit processi 2026-09):
 *  - autenticazione superuser compatibile con PocketBase >= 0.23 (`_superusers`)
 *  - il segreto è OBBLIGATORIO (senza segreto il server rifiuta tutte le richieste, salvo
 *    WEBHOOK_ALLOW_INSECURE=1 per prove locali) e confrontato in tempo costante
 *  - idempotenza: lo stesso `order_id` inviato due volte non crea un secondo ordine né un secondo scarico
 *  - se la creazione righe/scarico fallisce a metà, le scritture già fatte vengono annullate
 *  - giacenza aggiornata con il modificatore PocketBase `giacenza-` (senza azzerare a 0), coerente con i movimenti;
 *    NON è un lock: scarichi esattamente simultanei sullo stesso prodotto possono perdere un aggiornamento
 *
 * NOTA: i prezzi arrivano dall'e-commerce così come sono. Il payload non distingue IVA inclusa/esclusa:
 * il webhook salva `totale` (come ricevuto) ma NON inventa `totale_imponibile`/`iva`.
 */
import { createServer } from 'http';
import { timingSafeEqual } from 'crypto';
import PocketBase from 'pocketbase';

const PORT = parseInt(process.env.WEBHOOK_PORT || '3001', 10);
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SECRET = process.env.ECCOMMERCE_WEBHOOK_SECRET || '';
const ALLOW_INSECURE = process.env.WEBHOOK_ALLOW_INSECURE === '1';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const MAX_BODY_BYTES = 1024 * 1024;

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

async function ensureAuth() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD || pb.authStore.isValid) return;
  try {
    await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  } catch {
    // PocketBase < 0.23
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  }
}

function secretOk(provided) {
  if (!SECRET) return ALLOW_INSECURE;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload troppo grande'));
        req.destroy();
        return;
      }
      body += chunk;
    });
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

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Data locale italiana (YYYY-MM-DD), non UTC: un ordine delle 00:30 non finisce nel giorno prima. */
const todayRome = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

async function findOrCreateClient(pb, payload) {
  const email = payload.customer?.email || payload.email || '';
  const name = payload.customer?.name || payload.customer_name || payload.billing?.name || 'Cliente E-commerce';
  const ragioneSociale = payload.customer?.company || payload.billing?.company || name;

  if (email) {
    const existing = await pb.collection('clients').getList(1, 1, {
      filter: `email = "${esc(email)}"`
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
    filter: `sku = "${esc(sku)}"`
  });
  return list.items[0] || null;
}

async function undoOrder(pb, created) {
  // Annullamento best-effort in ordine inverso: giacenza → movimenti → righe → ordine
  for (const s of created.stock.reverse()) {
    await pb.collection('inventory').update(s.inventoryId, { 'giacenza+': s.qty }).catch(() => {});
  }
  await Promise.allSettled(created.movements.map((id) => pb.collection('inventory_movements').delete(id)));
  await Promise.allSettled(created.items.map((id) => pb.collection('order_items').delete(id)));
  if (created.orderId) await pb.collection('orders').delete(created.orderId).catch(() => {});
}

async function processOrder(pb, payload) {
  const externalId = String(payload.order_id || payload.id || '').trim();
  const items = payload.items || payload.line_items || payload.products || [];
  if (items.length === 0) {
    throw new Error("Nessun prodotto nell'ordine");
  }

  // Idempotenza: lo stesso ordine esterno non viene mai registrato due volte.
  const numeroOrdine = externalId || `EC-${Date.now()}`;
  const dup = await pb.collection('orders').getList(1, 1, { filter: `numero_ordine = "${esc(numeroOrdine)}"` });
  if (dup.items.length > 0) return { order: dup.items[0], duplicate: true };

  // Validazione completa PRIMA di scrivere qualsiasi cosa.
  let totale = 0;
  const orderItems = [];
  for (const item of items) {
    const sku = item.sku || item.variant_id || item.product_id;
    const product = await findProductBySku(pb, sku);
    if (!product) throw new Error(`Prodotto non trovato: ${sku}`);
    const qty = Number.parseInt(item.quantity ?? item.quantita ?? 1, 10);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error(`Quantità non valida per ${sku}`);
    const prezzo = parseFloat(item.price ?? item.prezzo ?? product.prezzo_ecommerce ?? product.prezzo_listino ?? 0);
    if (!Number.isFinite(prezzo) || prezzo < 0) throw new Error(`Prezzo non valido per ${sku}`);
    const sconto = Math.min(100, Math.max(0, parseFloat(item.discount_percent ?? 0) || 0));
    const totaleRiga = round2(qty * prezzo * (1 - sconto / 100));
    totale += totaleRiga;
    orderItems.push({
      prodotto: product.id,
      quantita: qty,
      prezzo_unitario: prezzo,
      sconto_percentuale: sconto,
      totale_riga: totaleRiga
    });
  }
  totale = round2(totale);

  const clienteId = await findOrCreateClient(pb, payload);
  const created = { orderId: '', items: [], movements: [], stock: [] };
  try {
    const order = await pb.collection('orders').create({
      numero_ordine: numeroOrdine,
      cliente: clienteId,
      data_ordine: todayRome(),
      stato: 'confermato',
      canale: 'ecommerce',
      totale,
      note: payload.note || `Ordine e-commerce: ${externalId}`
    });
    created.orderId = order.id;

    for (const oi of orderItems) {
      const it = await pb.collection('order_items').create({ ordine: order.id, ...oi });
      created.items.push(it.id);
    }

    for (const oi of orderItems) {
      const mov = await pb.collection('inventory_movements').create({
        prodotto: oi.prodotto,
        tipo: 'scarico',
        quantita: oi.quantita,
        causale: `Ordine e-commerce ${order.numero_ordine}`,
        ordine_rif: order.id
      });
      created.movements.push(mov.id);
      const inv = await pb.collection('inventory').getList(1, 1, { filter: `prodotto = "${oi.prodotto}"` });
      if (inv.items.length > 0) {
        await pb.collection('inventory').update(inv.items[0].id, { 'giacenza-': oi.quantita });
        created.stock.push({ inventoryId: inv.items[0].id, qty: oi.quantita });
      } else {
        const ni = await pb.collection('inventory').create({ prodotto: oi.prodotto, giacenza: -oi.quantita, giacenza_minima: 0 });
        created.stock.push({ inventoryId: ni.id, qty: oi.quantita });
      }
    }
    return { order, duplicate: false };
  } catch (e) {
    await undoOrder(pb, created);
    throw e;
  }
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
  if (!secretOk(auth)) {
    try {
      await ensureAuth();
      await logWebhook(pb, 'error', null, 'Unauthorized', {});
    } catch {
      /* ignore */
    }
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    payload = await parseBody(req);
  } catch (e) {
    send(res, 400, { error: e?.message || 'Invalid JSON' });
    return;
  }

  try {
    await ensureAuth();
    const { order, duplicate } = await processOrder(pb, payload);
    await logWebhook(pb, duplicate ? 'duplicate' : 'success', order.id, null, {
      order_id: order.numero_ordine,
      totale: order.totale,
      items_count: (payload.items || payload.line_items || []).length
    });
    send(res, 200, { success: true, duplicate, order_id: order.id, numero_ordine: order.numero_ordine });
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
  if (!SECRET && !ALLOW_INSECURE) {
    console.warn('ATTENZIONE: ECCOMMERCE_WEBHOOK_SECRET non impostato - tutte le richieste verranno rifiutate (401)');
  }
  if (!SECRET && ALLOW_INSECURE) console.warn('WARNING: WEBHOOK_ALLOW_INSECURE=1 - il webhook accetta qualsiasi richiesta');
});
