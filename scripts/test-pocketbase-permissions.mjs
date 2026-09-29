/**
 * Test delle regole API PocketBase con utenti separati (socio A/B, agente A/B, magazziniere, anonimo).
 * Verifica DIRETTAMENTE l'API (non la UI): iniezione di relazioni, cambio ruolo, modifica dei totali dopo la
 * conferma, transizioni di stato, immutabilità delle provvigioni liquidate, storico non cancellabile, ecc.
 *
 *   POCKETBASE_URL=http://127.0.0.1:8099 POCKETBASE_ADMIN_EMAIL=... POCKETBASE_ADMIN_PASSWORD=... \
 *     node scripts/test-pocketbase-permissions.mjs
 *
 * SICUREZZA: crea utenti/dati di prova (prefisso "zz-test") e li rimuove a fine test. Per evitare di sporcare
 * la produzione RIFIUTA URL non locali, salvo --allow-remote (sconsigliato: usa una copia del backup).
 *
 * Exit code 0 = tutti i test ok; 1 = almeno un test fallito.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PocketBase from 'pocketbase';

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

const URL_ = process.env.POCKETBASE_URL || '';
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PASS = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(URL_);
if (!URL_ || !EMAIL || !PASS) {
  console.error('Mancano POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}
if (!isLocal && !process.argv.includes('--allow-remote')) {
  console.error(`Rifiuto di eseguire su ${URL_}: non è locale. Usa una copia del backup (o --allow-remote a tuo rischio).`);
  process.exit(1);
}

const mk = () => {
  const c = new PocketBase(URL_);
  c.autoCancellation(false);
  return c;
};
const su = mk();
await su.collection('_superusers').authWithPassword(EMAIL, PASS);

const tag = `zz-test-${Date.now().toString(36)}`;
const PW = 'TestPassw0rd!x';
const cleanup = { users: [], clients: [], products: [], orders: [], items: [], invoices: [], commissions: [], movs: [], inv: [], logs: [] };

let passed = 0;
const failures = [];
const HTTP_DENY = [400, 403, 404];

async function expectOk(name, fn) {
  try {
    const r = await fn();
    passed++;
    console.log(`  ok   ${name}`);
    return r;
  } catch (e) {
    failures.push(`${name} → doveva riuscire, errore ${e?.status}: ${e?.response?.message || e?.message}`);
    console.log(`  FAIL ${name} (doveva riuscire: ${e?.status} ${JSON.stringify(e?.response?.data ?? {}).slice(0, 160)})`);
    return null;
  }
}
async function expectDeny(name, fn) {
  try {
    await fn();
    failures.push(`${name} → doveva essere NEGATO ma è riuscito`);
    console.log(`  FAIL ${name} (doveva essere negato)`);
  } catch (e) {
    if (HTTP_DENY.includes(e?.status)) {
      passed++;
      console.log(`  ok   ${name}  [negato ${e.status}]`);
    } else {
      failures.push(`${name} → errore inatteso ${e?.status}: ${e?.message}`);
      console.log(`  FAIL ${name} (errore inatteso ${e?.status})`);
    }
  }
}
async function expectCount(name, fn, expected) {
  try {
    const n = (await fn()).length;
    if (n === expected) {
      passed++;
      console.log(`  ok   ${name}  [${n}]`);
    } else {
      failures.push(`${name} → attesi ${expected} record, visti ${n}`);
      console.log(`  FAIL ${name} (attesi ${expected}, visti ${n})`);
    }
  } catch (e) {
    if (expected === 0 && HTTP_DENY.includes(e?.status)) {
      passed++;
      console.log(`  ok   ${name}  [negato ${e.status}]`);
    } else {
      failures.push(`${name} → errore ${e?.status}`);
      console.log(`  FAIL ${name} (errore ${e?.status})`);
    }
  }
}

async function mkUser(ruolo, label, pct = 0) {
  const email = `${tag}-${label}@example.test`;
  const u = await su.collection('users').create({
    email, password: PW, passwordConfirm: PW, emailVisibility: true, verified: true,
    nome: `${tag}-${label}`, cognome: 'Test', ruolo, provvigione_percentuale: pct
  });
  cleanup.users.push(u.id);
  const c = mk();
  await c.collection('users').authWithPassword(email, PW);
  return { id: u.id, pb: c };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
let seq = 0;
const num = (p) => `${tag}-${p}-${++seq}`;

try {
  console.log(`Target: ${URL_}  (tag ${tag})\n`);

  const socioA = await mkUser('admin', 'socioA');
  const socioB = await mkUser('admin', 'socioB');
  const agA = await mkUser('agente', 'agenteA', 10);
  const agB = await mkUser('agente', 'agenteB', 8);
  const mag = await mkUser('magazziniere', 'mag');
  const anon = mk();

  const prod = await su.collection('products').create({
    nome: `${tag}-prodotto`, sku: `${tag}-sku`, categoria: 'amaro',
    prezzo_listino: 30, prezzo_horeca: 20, prezzo_ecommerce: 30, attivo: true
  });
  cleanup.products.push(prod.id);
  const inv = await su.collection('inventory').create({ prodotto: prod.id, giacenza: 100, giacenza_minima: 0 });
  cleanup.inv.push(inv.id);
  const cliA = await su.collection('clients').create({ ragione_sociale: `${tag}-clienteA`, agente: agA.id });
  const cliB = await su.collection('clients').create({ ragione_sociale: `${tag}-clienteB`, agente: agB.id });
  cleanup.clients.push(cliA.id, cliB.id);

  // ---------------------------------------------------------------- ANONIMO
  console.log('ANONIMO');
  for (const col of ['orders', 'order_items', 'clients', 'invoices', 'agent_commissions', 'activity_log', 'users', 'products', 'inventory', 'expenses']) {
    await expectCount(`anonimo non vede ${col}`, () => anon.collection(col).getFullList(), 0);
  }
  await expectDeny('anonimo non crea ordini', () => anon.collection('orders').create({ numero_ordine: num('anon'), cliente: cliA.id, stato: 'bozza' }));

  // ------------------------------------------------------------------ AGENTE
  console.log('\nAGENTE A');
  // ordine di B creato dal superuser: A non deve vederlo
  const ordB = await su.collection('orders').create({ numero_ordine: num('B'), cliente: cliB.id, agente: agB.id, stato: 'bozza', canale: 'horeca', totale: 10 });
  cleanup.orders.push(ordB.id);

  const ordA = await expectOk('agente A crea bozza per il proprio cliente', () =>
    agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 40, totale_imponibile: 40 }));
  if (ordA) cleanup.orders.push(ordA.id);
  await expectDeny('agente A NON crea ordine su cliente di B (iniezione relazione)', () =>
    agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliB.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 1 }));
  await expectDeny('agente A NON crea ordine a nome di B', () =>
    agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliA.id, agente: agB.id, stato: 'bozza', canale: 'horeca', totale: 1 }));
  await expectDeny('agente A NON crea ordine già confermato', () =>
    agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliA.id, agente: agA.id, stato: 'confermato', canale: 'horeca', totale: 1 }));
  const itA = await expectOk('agente A aggiunge righe alla propria bozza', () =>
    agA.pb.collection('order_items').create({ ordine: ordA.id, prodotto: prod.id, quantita: 2, prezzo_unitario: 20, sconto_percentuale: 0, totale_riga: 40 }));
  if (itA) cleanup.items.push(itA.id);
  await expectDeny('agente A NON aggiunge righe all\'ordine di B', () =>
    agA.pb.collection('order_items').create({ ordine: ordB.id, prodotto: prod.id, quantita: 1, prezzo_unitario: 1, totale_riga: 1 }));
  await expectCount('agente A vede solo i propri ordini', () => agA.pb.collection('orders').getFullList({ filter: `numero_ordine ~ "${tag}"` }), 1);
  await expectDeny('agente A NON vede l\'ordine di B', () => agA.pb.collection('orders').getOne(ordB.id));
  await expectDeny('agente A NON conferma la bozza', () => agA.pb.collection('orders').update(ordA.id, { stato: 'confermato' }));
  await expectDeny('agente A NON riassegna la bozza a B', () => agA.pb.collection('orders').update(ordA.id, { agente: agB.id }));
  await expectDeny('agente A NON sposta la bozza su cliente di B', () => agA.pb.collection('orders').update(ordA.id, { cliente: cliB.id }));
  await expectCount('agente A vede solo i propri clienti', () => agA.pb.collection('clients').getFullList({ filter: `ragione_sociale ~ "${tag}"` }), 1);
  await expectOk('agente A modifica note del proprio cliente', () => agA.pb.collection('clients').update(cliA.id, { note: 'visita fatta' }));
  await expectDeny('agente A NON "regala" il cliente a B', () => agA.pb.collection('clients').update(cliA.id, { agente: agB.id }));
  await expectDeny('agente A NON modifica il cliente di B', () => agA.pb.collection('clients').update(cliB.id, { note: 'x' }));
  await expectDeny('agente A NON cambia il proprio ruolo', () => agA.pb.collection('users').update(agA.id, { ruolo: 'admin' }));
  await expectDeny('agente A NON cambia la propria percentuale', () => agA.pb.collection('users').update(agA.id, { provvigione_percentuale: 50 }));
  await expectDeny('agente A NON legge gli utenti degli altri', () => agA.pb.collection('users').getOne(agB.id));
  await expectDeny('agente A NON scrive giacenze', () => agA.pb.collection('inventory').update(inv.id, { giacenza: 9999 }));
  await expectDeny('agente A NON crea movimenti', () => agA.pb.collection('inventory_movements').create({ prodotto: prod.id, tipo: 'carico', quantita: 5 }));
  await expectDeny('agente A NON crea provvigioni', () => agA.pb.collection('agent_commissions').create({ agente: agA.id, ordine: ordA.id, percentuale: 100, importo: 999, stato: 'maturata' }));
  await expectDeny('agente A NON crea fatture', () => agA.pb.collection('invoices').create({ numero_fattura: num('F'), ordine: ordA.id, cliente: cliA.id, totale: 1 }));
  await expectDeny('agente A NON modifica prodotti/prezzi', () => agA.pb.collection('products').update(prod.id, { prezzo_listino: 1 }));
  await expectDeny('agente A NON crea log a nome di B', () => agA.pb.collection('activity_log').create({ utente: agB.id, azione: 'x', collection_rif: 'orders' }));
  const logA = await expectOk('agente A scrive il proprio log', () => agA.pb.collection('activity_log').create({ utente: agA.id, azione: 'test', collection_rif: 'orders' }));
  if (logA) cleanup.logs.push(logA.id);
  if (logA) await expectDeny('agente A NON riscrive il proprio log', () => agA.pb.collection('activity_log').update(logA.id, { azione: 'falso' }));
  const ordA2 = await agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 1 }).catch(() => null);
  if (ordA2) {
    cleanup.orders.push(ordA2.id);
    await expectOk('agente A annulla la propria bozza', () => agA.pb.collection('orders').update(ordA2.id, { stato: 'annullato' }));
  }
  const ordA3 = await agA.pb.collection('orders').create({ numero_ordine: num('A'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 1 }).catch(() => null);
  if (ordA3) {
    await expectOk('agente A elimina la propria bozza (rollback creazione)', () => agA.pb.collection('orders').delete(ordA3.id));
  }

  // ------------------------------------------------------------------- SOCIO
  console.log('\nSOCIO (admin)');
  await expectCount('socio B vede tutti gli ordini di test', () => socioB.pb.collection('orders').getFullList({ filter: `numero_ordine ~ "${tag}"` }), cleanup.orders.length);
  const o = await expectOk('socio A crea bozza', () =>
    socioA.pb.collection('orders').create({ numero_ordine: num('S'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 122, totale_imponibile: 100, iva: 22, iva_percentuale: 22, data_ordine: '2026-09-29' }));
  cleanup.orders.push(o.id);
  await expectDeny('numero ordine duplicato rifiutato (indice univoco)', () =>
    socioA.pb.collection('orders').create({ numero_ordine: o.numero_ordine, cliente: cliA.id, stato: 'bozza', canale: 'horeca', totale: 1 }));
  await expectDeny('socio NON crea ordine direttamente confermato', () =>
    socioA.pb.collection('orders').create({ numero_ordine: num('S'), cliente: cliA.id, stato: 'confermato', canale: 'horeca', totale: 1 }));
  const oi = await expectOk('socio aggiunge riga alla bozza', () =>
    socioA.pb.collection('order_items').create({ ordine: o.id, prodotto: prod.id, quantita: 5, prezzo_unitario: 20, sconto_percentuale: 0, totale_riga: 100 }));
  cleanup.items.push(oi.id);
  await expectOk('socio modifica la riga in bozza', () => socioA.pb.collection('order_items').update(oi.id, { quantita: 5, totale_riga: 100 }));
  await expectDeny('transizione saltata bozza → spedito rifiutata', () => socioA.pb.collection('orders').update(o.id, { stato: 'spedito' }));
  await expectOk('bozza → confermato', () => socioB.pb.collection('orders').update(o.id, { stato: 'confermato' }));
  await expectDeny('confermato → consegnato (salto) rifiutato', () => socioA.pb.collection('orders').update(o.id, { stato: 'consegnato' }));
  await expectDeny('dopo la conferma il totale è congelato', () => socioA.pb.collection('orders').update(o.id, { totale: 1 }));
  await expectDeny('dopo la conferma il cliente è congelato', () => socioA.pb.collection('orders').update(o.id, { cliente: cliB.id }));
  await expectDeny('dopo la conferma l\'agente è congelato', () => socioA.pb.collection('orders').update(o.id, { agente: agB.id }));
  await expectDeny('dopo la conferma il numero ordine è congelato', () => socioA.pb.collection('orders').update(o.id, { numero_ordine: num('X') }));
  await expectOk('dopo la conferma si può aggiornare il DDT', () => socioA.pb.collection('orders').update(o.id, { ddt_numero: 'DDT-1' }));
  await expectDeny('righe di ordine confermato non modificabili', () => socioA.pb.collection('order_items').update(oi.id, { prezzo_unitario: 1, totale_riga: 5 }));
  await expectDeny('righe di ordine confermato non aggiungibili', () =>
    socioA.pb.collection('order_items').create({ ordine: o.id, prodotto: prod.id, quantita: 1, prezzo_unitario: 1, totale_riga: 1 }));
  await expectDeny('righe di ordine confermato non eliminabili', () => socioA.pb.collection('order_items').delete(oi.id));
  await expectDeny('ordine confermato non eliminabile', () => socioA.pb.collection('orders').delete(o.id));
  await expectOk('confermato → spedito', () => socioA.pb.collection('orders').update(o.id, { stato: 'spedito' }));

  // provvigioni
  const comm = await expectOk('socio crea provvigione (10% di 100 = 10)', () =>
    socioA.pb.collection('agent_commissions').create({ agente: agA.id, ordine: o.id, totale_ordine: 100, percentuale: 10, importo: round2(100 * 0.1), stato: 'maturata', data_maturata: '2026-09-29' }));
  if (comm) cleanup.commissions.push(comm.id);
  await expectDeny('doppia provvigione stesso ordine/agente rifiutata (indice univoco)', () =>
    socioA.pb.collection('agent_commissions').create({ agente: agA.id, ordine: o.id, totale_ordine: 100, percentuale: 10, importo: 10, stato: 'maturata' }));
  await expectDeny('importo provvigione non modificabile via API', () => socioA.pb.collection('agent_commissions').update(comm.id, { importo: 999 }));
  await expectDeny('percentuale provvigione non modificabile via API', () => socioA.pb.collection('agent_commissions').update(comm.id, { percentuale: 99 }));
  await expectDeny('beneficiario provvigione non modificabile via API', () => socioA.pb.collection('agent_commissions').update(comm.id, { agente: agB.id }));
  await expectDeny('provvigione non eliminabile', () => socioA.pb.collection('agent_commissions').delete(comm.id));
  await expectCount('agente A vede la propria provvigione', () => agA.pb.collection('agent_commissions').getFullList({ filter: `ordine = "${o.id}"` }), 1);
  await expectCount('agente B NON vede la provvigione di A', () => agB.pb.collection('agent_commissions').getFullList({ filter: `ordine = "${o.id}"` }), 0);
  await expectOk('maturata → liquidata', () => socioA.pb.collection('agent_commissions').update(comm.id, { stato: 'liquidata', data_liquidazione: '2026-09-30' }));
  await expectDeny('liquidata immutabile (stato)', () => socioA.pb.collection('agent_commissions').update(comm.id, { stato: 'stornata' }));
  await expectDeny('liquidata immutabile (data)', () => socioA.pb.collection('agent_commissions').update(comm.id, { data_liquidazione: '2026-01-01' }));

  await expectOk('spedito → consegnato', () => socioA.pb.collection('orders').update(o.id, { stato: 'consegnato' }));
  await expectDeny('consegnato → annullato rifiutato (serve flusso reso)', () => socioA.pb.collection('orders').update(o.id, { stato: 'annullato' }));

  // fattura
  const invc = await expectOk('socio emette fattura', () =>
    socioA.pb.collection('invoices').create({ numero_fattura: num('FAT'), ordine: o.id, cliente: cliA.id, data_emissione: '2026-09-29', totale_imponibile: 100, iva: 22, totale: 122, stato: 'emessa' }));
  if (invc) {
    cleanup.invoices.push(invc.id);
    await expectDeny('numero fattura duplicato rifiutato', () =>
      socioA.pb.collection('invoices').create({ numero_fattura: invc.numero_fattura, ordine: o.id, cliente: cliA.id, totale: 1 }));
    await expectDeny('importo fattura non modificabile', () => socioA.pb.collection('invoices').update(invc.id, { totale: 1 }));
    await expectDeny('numero fattura non modificabile', () => socioA.pb.collection('invoices').update(invc.id, { numero_fattura: num('ALTRO') }));
    await expectOk('fattura → pagata', () => socioA.pb.collection('invoices').update(invc.id, { stato: 'pagata', data_pagamento: '2026-10-05' }));
    await expectDeny('fattura non eliminabile', () => socioA.pb.collection('invoices').delete(invc.id));
    await expectCount('agente A vede la fattura del proprio ordine', () => agA.pb.collection('invoices').getFullList({ filter: `id = "${invc.id}"` }), 1);
    await expectCount('agente B NON vede la fattura di A', () => agB.pb.collection('invoices').getFullList({ filter: `id = "${invc.id}"` }), 0);
    await expectCount('magazziniere NON vede fatture', () => mag.pb.collection('invoices').getFullList({ filter: `id = "${invc.id}"` }), 0);
  }

  // annullamento: bozza→annullato→eliminazione; conferma→annullato
  const o2 = await socioA.pb.collection('orders').create({ numero_ordine: num('S'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 10 });
  cleanup.orders.push(o2.id);
  const o2i = await socioA.pb.collection('order_items').create({ ordine: o2.id, prodotto: prod.id, quantita: 1, prezzo_unitario: 10, totale_riga: 10 });
  await socioA.pb.collection('orders').update(o2.id, { stato: 'confermato' });
  await expectOk('confermato → annullato', () => socioA.pb.collection('orders').update(o2.id, { stato: 'annullato' }));
  await expectDeny('annullato è terminale (→ confermato rifiutato)', () => socioA.pb.collection('orders').update(o2.id, { stato: 'confermato' }));
  await expectOk('righe di ordine annullato eliminabili', () => socioA.pb.collection('order_items').delete(o2i.id));
  await expectOk('ordine annullato eliminabile', () => socioA.pb.collection('orders').delete(o2.id));
  const o3 = await socioA.pb.collection('orders').create({ numero_ordine: num('S'), cliente: cliA.id, agente: agA.id, stato: 'bozza', canale: 'horeca', totale: 10 });
  cleanup.orders.push(o3.id);
  await socioA.pb.collection('orders').update(o3.id, { stato: 'confermato' });
  await socioA.pb.collection('orders').update(o3.id, { stato: 'spedito' });
  const comm3 = await socioA.pb.collection('agent_commissions').create({ agente: agA.id, ordine: o3.id, totale_ordine: 10, percentuale: 10, importo: 1, stato: 'maturata' });
  cleanup.commissions.push(comm3.id);
  await expectOk('spedito → annullato', () => socioA.pb.collection('orders').update(o3.id, { stato: 'annullato' }));
  await expectOk('maturata → stornata con motivo', () => socioA.pb.collection('agent_commissions').update(comm3.id, { stato: 'stornata', data_storno: '2026-09-29', motivo_storno: 'test' }));
  await expectDeny('stornata è terminale', () => socioA.pb.collection('agent_commissions').update(comm3.id, { stato: 'maturata' }));

  // movimenti e log
  const mv = await expectOk('socio registra un movimento', () => socioA.pb.collection('inventory_movements').create({ prodotto: prod.id, tipo: 'carico', quantita: 3, causale: 'test' }));
  if (mv) {
    cleanup.movs.push(mv.id);
    await expectDeny('movimento non eliminabile', () => socioA.pb.collection('inventory_movements').delete(mv.id));
  }
  const lg = await expectOk('socio scrive log', () => socioA.pb.collection('activity_log').create({ utente: socioA.id, azione: 'test_audit', collection_rif: 'orders' }));
  if (lg) {
    cleanup.logs.push(lg.id);
    await expectDeny('log non modificabile nemmeno dal socio', () => socioA.pb.collection('activity_log').update(lg.id, { azione: 'falso' }));
    await expectDeny('log non eliminabile nemmeno dal socio', () => socioA.pb.collection('activity_log').delete(lg.id));
    await expectCount('agente A NON vede il log del socio', () => agA.pb.collection('activity_log').getFullList({ filter: `id = "${lg.id}"` }), 0);
  }
  await expectOk('socio cambia la % provvigione di un agente', () => socioA.pb.collection('users').update(agB.id, { provvigione_percentuale: 9 }));

  // -------------------------------------------------------------- MAGAZZINIERE
  console.log('\nMAGAZZINIERE');
  await expectCount('magazziniere vede gli ordini (da preparare)', () => mag.pb.collection('orders').getFullList({ filter: `id = "${o.id}"` }), 1);
  await expectDeny('magazziniere NON modifica ordini', () => mag.pb.collection('orders').update(o.id, { ddt_numero: 'X' }));
  await expectDeny('magazziniere NON crea ordini', () => mag.pb.collection('orders').create({ numero_ordine: num('M'), cliente: cliA.id, stato: 'bozza', canale: 'horeca', totale: 1 }));
  await expectCount('magazziniere NON vede provvigioni', () => mag.pb.collection('agent_commissions').getFullList(), 0);
  await expectCount('magazziniere NON vede utenti altrui', () => mag.pb.collection('users').getFullList({ filter: `id = "${agA.id}"` }), 0);
  await expectCount('magazziniere NON vede clienti', () => mag.pb.collection('clients').getFullList({ filter: `ragione_sociale ~ "${tag}"` }), 0);
  await expectOk('magazziniere aggiorna la giacenza', () => mag.pb.collection('inventory').update(inv.id, { giacenza: 100 }));

  // ---------------------------------------------------------------- ATOMICITÀ
  console.log('\nGIACENZA (modificatori atomici)');
  await su.collection('inventory').update(inv.id, { giacenza: 100 });
  for (let i = 0; i < 5; i++) await su.collection('inventory').update(inv.id, { 'giacenza-': 3 });
  const seqv = await su.collection('inventory').getOne(inv.id);
  if (seqv.giacenza === 85) {
    passed++;
    console.log('  ok   5 scarichi sequenziali da 3 su 100 → 85');
  } else {
    failures.push(`scarichi sequenziali: attesi 85, ottenuti ${seqv.giacenza}`);
    console.log(`  FAIL scarichi sequenziali: ${seqv.giacenza} invece di 85`);
  }
  await su.collection('inventory').update(inv.id, { 'giacenza-': 90 });
  const neg = await su.collection('inventory').getOne(inv.id);
  if (neg.giacenza === -5) {
    passed++;
    console.log('  ok   vendita in eccedenza → giacenza -5 (visibile, non azzerata)');
  } else {
    failures.push(`giacenza negativa non ammessa: ${neg.giacenza}`);
    console.log(`  FAIL giacenza negativa: ${neg.giacenza}`);
  }
  // Limite NOTO (non è un fallimento): PocketBase non blocca gli aggiornamenti simultanei dello stesso record.
  await su.collection('inventory').update(inv.id, { giacenza: 100 });
  await Promise.all(Array.from({ length: 20 }, () => su.collection('inventory').update(inv.id, { 'giacenza-': 3 })));
  const conc = await su.collection('inventory').getOne(inv.id);
  console.log(`  info 20 scarichi simultanei da 3 su 100: atteso 40, ottenuto ${conc.giacenza}${conc.giacenza === 40 ? '' : '  ← LIMITE NOTO: aggiornamenti persi (serve hook server/transazione)'}`);
} finally {
  // pulizia con superuser (le regole non si applicano)
  const del = async (col, ids) => { for (const id of ids) await su.collection(col).delete(id).catch(() => {}); };
  await del('activity_log', cleanup.logs);
  await del('agent_commissions', cleanup.commissions);
  await del('invoices', cleanup.invoices);
  await del('order_items', cleanup.items);
  // righe/movimenti creati da altri path
  const rest = await su.collection('order_items').getFullList({ filter: `ordine.numero_ordine ~ "${tag}"` }).catch(() => []);
  await del('order_items', rest.map((r) => r.id));
  const mvs = await su.collection('inventory_movements').getFullList({ filter: `prodotto.sku ~ "${tag}"` }).catch(() => []);
  await del('inventory_movements', mvs.map((r) => r.id));
  const ords = await su.collection('orders').getFullList({ filter: `numero_ordine ~ "${tag}"` }).catch(() => []);
  await del('orders', ords.map((r) => r.id));
  await del('inventory', cleanup.inv);
  await del('clients', cleanup.clients);
  await del('products', cleanup.products);
  const logs = await su.collection('activity_log').getFullList({ filter: `azione = "test" || azione = "test_audit"` }).catch(() => []);
  await del('activity_log', logs.map((r) => r.id));
  await del('users', cleanup.users);
}

console.log(`\n${passed} test ok, ${failures.length} falliti`);
if (failures.length) {
  console.log('\nFALLITI:');
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
