/**
 * Backup API server - proxy per PocketBase backup (richiede superuser).
 * Avvia con: node server/backup.js
 *
 * Variabili: POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD,
 *           BACKUP_PORT (default 3002), BACKUP_API_SECRET (opzionale)
 *
 * Nginx: location /api/backups { proxy_pass http://127.0.0.1:3002; }
 */
import { createServer } from 'http';
import PocketBase from 'pocketbase';

const PORT = parseInt(process.env.BACKUP_PORT || '3002', 10);
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const BACKUP_SECRET = process.env.BACKUP_API_SECRET || '';

const pb = new PocketBase(PB_URL);

async function ensureAdminAuth() {
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
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function getUserIdFromToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.id || payload.recordId || payload.sub || null;
  } catch {
    return null;
  }
}

async function verifyAdminAuth(req) {
  const auth = req.headers['authorization']?.replace('Bearer ', '');
  const secret = req.headers['x-backup-secret'];
  if (BACKUP_SECRET && secret === BACKUP_SECRET) return true;
  if (!auth) return false;
  const userId = getUserIdFromToken(auth);
  if (!userId) return false;
  try {
    const res = await fetch(`${PB_URL}/api/collections/users/records/${userId}`, {
      headers: { Authorization: `Bearer ${auth}` }
    });
    if (!res.ok) return false;
    const user = await res.json();
    return (user.role || user.ruolo) === 'admin';
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Backup-Secret'
    });
    res.end();
    return;
  }

  const path = req.url?.split('?')[0] || '';
  const isBackupApi = path === '/api/backups' || path === '/backups' || path.startsWith('/api/backups/') || path.startsWith('/backups/');

  if (!isBackupApi) {
    send(res, 404, { error: 'Not found' });
    return;
  }

  const isAdmin = await verifyAdminAuth(req);
  if (!isAdmin) {
    send(res, 403, { error: 'Solo gli amministratori possono accedere' });
    return;
  }

  try {
    await ensureAdminAuth();
  } catch (e) {
    send(res, 500, { error: 'Errore autenticazione PocketBase admin' });
    return;
  }

  if (req.method === 'GET' && (path === '/api/backups' || path === '/backups')) {
    try {
      const list = await pb.backups.getFullList();
      send(res, 200, list);
    } catch (e) {
      send(res, 500, { error: e?.message || 'Errore lista backup' });
    }
    return;
  }

  if (req.method === 'POST' && (path === '/api/backups' || path === '/backups')) {
    try {
      const name = `pb_backup_${Date.now()}.zip`;
      await pb.backups.create(name);
      send(res, 200, { success: true, name });
    } catch (e) {
      send(res, 500, { error: e?.message || 'Errore creazione backup' });
    }
    return;
  }

  const downloadMatch = path.match(/^\/(?:api\/)?backups\/download\/(.+)$/);
  if (req.method === 'GET' && downloadMatch) {
    const key = decodeURIComponent(downloadMatch[1]);
    try {
      const token = await pb.files.getToken();
      const url = pb.backups.getDownloadUrl(token, key);
      send(res, 200, { url });
    } catch (e) {
      send(res, 500, { error: e?.message || 'Errore download' });
    }
    return;
  }

  if (req.method === 'GET' && path.match(/^\/(?:api\/)?backups\/info$/)) {
    try {
      const health = await fetch(`${PB_URL}/api/health`).then((r) => r.json()).catch(() => ({}));
      send(res, 200, {
        version: health?.version || '—',
        message: health?.message
      });
    } catch {
      send(res, 200, { version: '—' });
    }
    return;
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Backup API server on port ${PORT}`);
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.warn('WARNING: POCKETBASE_ADMIN_EMAIL/PASSWORD not set');
  }
});
