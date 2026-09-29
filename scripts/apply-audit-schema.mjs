/**
 * Modifiche di schema NON distruttive emerse dall'audit dei processi (2026-09).
 * Idempotente: si può rilanciare senza effetti collaterali.
 *
 *   node scripts/apply-audit-schema.mjs --dry-run
 *   node scripts/apply-audit-schema.mjs
 *
 * Per provarlo su una copia locale (consigliato prima di produzione):
 *   POCKETBASE_URL=http://127.0.0.1:8099 POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... node scripts/apply-audit-schema.mjs
 *
 * Cosa fa:
 *  1. agent_commissions: nuovo stato `stornata` + campi `data_storno`, `motivo_storno`
 *  2. indici UNIQUE: orders.numero_ordine, invoices.numero_fattura, agent_commissions(ordine, agente)
 *     (controlla prima che non esistano duplicati, altrimenti salta l'indice e lo segnala)
 *  3. indici di performance: order_items(ordine), orders(cliente), orders(agente), inventory(prodotto),
 *     inventory_movements(prodotto), invoices(cliente)
 *  4. backup automatico giornaliero PocketBase (cron 03:00, ultimi 7) se non già configurato
 *
 * Rollback: gli indici si rimuovono da Dashboard → Collection → Indexes; lo stato `stornata` può restare;
 * il backup cron si toglie da Dashboard → Settings → Backups.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PocketBase from 'pocketbase';

const DRY_RUN = process.argv.includes('--dry-run');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
}
loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

const PB_URL = process.env.POCKETBASE_URL || process.env.PUBLIC_POCKETBASE_URL || '';
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';
if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Mancano POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
try {
  await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
} catch {
  await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
}
console.log(`Target: ${PB_URL}${DRY_RUN ? '  (dry-run)' : ''}\n`);

const log = (m) => console.log(`${DRY_RUN ? 'WOULD ' : ''}${m}`);

/** Restituisce true se l'indice esiste già (confronto sul nome). */
const hasIndex = (col, name) => (col.indexes || []).some((i) => i.includes(`\`${name}\``) || i.includes(` ${name} `));

async function ensureIndex(colName, name, columns, { unique = false, where = '' } = {}) {
  const col = await pb.collections.getOne(colName);
  if (hasIndex(col, name)) {
    console.log(`OK   index ${name}`);
    return;
  }
  if (unique) {
    // controllo duplicati prima di imporre l'unicità
    const cols = columns.split(',').map((c) => c.trim());
    const rows = await pb.collection(colName).getFullList({ fields: cols.join(',') });
    const seen = new Set();
    for (const r of rows) {
      const key = cols.map((c) => r[c] ?? '').join('|');
      if (cols.every((c) => !r[c])) continue;
      if (seen.has(key)) {
        console.warn(`SKIP index ${name}: esistono duplicati (${key}). Risolvi i duplicati e rilancia.`);
        return;
      }
      seen.add(key);
    }
  }
  const sql =
    `CREATE ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` ON \`${colName}\` (${columns
      .split(',')
      .map((c) => `\`${c.trim()}\``)
      .join(', ')})` + (where ? ` WHERE ${where}` : '');
  log(`ADD  ${sql}`);
  if (!DRY_RUN) await pb.collections.update(col.id, { indexes: [...(col.indexes || []), sql] });
}

// 1) agent_commissions: stato `stornata` + campi di storno
{
  const col = await pb.collections.getOne('agent_commissions');
  const fields = JSON.parse(JSON.stringify(col.fields || col.schema));
  let dirty = false;
  const stato = fields.find((f) => f.name === 'stato');
  if (stato && !stato.values.includes('stornata')) {
    stato.values.push('stornata');
    dirty = true;
    log('ADD  agent_commissions.stato += stornata');
  }
  for (const [name, type] of [['data_storno', 'date'], ['motivo_storno', 'text']]) {
    if (!fields.some((f) => f.name === name)) {
      fields.push({ name, type, required: false });
      dirty = true;
      log(`ADD  agent_commissions.${name} (${type})`);
    }
  }
  if (dirty && !DRY_RUN) await pb.collections.update(col.id, { fields });
  if (!dirty) console.log('OK   agent_commissions stornata/campi storno');
}

// 2) unicità
await ensureIndex('orders', 'idx_orders_numero_ordine_uq', 'numero_ordine', { unique: true, where: "`numero_ordine` != ''" });
await ensureIndex('invoices', 'idx_invoices_numero_fattura_uq', 'numero_fattura', { unique: true, where: "`numero_fattura` != ''" });
await ensureIndex('agent_commissions', 'idx_commissions_ordine_agente_uq', 'ordine,agente', { unique: true });

// 3) performance
await ensureIndex('order_items', 'idx_order_items_ordine', 'ordine');
await ensureIndex('orders', 'idx_orders_cliente', 'cliente');
await ensureIndex('orders', 'idx_orders_agente', 'agente');
await ensureIndex('inventory', 'idx_inventory_prodotto', 'prodotto');
await ensureIndex('inventory_movements', 'idx_inv_mov_prodotto', 'prodotto');
await ensureIndex('invoices', 'idx_invoices_cliente', 'cliente');
await ensureIndex('products', 'idx_products_sku_uq', 'sku', { unique: true, where: "`sku` != ''" });

// 4) backup automatici giornalieri
{
  const s = await pb.settings.getAll();
  if (!s.backups?.cron) {
    log('SET  settings.backups.cron = "0 3 * * *", cronMaxKeep = 7');
    if (!DRY_RUN) await pb.settings.update({ backups: { ...(s.backups || {}), cron: '0 3 * * *', cronMaxKeep: 7 } });
  } else {
    console.log(`OK   backups cron già impostato (${s.backups.cron})`);
  }
}

async function ensureField(colName, def) {
  const col = await pb.collections.getOne(colName);
  const fields = JSON.parse(JSON.stringify(col.fields || col.schema || []));
  if (fields.some((f) => f.name === def.name)) {
    console.log(`OK   ${colName}.${def.name}`);
    return col;
  }
  fields.push(def);
  log(`ADD  ${colName}.${def.name} (${def.type})`);
  if (!DRY_RUN) return pb.collections.update(col.id, { fields });
  return col;
}

async function ensureSelectValues(colName, fieldName, extra) {
  const col = await pb.collections.getOne(colName);
  const fields = JSON.parse(JSON.stringify(col.fields || col.schema || []));
  const f = fields.find((x) => x.name === fieldName);
  if (!f || f.type !== 'select') {
    console.warn(`SKIP ${colName}.${fieldName}: non è select`);
    return;
  }
  const values = f.values || [];
  let dirty = false;
  for (const v of extra) {
    if (!values.includes(v)) {
      values.push(v);
      dirty = true;
    }
  }
  if (!dirty) {
    console.log(`OK   ${colName}.${fieldName} values`);
    return;
  }
  f.values = values;
  log(`ADD  ${colName}.${fieldName} values += ${extra.join(', ')}`);
  if (!DRY_RUN) await pb.collections.update(col.id, { fields });
}

// 5) backup puntuale prima delle nuove collection
{
  const name = `pre-prod-processi-${new Date().toISOString().slice(0, 10)}.zip`;
  log(`BACKUP ${name}`);
  if (!DRY_RUN) {
    try {
      await pb.backups.create(name);
      console.log(`OK   backup ${name}`);
    } catch (e) {
      console.warn('WARN backup API:', e?.message || e);
    }
  }
}

// 6) users.agente_padre (piramide)
{
  const users = await pb.collections.getOne('users');
  await ensureField('users', {
    name: 'agente_padre',
    type: 'relation',
    required: false,
    collectionId: users.id,
    maxSelect: 1,
    cascadeDelete: false
  });
}

// 7) lotti su movimenti e giacenza
await ensureField('inventory_movements', { name: 'lotto_interno', type: 'text', required: false });
await ensureField('inventory_movements', { name: 'lotto_dogana', type: 'text', required: false });
await ensureField('inventory', { name: 'lotto_dogana', type: 'text', required: false });

// 8) invoices: proforma + origine
await ensureSelectValues('invoices', 'stato', ['convertita']);
await ensureField('invoices', {
  name: 'tipo',
  type: 'select',
  required: false,
  maxSelect: 1,
  values: ['proforma', 'fattura']
});
{
  const invCol = await pb.collections.getOne('invoices');
  await ensureField('invoices', {
    name: 'proforma_origine',
    type: 'relation',
    required: false,
    collectionId: invCol.id,
    maxSelect: 1,
    cascadeDelete: false
  });
}

// 9) company_profile
{
  const ADMIN_RULE = '@request.auth.ruolo = "admin"';
  let col;
  try {
    col = await pb.collections.getOne('company_profile');
    console.log('OK   collection company_profile');
  } catch {
    log('CREATE collection company_profile');
    if (!DRY_RUN) {
      col = await pb.collections.create({
        name: 'company_profile',
        type: 'base',
        listRule: ADMIN_RULE,
        viewRule: ADMIN_RULE,
        createRule: ADMIN_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
        fields: [
          { name: 'ragione_sociale', type: 'text', required: false },
          { name: 'partita_iva', type: 'text', required: false },
          { name: 'codice_fiscale', type: 'text', required: false },
          { name: 'regime_fiscale', type: 'text', required: false },
          { name: 'indirizzo', type: 'text', required: false },
          { name: 'citta', type: 'text', required: false },
          { name: 'cap', type: 'text', required: false },
          { name: 'provincia', type: 'text', required: false },
          { name: 'pec', type: 'email', required: false },
          { name: 'codice_sdi', type: 'text', required: false },
          { name: 'iban', type: 'text', required: false },
          { name: 'telefono', type: 'text', required: false },
          { name: 'email', type: 'email', required: false }
        ]
      });
    }
  }
  if (col && !DRY_RUN) {
    const existing = await pb.collection('company_profile').getList(1, 1);
    if (existing.totalItems === 0) {
      await pb.collection('company_profile').create({ ragione_sociale: 'Spirito Alchemico' });
      console.log('SEED  company_profile');
    }
  }
}

// 10) inventory a 0 per SKU senza riga (non tocca giacenze esistenti)
if (!DRY_RUN) {
  const products = await pb.collection('products').getFullList({ fields: 'id,nome,sku' });
  for (const p of products) {
    const inv = await pb.collection('inventory').getList(1, 1, { filter: `prodotto = "${p.id}"` });
    if (inv.totalItems === 0) {
      await pb.collection('inventory').create({ prodotto: p.id, giacenza: 0, giacenza_minima: 0 });
      console.log(`SEED  inventory 0 per ${p.sku || p.nome}`);
    }
  }
}

console.log('\nFatto.');
