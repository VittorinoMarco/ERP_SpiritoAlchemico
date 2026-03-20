/**
 * Parsing fattura fornitore (distilleria) via OpenAI.
 * Regole: per ogni prodotto il prezzo imponibile unitario = liquido + accisa + contrassegno (per unità);
 * totale riga imponibile = prezzo_imponibile_unita * quantità. IVA (es. 22%) separata sul documento.
 */

export type SupplierInvoiceLineParsed = {
  /** Nome commerciale / descrizione in fattura */
  descrizione: string;
  quantita: number;
  /** Componenti opzionali se distinti in fattura */
  prezzo_liquido_unita?: number;
  accisa_unita?: number;
  contrassegno_unita?: number;
  /** Obbligatorio: somma imponibile per unità (liquido + accisa + contrassegno) */
  prezzo_imponibile_unita: number;
  imponibile_riga: number;
};

export type SupplierInvoiceParsed = {
  numero_documento?: string;
  data_documento?: string; // YYYY-MM-DD se possibile
  fornitore?: string;
  aliquota_iva_percentuale: number;
  righe: SupplierInvoiceLineParsed[];
  imponibile_totale?: number;
  iva_totale?: number;
  totale_ivato?: number;
  note_parsing?: string;
};

const SYSTEM = `Sei un esperto di fatture d'acquisto per una distilleria italiana.

REGOLE DI LETTURA (OBBLIGATORIE):
1) La QUANTITÀ ("quantita" nel JSON) va letta SOLO dalla colonna o etichetta **Qtà**, **Q.tà**, **Quantità**, **Qty** della riga merce. NON usare mai come quantità: aliquote IVA (4, 5, 10, 22), codici "BT-22", percentuali, numeri di pagina o altre colonne numeriche.
2) Ogni "prodotto finito" (es. Amaro, Limoncello, Bitter) può avere righe collegate "Accisa" e "Contrassegni" con la STESSA quantità del prodotto (quella della colonna Qtà).
3) PREZZO IMPONIBILE UNITARIO (costo acquisto/produzione imponibile per bottiglia) = (totale imponibile liquido merce / Qtà) + (totale imponibile accisa / Qtà) + (totale imponibile contrassegni / Qtà). È la somma dei tre importi imponibili di riga diviso la Qtà del prodotto.
4) IMPONIBILE RIGA PRODOTTO = prezzo_imponibile_unita * quantita (deve coincidere con liquido+accisa+contrassegni imponibili per quella quantità).
5) L'IVA (es. 22%) è SULL'IMPONIBILE: non mettere l'IVA nei campi imponibile. Leggi imponibile totale e IVA dal riepilogo fine fattura.
6) Ignora righe descrittive, privacy, trasporto se non sono merce.
7) Numeri italiani: virgola decimale (es. 6,7200 → 6.72).
8) ERRORE FREQUENTE: se in fattura compare 22 come **percentuale IVA** e anche come numero in tabella, NON confondere: la **quantità** è il valore sotto l’intestazione colonna **Qtà / Quantità**, che spesso è 12, 18, 24, 36, 48, 72… e quasi mai coincide con 22.

OUTPUT: SOLO JSON valido, senza markdown, con questa forma:
{
  "numero_documento": string o null,
  "data_documento": "YYYY-MM-DD" o null,
  "fornitore": string o null,
  "aliquota_iva_percentuale": number,
  "righe": [
    {
      "descrizione": string,
      "quantita": number,
      "prezzo_liquido_unita": number opzionale,
      "accisa_unita": number opzionale,
      "contrassegno_unita": number opzionale,
      "prezzo_imponibile_unita": number,
      "imponibile_riga": number
    }
  ],
  "imponibile_totale": number o null,
  "iva_totale": number o null,
  "totale_ivato": number o null,
  "note_parsing": string breve se dubbi
}`;

/** Valori spesso confusi con la quantità (aliquote IVA). */
const SOSPETTO_QTY_IVA = new Set([4, 5, 10, 22]);

/** Tutte le righe hanno la stessa quantità identica all’aliquota IVA → sospetto errore (es. 22 usato come qty). */
export function quantitaTutteUgualiAllaIva(p: SupplierInvoiceParsed): boolean {
  const iva = Math.round(Number(p.aliquota_iva_percentuale)) || 22;
  const r = p.righe;
  if (r.length < 1) return false;
  const q0 = Math.round(Number(r[0].quantita));
  if (q0 <= 0 || ![4, 5, 10, 22].includes(q0)) return false;
  if (q0 !== iva) return false;
  return r.every((x) => Math.round(Number(x.quantita)) === q0);
}

const REFINE_QTY_SYSTEM = `Sei un revisore di fatture d'acquisto italiane.

PROBLEMA: il primo parsing ha messo come "quantita" lo stesso numero dell'aliquota IVA (es. 22). È SBAGLIATO.
Devi leggere dal TESTO della fattura la colonna **Qtà**, **Q.tà**, **Quantità** per OGNI riga prodotto (merce principale: amaro, limoncello, bitter, gin, ecc.).

REGOLE:
- Restituisci SOLO JSON: { "righe": [ { "descrizione": string, "quantita": number } ] }
- Una voce per ogni prodotto finito del primo JSON (stesso ordine se possibile); "descrizione" può essere abbreviata ma deve permettere il match.
- "quantita" = numero intero dalla colonna quantità, MAI la percentuale IVA.
- Ricalcola coerenza: se conosci imponibile riga e qty, prezzo unitario imponibile = imponibile_riga / qty (verifica con il testo).

NON includere markdown.`;

async function refineQuantitaConOpenAI(
  apiKey: string,
  rawText: string,
  snapshot: { descrizione: string; quantita: number; prezzo_imponibile_unita: number; imponibile_riga: number }[]
): Promise<{ descrizione: string; quantita: number }[] | null> {
  const trimmed = rawText.trim().slice(0, 100000);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REFINE_QTY_SYSTEM },
        {
          role: 'user',
          content: `Righe già estratte (quantità probabilmente errate, spesso = IVA):\n${JSON.stringify(snapshot)}\n\n---\nTesto fattura:\n${trimmed}\n---\n\nCorreggi SOLO le quantità. JSON "righe".`
        }
      ],
      temperature: 0,
      max_tokens: 2000
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonStr = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const o = JSON.parse(jsonStr) as { righe?: { descrizione?: string; quantita?: number }[] };
    if (!o.righe || !Array.isArray(o.righe)) return null;
    return o.righe
      .map((x) => ({
        descrizione: String(x.descrizione ?? '').trim(),
        quantita: Math.round(Number(x.quantita) || 0)
      }))
      .filter((x) => x.quantita > 0);
  } catch {
    return null;
  }
}

function applicaQuantitaARiga(r: SupplierInvoiceLineParsed, q: number): void {
  if (q <= 0) return;
  r.quantita = q;
  const pu = Number(r.prezzo_imponibile_unita) || 0;
  if (pu > 0) r.imponibile_riga = Math.round(q * pu * 100) / 100;
}

function mergeQuantitaRaffinate(
  righe: SupplierInvoiceLineParsed[],
  refined: { descrizione: string; quantita: number }[]
): void {
  if (refined.length === righe.length) {
    for (let i = 0; i < righe.length; i++) {
      applicaQuantitaARiga(righe[i], refined[i].quantita);
    }
    return;
  }
  for (const r of righe) {
    const d = normDesc(r.descrizione);
    const hit = refined.find((x) => {
      const nd = normDesc(x.descrizione);
      if (nd.length < 4) return false;
      const tokens = nd.split(/\s+/).filter((w) => w.length > 3);
      return tokens.some((t) => d.includes(t));
    });
    if (hit) applicaQuantitaARiga(r, hit.quantita);
  }
}

function normDesc(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function correggiQuantitaSeProbabilmenteIva(r: SupplierInvoiceLineParsed): void {
  const q = Number(r.quantita) || 0;
  const p = Number(r.prezzo_imponibile_unita) || 0;
  const imp = Number(r.imponibile_riga) || 0;
  if (q <= 0 || p <= 0 || imp <= 0) return;
  const implied = imp / p;
  const rounded = Math.round(implied);
  if (rounded <= 0 || rounded > 500000) return;
  const errCurrent = Math.abs(q * p - imp);
  const errImplied = Math.abs(rounded * p - imp);
  if (errImplied < errCurrent - 0.01 && Math.abs(implied - rounded) < 0.15) {
    if (SOSPETTO_QTY_IVA.has(q) || errCurrent > 0.05 * imp) {
      r.quantita = rounded;
    }
  }
}

export async function parseSupplierInvoiceText(
  apiKey: string,
  rawText: string
): Promise<SupplierInvoiceParsed> {
  if (!apiKey?.trim()) throw new Error('API key OpenAI mancante');
  const trimmed = rawText.trim().slice(0, 120000);
  if (!trimmed) throw new Error('Testo fattura vuoto');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Testo estratto dalla fattura PDF (può essere disordinato):\n\n---\n${trimmed}\n---\n\nRestituisci il JSON.`
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'Errore API OpenAI');
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonStr = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: SupplierInvoiceParsed;
  try {
    parsed = JSON.parse(jsonStr) as SupplierInvoiceParsed;
  } catch {
    throw new Error('Risposta AI non è JSON valido. Riprova o incolla il testo della fattura.');
  }

  if (!parsed.righe || !Array.isArray(parsed.righe)) {
    parsed.righe = [];
  }
  if (typeof parsed.aliquota_iva_percentuale !== 'number' || Number.isNaN(parsed.aliquota_iva_percentuale)) {
    parsed.aliquota_iva_percentuale = 22;
  }

  for (const r of parsed.righe) {
    correggiQuantitaSeProbabilmenteIva(r);
    const q = Number(r.quantita) || 0;
    const p = Number(r.prezzo_imponibile_unita) || 0;
    if (q > 0 && p > 0 && (!r.imponibile_riga || r.imponibile_riga <= 0)) {
      r.imponibile_riga = Math.round(q * p * 100) / 100;
    }
  }

  if (quantitaTutteUgualiAllaIva(parsed)) {
    const snap = parsed.righe.map((r) => ({
      descrizione: r.descrizione,
      quantita: Number(r.quantita) || 0,
      prezzo_imponibile_unita: Number(r.prezzo_imponibile_unita) || 0,
      imponibile_riga: Number(r.imponibile_riga) || 0
    }));
    const refined = await refineQuantitaConOpenAI(apiKey, trimmed, snap);
    if (refined && refined.length > 0) {
      mergeQuantitaRaffinate(parsed.righe, refined);
      const sumR = parsed.righe.reduce((s, x) => s + (Number(x.imponibile_riga) || 0), 0);
      if (sumR > 0) {
        parsed.imponibile_totale = Math.round(sumR * 100) / 100;
        const ivap = parsed.aliquota_iva_percentuale || 22;
        parsed.iva_totale = Math.round(sumR * (ivap / 100) * 100) / 100;
        if (parsed.totale_ivato != null) {
          parsed.totale_ivato = Math.round((sumR + (parsed.iva_totale || 0)) * 100) / 100;
        }
      }
      parsed.note_parsing = [parsed.note_parsing, 'Quantità ricontrollate (evitato uso aliquota IVA come Qtà).']
        .filter(Boolean)
        .join(' ');
    }
  }

  return parsed;
}
