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

  return parsed;
}
