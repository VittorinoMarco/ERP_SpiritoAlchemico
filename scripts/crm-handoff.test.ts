import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClientePayload,
  cambiaStatoCrm,
  clientTipoFor,
  unknownFieldNames,
  validateCrmForm
} from '../src/lib/utils/crm.ts';

function form(overrides = {}) {
  return {
    nome: '',
    ragione_sociale: 'Osteria del Porto S.r.l.',
    tipo: 'ristorante',
    stato: 'da_contattare',
    partita_iva: 'IT12345678901',
    codice_fiscale: '12345678901',
    codice_sdi: 'ABC1234',
    pec: 'osteria@pec.it',
    indirizzo: 'Via Roma 1',
    citta: 'Milano',
    provincia: 'mi',
    cap: '20100',
    telefono: '021234567',
    email: 'info@osteria.it',
    referente: 'Giulia Neri',
    note: 'Tavoli fuori',
    fonte: 'fiera',
    fonte_dettaglio: 'Vinitaly',
    organizzazioni: [],
    agente: 'agente-1',
    ...overrides
  };
}

function memory() {
  const prospects = new Map();
  const clients = [];
  return {
    prospects,
    clients,
    gateway() {
      return {
        creates: 0,
        async reload(recordId) {
          const row = prospects.get(recordId);
          if (!row) throw new Error('missing');
          return { ...row };
        },
        async save(recordId, patch) {
          const row = { ...prospects.get(recordId), ...patch };
          prospects.set(recordId, row);
          return { ...row };
        },
        async findClient(clientId) {
          return clients.find((row) => row.id === clientId) ?? null;
        },
        async findClientByPiva(piva) {
          return clients.find((row) => row.partita_iva === piva) ?? null;
        },
        async createClient(data) {
          this.creates += 1;
          const row = { id: `cli-${clients.length + 1}`, ...data };
          clients.push(row);
          return { id: row.id };
        }
      };
    }
  };
}

test('validazione anagrafica italiana', () => {
  assert.deepEqual(validateCrmForm(form()), {});
  assert.equal(validateCrmForm(form({ ragione_sociale: '  ' })).ragione_sociale, 'Ragione sociale obbligatoria');
  assert.ok(validateCrmForm(form({ tipo: 'sommelier', nome: '', ragione_sociale: '' })).nome);
  assert.equal(validateCrmForm(form({ email: 'nope' })).email, 'Email non valida');
  assert.equal(validateCrmForm(form({ pec: 'nope' })).pec, 'PEC non valida');
  assert.equal(validateCrmForm(form({ codice_sdi: 'AB' })).codice_sdi, 'Il codice SDI ha 7 caratteri');
  assert.equal(validateCrmForm(form({ partita_iva: '123' })).partita_iva, 'Partita IVA non valida');
  assert.equal(validateCrmForm(form({ codice_fiscale: 'ABC' })).codice_fiscale, 'Codice fiscale non valido');
  assert.equal(validateCrmForm(form({ cap: '201' })).cap, 'CAP non valido');
});

test('mapping tipo cliente', () => {
  assert.equal(clientTipoFor({ tipo: 'ristorante' }), 'horeca');
  assert.equal(clientTipoFor({ tipo: 'distributore' }), 'distributore');
  assert.equal(clientTipoFor({ tipo: 'contatto' }), 'horeca');
  assert.equal(clientTipoFor({ tipo: 'sommelier' }), null);
  assert.equal(clientTipoFor({ tipo: 'sommelier', ragione_sociale: 'Cantina Rossi Srl' }), 'horeca');
});

test('payload cliente copia anagrafica, SDI e PEC', () => {
  const payload = buildClientePayload(
    { id: 'crm-1', stato: 'da_contattare', ...form(), provincia: 'mi' },
    { id: 'agente-1', isAgente: false }
  );
  assert.equal(payload.ragione_sociale, 'Osteria del Porto S.r.l.');
  assert.equal(payload.tipo, 'horeca');
  assert.equal(payload.partita_iva, 'IT12345678901');
  assert.equal(payload.codice_fiscale, '12345678901');
  assert.equal(payload.codice_sdi, 'ABC1234');
  assert.equal(payload.pec, 'osteria@pec.it');
  assert.equal(payload.indirizzo, 'Via Roma 1');
  assert.equal(payload.citta, 'Milano');
  assert.equal(payload.provincia, 'MI');
  assert.equal(payload.cap, '20100');
  assert.equal(payload.telefono, '021234567');
  assert.equal(payload.email, 'info@osteria.it');
  assert.equal(payload.referente, 'Giulia Neri');
  assert.match(payload.note, /Tavoli fuori/);
  assert.match(payload.note, /Fonte CRM: Fiera — Vinitaly/);
  assert.equal(payload.agente, 'agente-1');
});

test('Acquisito crea il cliente e non lo duplica', async () => {
  const db = memory();
  const store = db.gateway();
  db.prospects.set('p1', {
    id: 'p1',
    stato: 'in_trattativa',
    ...form()
  });

  const first = await cambiaStatoCrm(store, db.prospects.get('p1'), 'acquisito', { isAgente: false });
  assert.equal(first.created, true);
  assert.equal(first.clienteId, 'cli-1');
  assert.equal(db.clients.length, 1);
  assert.equal(db.clients[0].tipo, 'horeca');
  assert.equal(db.clients[0].codice_sdi, 'ABC1234');
  assert.equal(db.prospects.get('p1').cliente, 'cli-1');

  const second = await cambiaStatoCrm(store, db.prospects.get('p1'), 'acquisito', { isAgente: false });
  assert.equal(second.created, false);
  assert.equal(second.linkedExisting, true);
  assert.equal(second.clienteId, 'cli-1');
  assert.equal(db.clients.length, 1);
  assert.equal(store.creates, 1);
});

test('stessa partita IVA non crea un secondo cliente', async () => {
  const db = memory();
  const store = db.gateway();
  db.clients.push({ id: 'cli-esistente', partita_iva: 'IT12345678901' });
  db.prospects.set('p2', { id: 'p2', stato: 'da_chiamare', ...form() });

  const result = await cambiaStatoCrm(store, db.prospects.get('p2'), 'acquisito', { isAgente: false });
  assert.equal(result.created, false);
  assert.equal(result.linkedExisting, true);
  assert.equal(result.clienteId, 'cli-esistente');
  assert.equal(store.creates, 0);
});

test('distributore diventa cliente distributore', async () => {
  const db = memory();
  const store = db.gateway();
  db.prospects.set('d1', {
    id: 'd1',
    stato: 'contattato',
    ...form({ tipo: 'distributore', ragione_sociale: 'Distribuzioni Nord Srl', partita_iva: '' })
  });
  const result = await cambiaStatoCrm(store, db.prospects.get('d1'), 'acquisito', { id: 'ag', isAgente: true });
  assert.equal(result.created, true);
  assert.equal(db.clients[0].tipo, 'distributore');
  assert.equal(db.clients[0].agente, 'agente-1');
});

test('sommelier senza ragione sociale non crea il cliente', async () => {
  const db = memory();
  const store = db.gateway();
  db.prospects.set('s1', {
    id: 's1',
    stato: 'contattato',
    tipo: 'sommelier',
    nome: 'Luca Bianchi',
    ragione_sociale: ''
  });
  const result = await cambiaStatoCrm(store, db.prospects.get('s1'), 'acquisito', { isAgente: false });
  assert.equal(result.personaOnly, true);
  assert.equal(result.clienteId, null);
  assert.equal(db.clients.length, 0);
  assert.equal(db.prospects.get('s1').stato, 'acquisito');
});

test('cambio stato diverso da Acquisito non crea clienti', async () => {
  const db = memory();
  const store = db.gateway();
  db.prospects.set('p3', { id: 'p3', stato: 'da_contattare', ...form() });
  const result = await cambiaStatoCrm(store, db.prospects.get('p3'), 'in_trattativa', { isAgente: false });
  assert.equal(result.record.stato, 'in_trattativa');
  assert.equal(db.clients.length, 0);
});

test('campi sconosciuti di PocketBase', () => {
  const names = unknownFieldNames({
    response: {
      data: {
        codice_fiscale: { code: 'validation_unknown_field', message: 'Unknown field.' },
        referente: { code: 'validation_unknown_field', message: 'Unknown field.' },
        email: { code: 'validation_invalid_email', message: 'Must be a valid email.' }
      }
    }
  });
  assert.deepEqual(names.sort(), ['codice_fiscale', 'referente']);
});
