/**
 * Server MCP remoto per Claude e ChatGPT.
 * Gira online e parla con PocketBase di produzione. Non è un plugin locale.
 *
 * Auth:
 *  - Claude: header fisso `Authorization: Bearer <MCP_TOKEN>` (oppure `X-ERP-Key`)
 *  - ChatGPT: OAuth (la pagina di consenso chiede la stessa chiave)
 *
 * Variabili: MCP_TOKEN, PUBLIC_URL, POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 */
import { createServer } from 'node:http';
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';

loadFallbackEnv();

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const MCP_URL = `${PUBLIC_URL}/mcp`;
const PB_URL = process.env.POCKETBASE_URL || process.env.PUBLIC_POCKETBASE_URL || '';
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const SECRET = process.env.MCP_TOKEN || '';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

if (!SECRET || !PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Mancano MCP_TOKEN, POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL o POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const ALLOWED_REDIRECT_HOSTS = new Set([
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'localhost',
  '127.0.0.1'
]);

const INSTRUCTIONS = [
  'ERP Spirito Alchemico su PocketBase di produzione.',
  'Puoi elencare, leggere, creare, aggiornare ed eliminare record di tutte le collection operative.',
  'Per creare un agente o un altro utente usa create_user: non esiste un invito email, l’account nasce subito e la password ti viene restituita una volta sola.',
  'Una vendita senza fattura è un ordine con con_fattura false. Non creare proforma né fattura per quell’ordine. La provvigione matura alla consegna.',
  'Una vendita con fattura (con_fattura true, il default) segue proforma e poi fattura. La provvigione matura solo quando la fattura è pagata.',
  'con_fattura si cambia solo mentre l’ordine è in bozza.',
  'Per eliminare un record passa confirm esattamente DELETE.',
  'I filtri usano la sintassi PocketBase, per esempio ragione_sociale ~ "Bar".',
  'Non inventare id: leggili prima con list_records o get_record.',
  'Le collection di sistema che iniziano con _ non sono esposte.',
  'Le scritture sono reali e immediate.'
].join(' ');

function loadFallbackEnv() {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (!(k in process.env) || process.env[k] === '') process.env[k] = t.slice(i + 1).trim();
  }
}

function b64url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.toString('base64url');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const i = token.lastIndexOf('.');
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function bearer(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const key = req.headers['x-erp-key'];
  return typeof key === 'string' ? key.trim() : '';
}

function authorized(req) {
  const token = bearer(req);
  if (!token) return false;
  if (safeEqual(token, SECRET)) return true;
  const payload = verify(token);
  return payload?.typ === 'access';
}

function redirectHostOk(uri) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return false;
    return ALLOWED_REDIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function pkce(verifier, challenge) {
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(hash, challenge);
}

async function ensureAuth() {
  if (pb.authStore.isValid) return;
  try {
    await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
  } catch {
    await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
  }
}

async function withPb(fn) {
  await ensureAuth();
  try {
    return await fn();
  } catch (err) {
    const status = err?.status || err?.response?.status;
    if (status === 401) {
      pb.authStore.clear();
      await ensureAuth();
      return fn();
    }
    throw err;
  }
}

let schemaCache = { at: 0, items: [] };

async function collections() {
  if (Date.now() - schemaCache.at < 60_000 && schemaCache.items.length) return schemaCache.items;
  const all = await withPb(() => pb.collections.getFullList());
  schemaCache = {
    at: Date.now(),
    items: all.filter((c) => c.name && !c.name.startsWith('_') && c.type !== 'view')
  };
  return schemaCache.items;
}

async function assertCollection(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name || '')) throw new Error('Nome collection non valido');
  const list = await collections();
  const col = list.find((c) => c.name === name);
  if (!col) throw new Error(`Collection sconosciuta: ${name}`);
  return col;
}

function fieldSummary(col) {
  return (col.fields || col.schema || [])
    .filter((f) => f.type !== 'autodate')
    .map((f) => {
      if (f.type === 'password') return `${f.name}:password (obbligatoria in creazione; passwordConfirm deve essere uguale)`;
      const rel = f.type === 'relation' ? ` -> ${f.collectionId || 'relation'}` : '';
      const values = f.type === 'select' && f.values ? ` [${f.values.join('|')}]` : '';
      return `${f.name}:${f.type}${f.required ? '*' : ''}${values}${rel}`;
    });
}

function clip(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= 80_000) return text;
  return `${text.slice(0, 80_000)}\n…[troncato]`;
}

function pbError(err) {
  const data = err?.response?.data || err?.data;
  const dataText = data && typeof data === 'object' && Object.keys(data).length ? JSON.stringify(data) : '';
  const status = err?.status || err?.response?.status;
  const msg = [status ? `HTTP ${status}` : '', dataText, err?.message].filter(Boolean).join(' — ');
  return (msg || 'Errore PocketBase').slice(0, 2000);
}

const tools = [
  {
    name: 'list_collections',
    description: 'Elenca le collection dell’ERP e i campi. Usala prima di scrivere, per conoscere nomi e tipi.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_records',
    description: 'Legge record. Filtri in sintassi PocketBase. perPage massimo 50.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        filter: { type: 'string', description: 'Filtro PocketBase, es. stato = "bozza"' },
        sort: { type: 'string', description: 'Es. -created' },
        page: { type: 'integer' },
        perPage: { type: 'integer' },
        expand: { type: 'string', description: 'Relazioni da espandere, es. cliente,agente' }
      },
      required: ['collection'],
      additionalProperties: false
    }
  },
  {
    name: 'get_record',
    description: 'Legge un record per id.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        id: { type: 'string' },
        expand: { type: 'string' }
      },
      required: ['collection', 'id'],
      additionalProperties: false
    }
  },
  {
    name: 'create_user',
    description:
      'Crea subito un utente, come la pagina Invita. Non manda email. ruolo default agente. Se ometti password ne genera una e la restituisce una sola volta. Per un agente passa provvigione_percentuale e, se serve, agente_padre.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        nome: { type: 'string' },
        cognome: { type: 'string' },
        ruolo: { type: 'string', description: 'agente, magazziniere o admin. Default agente.' },
        password: { type: 'string', description: 'Almeno 8 caratteri. Se manca, viene generata.' },
        provvigione_percentuale: { type: 'number' },
        agente_padre: { type: 'string', description: 'Id dell’agente sopra, solo per ruolo agente.' }
      },
      required: ['email', 'nome'],
      additionalProperties: false
    }
  },
  {
    name: 'create_record',
    description:
      'Crea un record. Per gli utenti usa create_user. Un ordine senza con_fattura nasce con fattura. con_fattura false è una vendita senza fattura: non creare invoices per quell’ordine.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        data: { type: 'object', additionalProperties: true }
      },
      required: ['collection', 'data'],
      additionalProperties: false
    }
  },
  {
    name: 'update_record',
    description: 'Aggiorna i campi indicati di un record esistente. Gli altri campi restano.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        id: { type: 'string' },
        data: { type: 'object', additionalProperties: true }
      },
      required: ['collection', 'id', 'data'],
      additionalProperties: false
    }
  },
  {
    name: 'delete_record',
    description: 'Elimina un record. Obbligatorio confirm = DELETE. È definitivo sul database di produzione.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        id: { type: 'string' },
        confirm: { type: 'string', description: 'Deve essere esattamente DELETE' }
      },
      required: ['collection', 'id', 'confirm'],
      additionalProperties: false
    }
  }
];

const RUOLI = new Set(['admin', 'agente', 'magazziniere']);

async function createUser(input) {
  const src = input || {};
  const email = String(src.email || '').trim();
  const nome = String(src.nome || '').trim();
  const cognome = String(src.cognome || '').trim();
  const ruolo = src.ruolo ? String(src.ruolo) : 'agente';
  if (!email || !nome) throw new Error('Servono email e nome');
  if (!RUOLI.has(ruolo)) throw new Error('ruolo deve essere admin, agente o magazziniere');
  const password = src.password ? String(src.password) : randomBytes(9).toString('base64url');
  if (password.length < 8) throw new Error('La password deve avere almeno 8 caratteri');
  const data = {
    email,
    password,
    passwordConfirm: password,
    nome,
    cognome,
    ruolo,
    emailVisibility: true,
    verified: true
  };
  if (ruolo === 'agente') {
    data.provvigione_percentuale = Number(src.provvigione_percentuale) || 0;
    if (src.agente_padre) data.agente_padre = String(src.agente_padre);
  }
  const row = await withPb(() => pb.collection('users').create(data));
  return { id: row.id, email: row.email, nome: row.nome, cognome: row.cognome, ruolo: row.ruolo, password };
}

async function assertFatturaConsentita(data) {
  if (!data?.ordine) return;
  const order = await withPb(() => pb.collection('orders').getOne(String(data.ordine)));
  if (order.con_fattura === false) {
    throw new Error('Questo ordine è senza fattura: non si emette né proforma né fattura.');
  }
}

async function callTool(name, args) {
  const a = args || {};
  try {
    if (name === 'list_collections') {
      const list = await collections();
      return ok(list.map((c) => ({ name: c.name, type: c.type, fields: fieldSummary(c) })));
    }
    if (name === 'list_records') {
      await assertCollection(a.collection);
      const perPage = Math.min(Math.max(Number(a.perPage) || 20, 1), 50);
      const page = Math.max(Number(a.page) || 1, 1);
      const query = { sort: a.sort || '-created' };
      if (a.filter) query.filter = a.filter;
      if (a.expand) query.expand = a.expand;
      const res = await withPb(() => pb.collection(a.collection).getList(page, perPage, query));
      return ok({ page: res.page, perPage: res.perPage, totalItems: res.totalItems, totalPages: res.totalPages, items: res.items });
    }
    if (name === 'get_record') {
      await assertCollection(a.collection);
      if (!/^[A-Za-z0-9]{1,50}$/.test(a.id || '')) throw new Error('Id non valido');
      const row = await withPb(() =>
        a.expand
          ? pb.collection(a.collection).getOne(a.id, { expand: a.expand })
          : pb.collection(a.collection).getOne(a.id)
      );
      return ok(row);
    }
    if (name === 'create_user') return ok(await createUser(a));
    if (name === 'create_record') {
      await assertCollection(a.collection);
      if (!a.data || typeof a.data !== 'object' || Array.isArray(a.data)) throw new Error('data deve essere un oggetto');
      if (a.collection === 'users') return ok(await createUser(a.data));
      if (a.collection === 'orders' && a.data.con_fattura == null) a.data.con_fattura = true;
      if (a.collection === 'invoices') await assertFatturaConsentita(a.data);
      const row = await withPb(() => pb.collection(a.collection).create(a.data));
      return ok(row);
    }
    if (name === 'update_record') {
      await assertCollection(a.collection);
      if (!/^[A-Za-z0-9]{1,50}$/.test(a.id || '')) throw new Error('Id non valido');
      if (!a.data || typeof a.data !== 'object' || Array.isArray(a.data)) throw new Error('data deve essere un oggetto');
      if (a.collection === 'orders' && Object.prototype.hasOwnProperty.call(a.data, 'con_fattura')) {
        const current = await withPb(() => pb.collection('orders').getOne(a.id));
        if (current.stato && current.stato !== 'bozza' && Boolean(current.con_fattura) !== Boolean(a.data.con_fattura)) {
          throw new Error('con_fattura si può cambiare solo mentre l’ordine è in bozza');
        }
      }
      if (a.collection === 'invoices' && a.data.ordine) await assertFatturaConsentita(a.data);
      const row = await withPb(() => pb.collection(a.collection).update(a.id, a.data));
      return ok(row);
    }
    if (name === 'delete_record') {
      await assertCollection(a.collection);
      if (a.confirm !== 'DELETE') throw new Error('Per eliminare, confirm deve essere esattamente DELETE');
      if (!/^[A-Za-z0-9]{1,50}$/.test(a.id || '')) throw new Error('Id non valido');
      await withPb(() => pb.collection(a.collection).delete(a.id));
      return ok({ deleted: true, collection: a.collection, id: a.id });
    }
    return fail(`Tool sconosciuto: ${name}`);
  } catch (err) {
    console.error('tool', name, err?.status || '', err?.message || err);
    return fail(pbError(err));
  }
}

function ok(data) {
  return { content: [{ type: 'text', text: clip(data) }], isError: false };
}
function fail(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  if (!method) return rpcError(id ?? null, -32600, 'Richiesta non valida');
  if (method.startsWith('notifications/')) return null;
  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'spirito-alchemico-erp', version: '1.0.0' },
      instructions: INSTRUCTIONS
    });
  }
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: { readOnlyHint: t.readOnly, destructiveHint: t.name === 'delete_record' }
      }))
    });
  }
  if (method === 'tools/call') {
    const result = await callTool(params?.name, params?.arguments || {});
    return rpcResult(id, result);
  }
  return rpcError(id ?? null, -32601, `Metodo non gestito: ${method}`);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

function sendJson(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function unauthorized(res) {
  const metadata = `${PUBLIC_URL}/.well-known/oauth-protected-resource`;
  res.writeHead(401, {
    'WWW-Authenticate': `Bearer realm="spirito-alchemico", resource_metadata="${metadata}"`,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({ error: 'invalid_token' }));
}

function consentPage({ query, error }) {
  const fields = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource']
    .map((k) => `<input type="hidden" name="${k}" value="${esc(query[k] || '')}">`)
    .join('');
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Collega l’ERP</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F3F0;font-family:Georgia,serif;color:#1A1A1A}
  form{width:min(420px,92vw);background:#fff;border-radius:24px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{font-size:1.4rem;margin:0 0 8px}
  p{color:#4b5563;font-size:.95rem;line-height:1.4}
  input[type=password]{width:100%;box-sizing:border-box;margin:12px 0 16px;padding:12px 14px;border-radius:14px;border:1px solid rgba(0,0,0,.12);font-size:1rem}
  button{width:100%;border:0;border-radius:14px;background:#1A1A1A;color:#fff;padding:12px;font-size:1rem;cursor:pointer}
  .err{color:#9f1239;font-size:.9rem}
</style></head><body>
<form method="post" action="/authorize">
  <h1>Spirito Alchemico</h1>
  <p>Claude o ChatGPT chiede l’accesso in lettura, modifica ed eliminazione sull’ERP online. Inserisci la chiave che ti è stata data.</p>
  ${error ? `<p class="err">${esc(error)}</p>` : ''}
  <label for="key">Chiave di accesso</label>
  <input id="key" name="key" type="password" autocomplete="current-password" required>
  ${fields}
  <button type="submit">Autorizza</button>
</form></body></html>`;
}

function metadata() {
  return {
    issuer: PUBLIC_URL,
    authorization_endpoint: `${PUBLIC_URL}/authorize`,
    token_endpoint: `${PUBLIC_URL}/token`,
    registration_endpoint: `${PUBLIC_URL}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['erp']
  };
}

async function handleToken(body) {
  const grant = body.grant_type;
  if (grant === 'authorization_code') {
    const code = verify(body.code || '');
    if (!code || code.typ !== 'code') return { status: 400, body: { error: 'invalid_grant' } };
    if (code.client_id !== body.client_id) return { status: 400, body: { error: 'invalid_client' } };
    if (code.redirect_uri !== body.redirect_uri) return { status: 400, body: { error: 'invalid_grant' } };
    if (!body.code_verifier || !pkce(body.code_verifier, code.challenge)) {
      return { status: 400, body: { error: 'invalid_grant' } };
    }
    const now = Math.floor(Date.now() / 1000);
    return {
      status: 200,
      body: {
        access_token: sign({ typ: 'access', exp: now + 60 * 60 * 12 }),
        refresh_token: sign({ typ: 'refresh', client_id: code.client_id, exp: now + 60 * 60 * 24 * 30 }),
        token_type: 'Bearer',
        expires_in: 60 * 60 * 12,
        scope: 'erp'
      }
    };
  }
  if (grant === 'refresh_token') {
    const refresh = verify(body.refresh_token || '');
    if (!refresh || refresh.typ !== 'refresh') return { status: 400, body: { error: 'invalid_grant' } };
    const now = Math.floor(Date.now() / 1000);
    return {
      status: 200,
      body: {
        access_token: sign({ typ: 'access', exp: now + 60 * 60 * 12 }),
        refresh_token: sign({ typ: 'refresh', client_id: refresh.client_id, exp: now + 60 * 60 * 24 * 30 }),
        token_type: 'Bearer',
        expires_in: 60 * 60 * 12,
        scope: 'erp'
      }
    };
  }
  return { status: 400, body: { error: 'unsupported_grant_type' } };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', PUBLIC_URL);
    const path = url.pathname;

    if (req.method === 'GET' && (path === '/' || path === '/health')) {
      sendJson(res, 200, { ok: true, service: 'spirito-alchemico-mcp', mcp: MCP_URL });
      return;
    }
    if (req.method === 'GET' && (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp')) {
      sendJson(res, 200, {
        resource: MCP_URL,
        authorization_servers: [PUBLIC_URL],
        bearer_methods_supported: ['header'],
        scopes_supported: ['erp']
      });
      return;
    }
    if (req.method === 'GET' && (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid-configuration')) {
      sendJson(res, 200, metadata());
      return;
    }
    if (req.method === 'POST' && path === '/register') {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter(redirectHostOk) : [];
      if (!redirects.length) {
        sendJson(res, 400, { error: 'invalid_redirect_uri' });
        return;
      }
      const clientId = sign({ typ: 'client', redirect_uris: redirects, name: String(body.client_name || 'client').slice(0, 80) });
      sendJson(res, 201, {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: redirects,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: body.client_name || 'client'
      });
      return;
    }
    if (path === '/authorize' && (req.method === 'GET' || req.method === 'POST')) {
      const query = Object.fromEntries(url.searchParams);
      let posted = {};
      if (req.method === 'POST') posted = parseForm(await readBody(req));
      const q = { ...query, ...posted };
      const client = verify(q.client_id || '');
      if (!client || client.typ !== 'client' || !client.redirect_uris?.includes(q.redirect_uri) || !redirectHostOk(q.redirect_uri)) {
        sendHtml(res, 400, '<p>Client OAuth non valido.</p>');
        return;
      }
      if (q.code_challenge_method !== 'S256' || !q.code_challenge) {
        sendHtml(res, 400, '<p>Serve PKCE S256.</p>');
        return;
      }
      if (req.method === 'GET' || !posted.key) {
        sendHtml(res, 200, consentPage({ query: q, error: '' }));
        return;
      }
      if (!safeEqual(posted.key, SECRET)) {
        sendHtml(res, 401, consentPage({ query: q, error: 'Chiave non valida.' }));
        return;
      }
      const code = sign({
        typ: 'code',
        client_id: q.client_id,
        redirect_uri: q.redirect_uri,
        challenge: q.code_challenge,
        exp: Math.floor(Date.now() / 1000) + 300
      });
      const back = new URL(q.redirect_uri);
      back.searchParams.set('code', code);
      if (q.state) back.searchParams.set('state', q.state);
      res.writeHead(302, { Location: back.toString(), 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (req.method === 'POST' && path === '/token') {
      const raw = await readBody(req);
      const type = req.headers['content-type'] || '';
      const body = type.includes('application/json') ? JSON.parse(raw || '{}') : parseForm(raw);
      const out = await handleToken(body);
      sendJson(res, out.status, out.body);
      return;
    }
    if (path === '/mcp') {
      if (req.method === 'GET' || req.method === 'DELETE') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      if (!authorized(req)) {
        unauthorized(res);
        return;
      }
      const raw = await readBody(req);
      let msg;
      try {
        msg = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, rpcError(null, -32700, 'JSON non valido'));
        return;
      }
      const result = await handleRpc(msg);
      if (!result) {
        res.writeHead(202);
        res.end();
        return;
      }
      const accept = req.headers.accept || '';
      if (accept.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        res.end(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
        return;
      }
      sendJson(res, 200, result);
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err?.message || err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MCP in ascolto su ${HOST}:${PORT} → ${MCP_URL}`);
});
