/**
 * Logica CRM: anagrafica prospect, validazione e passaggio a cliente.
 * Nessuna dipendenza da Svelte o da PocketBase, così il passaggio «Acquisito»
 * si può verificare senza il server.
 */

export type CrmTipo =
  | 'ristorante'
  | 'contatto'
  | 'agente'
  | 'distributore'
  | 'sommelier'
  | 'persona_di_spicco';

export type CrmStato =
  | 'da_contattare'
  | 'da_chiamare'
  | 'contattato'
  | 'in_trattativa'
  | 'acquisito'
  | 'non_interessato';

export type CrmFonte = 'fiera' | 'referral' | 'sito' | 'telefono' | 'visita' | 'social' | 'altro';

export type ClienteTipoHandoff = 'horeca' | 'distributore';

export const TIPI: CrmTipo[] = [
  'ristorante',
  'contatto',
  'agente',
  'distributore',
  'sommelier',
  'persona_di_spicco'
];

export const STATI: CrmStato[] = [
  'da_contattare',
  'da_chiamare',
  'contattato',
  'in_trattativa',
  'acquisito',
  'non_interessato'
];

export const FONTI: CrmFonte[] = ['fiera', 'referral', 'sito', 'telefono', 'visita', 'social', 'altro'];

export const TIPO_LABELS: Record<CrmTipo, string> = {
  ristorante: 'Ristorante',
  contatto: 'Contatto',
  agente: 'Agente',
  distributore: 'Distributore',
  sommelier: 'Sommelier',
  persona_di_spicco: 'Persona di spicco'
};

export const TIPO_BADGE_COLORS: Record<CrmTipo, string> = {
  ristorante: 'bg-amber-100 text-amber-800',
  contatto: 'bg-sky-100 text-sky-800',
  agente: 'bg-violet-100 text-violet-800',
  distributore: 'bg-violet-100 text-violet-800',
  sommelier: 'bg-emerald-100 text-emerald-800',
  persona_di_spicco: 'bg-rose-100 text-rose-800'
};

export const STATO_LABELS: Record<CrmStato, string> = {
  da_contattare: 'Da contattare',
  da_chiamare: 'Da chiamare',
  contattato: 'Contattato',
  in_trattativa: 'In trattativa',
  acquisito: 'Acquisito',
  non_interessato: 'Non interessato'
};

export const STATO_BADGE_COLORS: Record<CrmStato, string> = {
  da_contattare: 'bg-gray-100 text-gray-700',
  da_chiamare: 'bg-[#F5D547]/90 text-[#1A1A1A]',
  contattato: 'bg-sky-100 text-sky-800',
  in_trattativa: 'bg-orange-100 text-orange-800',
  acquisito: 'bg-emerald-100 text-emerald-800',
  non_interessato: 'bg-rose-100 text-rose-700'
};

export const FONTE_LABELS: Record<CrmFonte, string> = {
  fiera: 'Fiera',
  referral: 'Referral',
  sito: 'Sito',
  telefono: 'Telefono',
  visita: 'Visita',
  social: 'Social',
  altro: 'Altro'
};

/** Organizzazioni: il cliente nasce da queste. Le persone si collegano a loro. */
export const ORG_TIPI: CrmTipo[] = ['ristorante', 'distributore'];

/** Persone: diventano cliente solo se hanno una ragione sociale propria. */
export const PERSON_TIPI: CrmTipo[] = ['sommelier', 'agente', 'persona_di_spicco'];

export interface CrmRecord {
  id: string;
  nome?: string;
  ragione_sociale?: string;
  tipo: CrmTipo;
  stato: CrmStato;
  partita_iva?: string;
  codice_fiscale?: string;
  codice_sdi?: string;
  pec?: string;
  indirizzo?: string;
  citta?: string;
  provincia?: string;
  cap?: string;
  telefono?: string;
  email?: string;
  referente?: string;
  note?: string;
  fonte?: CrmFonte | '';
  fonte_dettaglio?: string;
  organizzazioni?: string[] | string | null;
  cliente?: string;
  agente?: string;
}

export interface CrmFormInput {
  nome: string;
  ragione_sociale: string;
  tipo: CrmTipo;
  stato: CrmStato;
  partita_iva: string;
  codice_fiscale: string;
  codice_sdi: string;
  pec: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  cap: string;
  telefono: string;
  email: string;
  referente: string;
  note: string;
  fonte: CrmFonte | '';
  fonte_dettaglio: string;
  organizzazioni: string[];
  agente: string;
}

export interface CrmActor {
  id?: string;
  isAgente: boolean;
}

export interface CambiaStatoResult {
  record: CrmRecord;
  clienteId: string | null;
  created: boolean;
  linkedExisting: boolean;
  personaOnly: boolean;
}

export interface CrmGateway {
  reload(id: string): Promise<CrmRecord>;
  save(id: string, patch: { stato: CrmStato; cliente?: string }): Promise<CrmRecord>;
  findClient(id: string): Promise<{ id: string } | null>;
  findClientByPiva(piva: string): Promise<{ id: string } | null>;
  createClient(data: Record<string, unknown>): Promise<{ id: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isOrgTipo(tipo: CrmTipo): boolean {
  return ORG_TIPI.includes(tipo);
}

export function isPersonTipo(tipo: CrmTipo): boolean {
  return PERSON_TIPI.includes(tipo) || tipo === 'contatto';
}

export function orgIds(record: { organizzazioni?: string[] | string | null }): string[] {
  const value = record.organizzazioni;
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function displayCrmName(record: { ragione_sociale?: string; nome?: string }): string {
  const company = record.ragione_sociale?.trim();
  const name = record.nome?.trim();
  return company || name || 'Senza nome';
}

export function normalizePiva(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function normalizeCodiceFiscale(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function normalizeSdi(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Tipo cliente da creare.
 * Ristorante → HORECA, distributore → distributore, contatto → HORECA.
 * Sommelier, agente e persona di spicco solo se hanno una ragione sociale.
 */
export function clientTipoFor(record: {
  tipo: CrmTipo;
  ragione_sociale?: string;
}): ClienteTipoHandoff | null {
  if (record.tipo === 'ristorante' || record.tipo === 'contatto') return 'horeca';
  if (record.tipo === 'distributore') return 'distributore';
  if (isPersonTipo(record.tipo) && record.ragione_sociale?.trim()) return 'horeca';
  return null;
}

export function validateCrmForm(input: CrmFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const nome = input.nome.trim();
  const company = input.ragione_sociale.trim();

  if (isOrgTipo(input.tipo)) {
    if (!company) errors.ragione_sociale = 'Ragione sociale obbligatoria';
  } else if (input.tipo === 'contatto') {
    if (!nome && !company) errors.nome = 'Indica almeno il nome o la ragione sociale';
  } else if (!nome) {
    errors.nome = 'Nome obbligatorio';
  }

  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) errors.email = 'Email non valida';
  if (input.pec.trim() && !EMAIL_RE.test(input.pec.trim())) errors.pec = 'PEC non valida';

  const piva = normalizePiva(input.partita_iva);
  if (piva && !/^(IT)?\d{11}$/.test(piva)) errors.partita_iva = 'Partita IVA non valida';

  const cf = normalizeCodiceFiscale(input.codice_fiscale);
  if (cf && !/^(\d{11}|[A-Z0-9]{16})$/.test(cf)) errors.codice_fiscale = 'Codice fiscale non valido';

  const sdi = normalizeSdi(input.codice_sdi);
  if (sdi && !/^[A-Z0-9]{7}$/.test(sdi)) errors.codice_sdi = 'Il codice SDI ha 7 caratteri';

  const cap = input.cap.trim();
  if (cap && !/^\d{5}$/.test(cap)) errors.cap = 'CAP non valido';

  const provincia = input.provincia.trim();
  if (provincia && !/^[A-Za-z]{2}$/.test(provincia)) errors.provincia = 'Usa la sigla (es. MI)';

  return errors;
}

function blank(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildClientePayload(record: CrmRecord, actor: CrmActor): Record<string, unknown> {
  const ragione = record.ragione_sociale?.trim() || record.nome?.trim() || '';
  if (!ragione) throw new Error('Manca la ragione sociale per creare il cliente');

  const tipo = clientTipoFor(record);
  if (!tipo) throw new Error('Questo contatto non diventa un cliente');

  const noteParts: string[] = [];
  if (record.note?.trim()) noteParts.push(record.note.trim());
  if (record.fonte && FONTE_LABELS[record.fonte]) {
    const detail = record.fonte_dettaglio?.trim();
    noteParts.push(`Fonte CRM: ${FONTE_LABELS[record.fonte]}${detail ? ` — ${detail}` : ''}`);
  }

  const nome = record.nome?.trim();
  const referente =
    record.referente?.trim() || (nome && nome !== ragione ? nome : undefined);

  const agente = record.agente || (actor.isAgente ? actor.id : undefined);

  const data: Record<string, unknown> = {
    ragione_sociale: ragione,
    tipo,
    partita_iva: blank(normalizePiva(record.partita_iva)),
    codice_fiscale: blank(normalizeCodiceFiscale(record.codice_fiscale)),
    codice_sdi: blank(normalizeSdi(record.codice_sdi)),
    pec: blank(record.pec),
    indirizzo: blank(record.indirizzo),
    citta: blank(record.citta),
    provincia: blank(record.provincia)?.toUpperCase(),
    cap: blank(record.cap),
    telefono: blank(record.telefono),
    email: blank(record.email),
    referente: blank(referente),
    note: noteParts.length ? noteParts.join('\n\n') : undefined,
    agente: agente || undefined
  };

  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

/** Nomi dei campi che PocketBase rifiuta perché non sono nello schema. */
export function unknownFieldNames(err: unknown): string[] {
  const data =
    err && typeof err === 'object'
      ? ((err as { response?: { data?: unknown }; data?: unknown }).response?.data ??
        (err as { data?: unknown }).data)
      : null;
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => {
      const info = value as { code?: string; message?: string } | null;
      const code = String(info?.code ?? '');
      const message = String(info?.message ?? '');
      return code.includes('unknown') || /unknown field/i.test(message);
    })
    .map(([key]) => key);
}

/**
 * Imposta lo stato. Su Acquisito crea il cliente una sola volta e salva il collegamento.
 * Una seconda chiamata, o la stessa partita IVA già in anagrafica, non crea un duplicato.
 */
export async function cambiaStatoCrm(
  gateway: CrmGateway,
  record: CrmRecord,
  stato: CrmStato,
  actor: CrmActor
): Promise<CambiaStatoResult> {
  const fresh = await gateway.reload(record.id);

  if (stato !== 'acquisito') {
    const updated = await gateway.save(fresh.id, { stato });
    return {
      record: updated,
      clienteId: updated.cliente || null,
      created: false,
      linkedExisting: false,
      personaOnly: false
    };
  }

  const mapping = clientTipoFor(fresh);
  if (!mapping) {
    const updated = await gateway.save(fresh.id, { stato: 'acquisito' });
    return {
      record: updated,
      clienteId: null,
      created: false,
      linkedExisting: false,
      personaOnly: true
    };
  }

  if (fresh.cliente) {
    const existing = await gateway.findClient(fresh.cliente);
    if (existing) {
      const updated = await gateway.save(fresh.id, { stato: 'acquisito', cliente: existing.id });
      return {
        record: updated,
        clienteId: existing.id,
        created: false,
        linkedExisting: true,
        personaOnly: false
      };
    }
  }

  const piva = normalizePiva(fresh.partita_iva);
  if (piva) {
    const byPiva = await gateway.findClientByPiva(piva);
    if (byPiva) {
      const updated = await gateway.save(fresh.id, { stato: 'acquisito', cliente: byPiva.id });
      return {
        record: updated,
        clienteId: byPiva.id,
        created: false,
        linkedExisting: true,
        personaOnly: false
      };
    }
  }

  const created = await gateway.createClient(buildClientePayload(fresh, actor));
  const updated = await gateway.save(fresh.id, { stato: 'acquisito', cliente: created.id });
  return {
    record: updated,
    clienteId: created.id,
    created: true,
    linkedExisting: false,
    personaOnly: false
  };
}
