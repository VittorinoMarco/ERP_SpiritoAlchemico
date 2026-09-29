/**
 * Applica le API rules "hardening" alle collection PocketBase (via superuser).
 *
 * Uso:
 *   node scripts/apply-pocketbase-rules.mjs --dry-run   # mostra le differenze
 *   node scripts/apply-pocketbase-rules.mjs             # applica le regole compatibili col frontend attuale
 *   node scripts/apply-pocketbase-rules.mjs --strict    # applica ANCHE il congelamento ordini/provvigioni/storico
 *                                                       # (solo dopo il deploy del frontend aggiornato)
 *   node scripts/apply-pocketbase-rules.mjs --restore scripts/.rules-backup-<ts>.json   # rollback
 *
 * A differenza di sync-pocketbase-schema.mjs (che NON tocca regole già impostate),
 * questo script SOVRASCRIVE le regole elencate in RULES. Fa un backup JSON delle regole
 * precedenti in scripts/.rules-backup-<timestamp>.json (gitignored) per poter tornare indietro.
 *
 * Ruoli: admin | agente | magazziniere (campo `ruolo` su users).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PocketBase from 'pocketbase';

const DRY_RUN = process.argv.includes('--dry-run');
// Le regole "strict" vincolano il flusso ordini/provvigioni/storico: funzionano solo con il frontend nuovo
// (ordini sempre creati in bozza, annullo invece di eliminazione, ecc.). Vanno applicate DOPO il deploy.
const STRICT_MODE = process.argv.includes('--strict');

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

const ADMIN = '@request.auth.ruolo = "admin"';
const AGENTE = '@request.auth.ruolo = "agente"';
const MAGAZ = '@request.auth.ruolo = "magazziniere"';
const ANY_ROLE = '@request.auth.ruolo != ""';
const ME = '@request.auth.id';

/** Transizioni di stato consentite all'admin (la regola guarda lo stato attuale e quello richiesto). */
const ORDER_TRANSITION_OK =
  '(@request.body.stato:isset = false || @request.body.stato = stato || ' +
  '(stato = "bozza" && (@request.body.stato = "confermato" || @request.body.stato = "annullato")) || ' +
  '(stato = "confermato" && (@request.body.stato = "spedito" || @request.body.stato = "annullato")) || ' +
  '(stato = "spedito" && (@request.body.stato = "consegnato" || @request.body.stato = "annullato")))';

/** Fuori dalla bozza questi campi non si possono più cambiare (rettifiche = nuovo flusso, da definire). */
const ORDER_FROZEN_OK =
  '(stato = "bozza" || (@request.body.numero_ordine:isset = false && @request.body.cliente:isset = false && ' +
  '@request.body.agente:isset = false && @request.body.canale:isset = false && @request.body.totale:isset = false && ' +
  '@request.body.totale_imponibile:isset = false && @request.body.iva:isset = false && ' +
  '@request.body.iva_percentuale:isset = false && @request.body.data_ordine:isset = false))';

/** Solo i campi elencati vengono modificati. */
const RULES = {
  // Prima: `@request.auth.id = @collection.users.id` era vero per QUALSIASI utente loggato
  // → chiunque poteva leggere e modificare tutti gli utenti (anche promuoversi ad admin).
  users: {
    viewRule: `id = ${ME} || ${ADMIN}`,
    updateRule:
      `${ADMIN} || (id = ${ME} && @request.body.ruolo:isset = false && ` +
      `@request.body.provvigione_percentuale:isset = false && @request.body.agente_padre:isset = false && ` +
      `@request.body.verified:isset = false)`
  },

  // Ordini: nascono sempre "bozza"; l'admin li fa avanzare solo lungo le transizioni consentite;
  // dopo la bozza i dati economici e le parti (cliente/agente/canale/numero/totali) sono congelati.
  // Un ordine confermato non si elimina (si annulla): lo storico non si cancella.
  orders: {
    createRule:
      `(${ADMIN} && @request.body.stato = "bozza") || ` +
      `(${AGENTE} && @request.body.agente = ${ME} && @request.body.stato = "bozza" && @request.body.cliente.agente = ${ME})`,
    updateRule:
      `(${ADMIN} && ${ORDER_TRANSITION_OK} && ${ORDER_FROZEN_OK}) || ` +
      `(${AGENTE} && agente = ${ME} && stato = "bozza" && ` +
      `(@request.body.stato:isset = false || @request.body.stato = "bozza" || @request.body.stato = "annullato") && ` +
      `(@request.body.agente:isset = false || @request.body.agente = ${ME}) && ` +
      `(@request.body.cliente:isset = false || @request.body.cliente.agente = ${ME}))`,
    deleteRule:
      `(${ADMIN} && (stato = "bozza" || stato = "annullato")) || ` +
      `(${AGENTE} && agente = ${ME} && stato = "bozza")`
  },

  // Le righe seguono le regole dell'ordine padre: modificabili solo finché l'ordine è in bozza.
  order_items: {
    listRule: `${ADMIN} || ${MAGAZ} || (${AGENTE} && ordine.agente = ${ME})`,
    viewRule: `${ADMIN} || ${MAGAZ} || (${AGENTE} && ordine.agente = ${ME})`,
    createRule:
      `(${ADMIN} && @request.body.ordine.stato = "bozza") || ` +
      `(${AGENTE} && @request.body.ordine.agente = ${ME} && @request.body.ordine.stato = "bozza")`,
    updateRule:
      `(${ADMIN} && ordine.stato = "bozza") || ` +
      `(${AGENTE} && ordine.agente = ${ME} && ordine.stato = "bozza")`,
    deleteRule:
      `(${ADMIN} && (ordine.stato = "bozza" || ordine.stato = "annullato")) || ` +
      `(${AGENTE} && ordine.agente = ${ME} && ordine.stato = "bozza")`
  },

  // Le fatture non servono a magazziniere e agli agenti servono solo per i propri ordini.
  // Dopo l'emissione cambiano solo stato/data pagamento/pdf; non si eliminano (numerazione progressiva).
  invoices: {
    listRule: `${ADMIN} || (${AGENTE} && ordine.agente = ${ME})`,
    viewRule: `${ADMIN} || (${AGENTE} && ordine.agente = ${ME})`,
    updateRule:
      `${ADMIN} && @request.body.numero_fattura:isset = false && @request.body.ordine:isset = false && ` +
      `@request.body.cliente:isset = false && @request.body.totale:isset = false && ` +
      `@request.body.totale_imponibile:isset = false && @request.body.iva:isset = false && ` +
      `@request.body.data_emissione:isset = false`,
    deleteRule: null
  },

  // Un agente può creare clienti solo assegnati a sé e non può "regalarli" ad altri agenti.
  clients: {
    createRule: `${ADMIN} || (${AGENTE} && @request.body.agente = ${ME})`,
    updateRule:
      `${ADMIN} || (${AGENTE} && agente = ${ME} && ` +
      `(@request.body.agente:isset = false || @request.body.agente = ${ME}))`
  },

  // Provvigioni: importo/percentuale/base/beneficiario/ordine non si modificano mai via API.
  // Si può solo passare da maturata a liquidata/stornata; una liquidata è immutabile. Nessuna cancellazione.
  agent_commissions: {
    updateRule:
      `${ADMIN} && stato = "maturata" && @request.body.importo:isset = false && ` +
      `@request.body.percentuale:isset = false && @request.body.totale_ordine:isset = false && ` +
      `@request.body.agente:isset = false && @request.body.ordine:isset = false`,
    deleteRule: null
  },

  // Movimenti di magazzino = storico: non si cancellano; solo l'admin può correggere collegamenti.
  inventory_movements: {
    updateRule: ADMIN,
    deleteRule: null
  },

  // Ognuno vede e scrive solo il proprio log; nessuno può falsificare l'utente né riscrivere il passato.
  activity_log: {
    // `${ME} != ""` è indispensabile: senza, un anonimo (id vuoto) combacia con i log senza `utente` (webhook).
    listRule: `${ME} != "" && (${ADMIN} || utente = ${ME})`,
    viewRule: `${ME} != "" && (${ADMIN} || utente = ${ME})`,
    createRule: `${ME} != "" && @request.body.utente = ${ME}`,
    updateRule: null,
    deleteRule: null
  },

  // Storico chat: ogni utente le proprie sessioni (prima solo admin → l'assistente falliva per gli altri ruoli).
  ai_chat_sessions: {
    listRule: `${ANY_ROLE} && utente = ${ME}`,
    viewRule: `${ANY_ROLE} && utente = ${ME}`,
    createRule: `${ANY_ROLE} && @request.body.utente = ${ME}`,
    updateRule: `${ANY_ROLE} && utente = ${ME}`,
    deleteRule: `${ANY_ROLE} && utente = ${ME}`
  },

  company_profile: {
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN
  }
};

/** Regole che richiedono il frontend aggiornato (vedi STRICT_MODE). */
const STRICT_KEYS = new Set([
  'orders.createRule', 'orders.updateRule', 'orders.deleteRule',
  'order_items.createRule', 'order_items.updateRule', 'order_items.deleteRule',
  'invoices.updateRule', 'invoices.deleteRule',
  'agent_commissions.updateRule', 'agent_commissions.deleteRule',
  'inventory_movements.updateRule', 'inventory_movements.deleteRule',
  'activity_log.updateRule', 'activity_log.deleteRule'
]);

// Senza --strict: l'admin può ancora creare un ordine in qualsiasi stato (frontend produzione
// precedente). L'agente invece non può più intestare un ordine a un cliente non suo (IDOR).
if (!STRICT_MODE) {
  RULES.orders.createRule =
    `${ADMIN} || (${AGENTE} && @request.body.agente = ${ME} && @request.body.stato = "bozza" && ` +
    `@request.body.cliente.agente = ${ME})`;
  STRICT_KEYS.delete('orders.createRule');
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
try {
  await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
} catch {
  await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
}

// Rollback: node scripts/apply-pocketbase-rules.mjs --restore scripts/.rules-backup-<ts>.json
const restoreIdx = process.argv.indexOf('--restore');
if (restoreIdx !== -1) {
  const file = process.argv[restoreIdx + 1];
  const saved = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
  for (const [name, rules] of Object.entries(saved)) {
    const col = await pb.collections.getOne(name);
    console.log(`${DRY_RUN ? 'WOULD ' : ''}RESTORE ${name}: ${Object.keys(rules).join(', ')}`);
    if (!DRY_RUN) await pb.collections.update(col.id, rules);
  }
  process.exit(0);
}

const backup = {};
let changed = 0;
for (const [name, rules] of Object.entries(RULES)) {
  let col;
  try {
    col = await pb.collections.getOne(name);
  } catch {
    console.warn(`SKIP ${name}: collection assente (applica prima pb:audit-schema)`);
    continue;
  }
  const patch = {};
  for (const [k, v] of Object.entries(rules)) {
    if (STRICT_KEYS.has(`${name}.${k}`) && !STRICT_MODE) {
      console.log(`SKIP ${name}.${k} (richiede --strict: applicare dopo il deploy del frontend aggiornato)`);
      continue;
    }
    if (col[k] !== v) {
      patch[k] = v;
      (backup[name] ??= {})[k] = col[k];
      console.log(`${DRY_RUN ? 'WOULD ' : ''}SET ${name}.${k}\n   was: ${col[k]}\n   now: ${v}`);
    }
  }
  if (Object.keys(patch).length === 0) {
    console.log(`OK  ${name}`);
    continue;
  }
  changed++;
  if (!DRY_RUN) await pb.collections.update(col.id, patch);
}

if (!DRY_RUN && Object.keys(backup).length) {
  const file = resolve(process.cwd(), `scripts/.rules-backup-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\nBackup regole precedenti: ${file}`);
}
console.log(`\n${DRY_RUN ? 'Dry-run: ' : ''}${changed} collection ${DRY_RUN ? 'da modificare' : 'modificate'}.`);
