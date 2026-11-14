/**
 * Sync schema PocketBase via Admin API (superuser).
 *
 * Uso:
 *   node scripts/sync-pocketbase-schema.mjs
 *   node scripts/sync-pocketbase-schema.mjs --dry-run
 *
 * Richiede .env.local (o env di processo):
 *   POCKETBASE_URL
 *   POCKETBASE_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD
 *
 * Idempotente: crea collection mancanti e aggiunge solo campi assenti.
 * Non elimina campi esistenti.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PocketBase from 'pocketbase';

const DRY_RUN = process.argv.includes('--dry-run');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
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

const ADMIN_RULE =
  '@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.ruolo = "admin")';
const AUTH_OWN = '@request.auth.id != "" && utente = @request.auth.id';
const AUTHED = '@request.auth.id != ""';

/** @typedef {{ name: string, type: string, required?: boolean, [k: string]: unknown }} FieldDef */
/** @typedef {{
 *   name: string,
 *   type?: 'base' | 'auth' | 'view',
 *   listRule?: string | null,
 *   viewRule?: string | null,
 *   createRule?: string | null,
 *   updateRule?: string | null,
 *   deleteRule?: string | null,
 *   fields: FieldDef[],
 * }} CollectionDef */

/** @type {CollectionDef[]} */
const SCHEMA = [
  {
    name: 'orders',
    fields: [
      { name: 'totale_imponibile', type: 'number', required: false },
      { name: 'iva', type: 'number', required: false },
      { name: 'iva_percentuale', type: 'number', required: false }
    ]
  },
  {
    name: 'invoices',
    fields: [{ name: 'iva', type: 'number', required: false }]
  },
  {
    name: 'agent_commissions',
    fields: [{ name: 'totale_ordine', type: 'number', required: false }]
  },
  {
    name: 'ai_chat_sessions',
    listRule: AUTH_OWN,
    viewRule: AUTH_OWN,
    createRule: AUTH_OWN,
    updateRule: AUTH_OWN,
    deleteRule: AUTH_OWN,
    fields: [
      {
        name: 'utente',
        type: 'relation',
        required: true,
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: true
      },
      { name: 'titolo', type: 'text', required: true },
      { name: 'messaggi', type: 'json', required: true }
    ]
  },
  {
    name: 'admin_tasks',
    listRule: ADMIN_RULE,
    viewRule: ADMIN_RULE,
    createRule: ADMIN_RULE,
    updateRule: ADMIN_RULE,
    deleteRule: ADMIN_RULE,
    fields: [
      { name: 'titolo', type: 'text', required: true },
      { name: 'descrizione', type: 'editor', required: false },
      {
        name: 'stato',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['backlog', 'da_fare', 'in_corso', 'in_revisione', 'completato', 'annullato']
      },
      {
        name: 'priorita',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['bassa', 'media', 'alta', 'critica']
      },
      {
        name: 'assegnatario',
        type: 'relation',
        required: false,
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: false
      },
      {
        name: 'creato_da',
        type: 'relation',
        required: false,
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: false
      },
      { name: 'scadenza', type: 'date', required: false },
      { name: 'inizio', type: 'date', required: false },
      { name: 'etichette', type: 'json', required: false },
      { name: 'ordine_colonna', type: 'number', required: false }
      // parent (self-relation) aggiunto al secondo passaggio
    ]
  },
  {
    name: 'task_attachments',
    listRule: ADMIN_RULE,
    viewRule: ADMIN_RULE,
    createRule: ADMIN_RULE,
    updateRule: ADMIN_RULE,
    deleteRule: ADMIN_RULE,
    fields: [
      // task relation risolto dopo create di admin_tasks
      { name: 'file', type: 'file', required: true, maxSelect: 1, maxSize: 52428800, mimeTypes: [] },
      {
        name: 'caricato_da',
        type: 'relation',
        required: false,
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: false
      }
    ]
  },
  {
    name: 'note_folders',
    listRule: ADMIN_RULE,
    viewRule: ADMIN_RULE,
    createRule: ADMIN_RULE,
    updateRule: ADMIN_RULE,
    deleteRule: ADMIN_RULE,
    fields: [
      { name: 'nome', type: 'text', required: true },
      { name: 'posizione', type: 'number', required: false }
      // genitore self-relation al secondo passaggio
    ]
  },
  {
    name: 'admin_notes',
    listRule: ADMIN_RULE,
    viewRule: ADMIN_RULE,
    createRule: ADMIN_RULE,
    updateRule: ADMIN_RULE,
    deleteRule: ADMIN_RULE,
    fields: [
      { name: 'titolo', type: 'text', required: true },
      { name: 'corpo', type: 'editor', required: false },
      {
        name: 'autore',
        type: 'relation',
        required: false,
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: false
      },
      { name: 'posizione', type: 'number', required: false }
      // cartella → note_folders al secondo passaggio
    ]
  }
];

function fieldExists(fields, name) {
  return (fields || []).some((f) => f.name === name);
}

function newFieldPayload(def) {
  const { name, type, required = false, ...rest } = def;
  return { name, type, required, ...rest };
}

async function authAdmin(pb) {
  try {
    await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
    return '_superusers';
  } catch {
    await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
    return 'admins';
  }
}

async function ensureCollection(pb, def, existingByName) {
  let col = existingByName.get(def.name);
  if (!col) {
    console.log(`CREATE collection ${def.name}`);
    if (DRY_RUN) return null;
    col = await pb.collections.create({
      name: def.name,
      type: def.type || 'base',
      listRule: def.listRule ?? null,
      viewRule: def.viewRule ?? null,
      createRule: def.createRule ?? null,
      updateRule: def.updateRule ?? null,
      deleteRule: def.deleteRule ?? null,
      fields: def.fields.map(newFieldPayload)
    });
    existingByName.set(def.name, col);
    return col;
  }

  const missing = def.fields.filter((f) => !fieldExists(col.fields, f.name));
  const rulePatch = {};
  for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
    if (def[key] !== undefined && col[key] !== def[key]) {
      // Non sovrascrivere regole già settate se diverse: solo se vuote/null
      if (col[key] == null || col[key] === '') rulePatch[key] = def[key];
    }
  }

  if (missing.length === 0 && Object.keys(rulePatch).length === 0) {
    console.log(`OK      ${def.name}`);
    return col;
  }

  if (missing.length) {
    console.log(`UPDATE  ${def.name}: + ${missing.map((f) => f.name).join(', ')}`);
  }
  if (Object.keys(rulePatch).length) {
    console.log(`RULES   ${def.name}: ${Object.keys(rulePatch).join(', ')}`);
  }

  if (DRY_RUN) return col;

  col = await pb.collections.update(col.id, {
    ...rulePatch,
    fields: [...(col.fields || []), ...missing.map(newFieldPayload)]
  });
  existingByName.set(def.name, col);
  return col;
}

async function ensureRelation(pb, existingByName, collectionName, fieldDef) {
  const col = existingByName.get(collectionName);
  if (!col) return;
  if (fieldExists(col.fields, fieldDef.name)) return;
  console.log(`UPDATE  ${collectionName}: + ${fieldDef.name} (relation)`);
  if (DRY_RUN) return;
  const updated = await pb.collections.update(col.id, {
    fields: [...(col.fields || []), newFieldPayload(fieldDef)]
  });
  existingByName.set(collectionName, updated);
}

const CRM_SCALAR_FIELDS = [
  { name: 'nome', type: 'text', required: false },
  { name: 'ragione_sociale', type: 'text', required: false },
  {
    name: 'tipo',
    type: 'select',
    required: true,
    maxSelect: 1,
    values: ['ristorante', 'contatto', 'agente', 'distributore', 'sommelier', 'persona_di_spicco']
  },
  {
    name: 'stato',
    type: 'select',
    required: true,
    maxSelect: 1,
    values: ['da_contattare', 'da_chiamare', 'contattato', 'in_trattativa', 'acquisito', 'non_interessato']
  },
  { name: 'partita_iva', type: 'text', required: false },
  { name: 'codice_fiscale', type: 'text', required: false },
  { name: 'codice_sdi', type: 'text', required: false },
  { name: 'pec', type: 'text', required: false },
  { name: 'indirizzo', type: 'text', required: false },
  { name: 'citta', type: 'text', required: false },
  { name: 'provincia', type: 'text', required: false },
  { name: 'cap', type: 'text', required: false },
  { name: 'telefono', type: 'text', required: false },
  { name: 'email', type: 'text', required: false },
  { name: 'referente', type: 'text', required: false },
  { name: 'note', type: 'text', required: false },
  {
    name: 'fonte',
    type: 'select',
    required: false,
    maxSelect: 1,
    values: ['fiera', 'referral', 'sito', 'telefono', 'visita', 'social', 'altro']
  },
  { name: 'fonte_dettaglio', type: 'text', required: false },
  // Senza questi campi di sistema, sort=-created risponde 400.
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
];

const CRM_LIST_RULE =
  '@request.auth.id != "" && (@request.auth.ruolo = "admin" || (@request.auth.ruolo = "agente" && agente = @request.auth.id))';
const CRM_CREATE_RULE =
  '@request.auth.id != "" && (@request.auth.ruolo = "admin" || (@request.auth.ruolo = "agente" && @request.body.agente = @request.auth.id))';
const CRM_UPDATE_RULE =
  '@request.auth.id != "" && (@request.auth.ruolo = "admin" || (@request.auth.ruolo = "agente" && agente = @request.auth.id && (@request.body.agente:isset = false || @request.body.agente = @request.auth.id)))';

const CRM_RULES = {
  listRule: CRM_LIST_RULE,
  viewRule: CRM_LIST_RULE,
  createRule: CRM_CREATE_RULE,
  updateRule: CRM_UPDATE_RULE,
  deleteRule: CRM_LIST_RULE
};

function rulesNeedCrmLock(col) {
  return ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => {
    const value = col?.[key];
    return value == null || value === '' || value === AUTHED;
  });
}

/** Campi anagrafici usati dal passaggio CRM → cliente. Non crea la collection se manca. */
async function ensureClientHandoffFields(pb, existingByName) {
  const col = existingByName.get('clients');
  if (!col) {
    console.log('SKIP    clients: collection assente, campi handoff non aggiunti');
    return;
  }
  const extra = [
    { name: 'codice_fiscale', type: 'text', required: false },
    { name: 'referente', type: 'text', required: false }
  ];
  const missing = extra.filter((f) => !fieldExists(col.fields, f.name));
  if (!missing.length) {
    console.log('OK      clients (handoff)');
    return;
  }
  console.log(`UPDATE  clients: + ${missing.map((f) => f.name).join(', ')}`);
  if (DRY_RUN) return;
  const updated = await pb.collections.update(col.id, {
    fields: [...(col.fields || []), ...missing.map(newFieldPayload)]
  });
  existingByName.set('clients', updated);
}

/** Prospect a monte dei clienti. Regole come `clients`: admin, oppure agente sui propri record. */
async function ensureCrmCollection(pb, existingByName) {
  let col = existingByName.get('crm_contatti');
  if (!col) {
    console.log('CREATE collection crm_contatti');
    if (DRY_RUN) return;
    // Regole temporanee: quelle definitive citano `agente`, che esiste solo dopo la relation.
    col = await pb.collections.create({
      name: 'crm_contatti',
      type: 'base',
      listRule: AUTHED,
      viewRule: AUTHED,
      createRule: AUTHED,
      updateRule: AUTHED,
      deleteRule: AUTHED,
      fields: CRM_SCALAR_FIELDS.map(newFieldPayload)
    });
    existingByName.set('crm_contatti', col);
  } else {
    const missing = CRM_SCALAR_FIELDS.filter((f) => !fieldExists(col.fields, f.name));
    if (missing.length) {
      console.log(`UPDATE  crm_contatti: + ${missing.map((f) => f.name).join(', ')}`);
      if (!DRY_RUN) {
        col = await pb.collections.update(col.id, {
          fields: [...(col.fields || []), ...missing.map(newFieldPayload)]
        });
        existingByName.set('crm_contatti', col);
      }
    } else {
      console.log('OK      crm_contatti');
    }
  }

  if (DRY_RUN || !col) return;

  const clients = existingByName.get('clients');
  await ensureRelation(pb, existingByName, 'crm_contatti', {
    name: 'agente',
    type: 'relation',
    required: false,
    collectionId: '_pb_users_auth_',
    maxSelect: 1,
    cascadeDelete: false
  });
  if (clients) {
    await ensureRelation(pb, existingByName, 'crm_contatti', {
      name: 'cliente',
      type: 'relation',
      required: false,
      collectionId: clients.id,
      maxSelect: 1,
      cascadeDelete: false
    });
  } else {
    console.warn('SKIP    crm_contatti.cliente: collection clients assente');
  }
  const crm = existingByName.get('crm_contatti');
  if (crm) {
    await ensureRelation(pb, existingByName, 'crm_contatti', {
      name: 'organizzazioni',
      type: 'relation',
      required: false,
      collectionId: crm.id,
      maxSelect: 8,
      cascadeDelete: false
    });
  }

  const fresh = existingByName.get('crm_contatti');
  if (fresh && rulesNeedCrmLock(fresh)) {
    console.log('RULES   crm_contatti');
    const updated = await pb.collections.update(fresh.id, CRM_RULES);
    existingByName.set('crm_contatti', updated);
  }
}

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  console.log(`PocketBase: ${PB_URL}${DRY_RUN ? ' (dry-run)' : ''}`);
  const mode = await authAdmin(pb);
  console.log(`Auth OK (${mode})`);

  const all = await pb.collections.getFullList({ batch: 200 });
  const existingByName = new Map(all.map((c) => [c.name, c]));

  for (const def of SCHEMA) {
    await ensureCollection(pb, def, existingByName);
  }

  await ensureClientHandoffFields(pb, existingByName);
  await ensureCrmCollection(pb, existingByName);

  // Relazioni che dipendono da ID collection già create
  const tasks = existingByName.get('admin_tasks');
  const folders = existingByName.get('note_folders');

  if (tasks) {
    await ensureRelation(pb, existingByName, 'admin_tasks', {
      name: 'parent',
      type: 'relation',
      required: false,
      collectionId: tasks.id,
      maxSelect: 1,
      cascadeDelete: false
    });
    await ensureRelation(pb, existingByName, 'task_attachments', {
      name: 'task',
      type: 'relation',
      required: true,
      collectionId: tasks.id,
      maxSelect: 1,
      cascadeDelete: true
    });
  }

  if (folders) {
    await ensureRelation(pb, existingByName, 'note_folders', {
      name: 'genitore',
      type: 'relation',
      required: false,
      collectionId: folders.id,
      maxSelect: 1,
      cascadeDelete: false
    });
    await ensureRelation(pb, existingByName, 'admin_notes', {
      name: 'cartella',
      type: 'relation',
      required: false,
      collectionId: folders.id,
      maxSelect: 1,
      cascadeDelete: false
    });
  }

  // Smoke test: crea e cancella un record di prova su activity_log se esiste
  const logCol = existingByName.get('activity_log');
  if (logCol && !DRY_RUN) {
    try {
      const row = await pb.collection('activity_log').create({
        azione: 'schema_sync_smoke_test',
        collection_rif: 'system',
        record_rif: 'sync',
        dettagli: JSON.stringify({ messaggio: 'sync-pocketbase-schema ok', at: new Date().toISOString() })
      });
      await pb.collection('activity_log').delete(row.id);
      console.log('SMOKE   activity_log create/delete OK');
    } catch (e) {
      console.warn('SMOKE   activity_log saltato:', e?.message || e);
    }
  }

  console.log('Fatto.');
}

main().catch((e) => {
  console.error('ERRORE:', e?.message || e);
  if (e?.response) console.error(JSON.stringify(e.response, null, 2));
  process.exit(1);
});
