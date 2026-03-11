import { jsPDF } from 'jspdf';

export interface CompanyData {
  ragione_sociale: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  partita_iva?: string;
  codice_fiscale?: string;
}

export interface ClientData {
  ragione_sociale: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  partita_iva?: string;
  codice_fiscale?: string;
}

export interface InvoiceLine {
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_percentuale?: number;
  totale_riga: number;
}

export interface InvoicePdfData {
  numero_fattura: string;
  data_emissione: string;
  data_scadenza: string;
  cliente: ClientData;
  righe: InvoiceLine[];
  totale_imponibile: number;
  iva: number;
  totale: number;
}

const DEFAULT_COMPANY: CompanyData = {
  ragione_sociale: 'Spirito Alchemico S.r.l.',
  indirizzo: 'Via Example 1',
  citta: 'Milano',
  cap: '20100',
  provincia: 'MI',
  partita_iva: 'IT12345678901',
  codice_fiscale: '12345678901'
};

export function generateInvoicePdf(
  invoice: InvoicePdfData,
  company: CompanyData = DEFAULT_COMPANY
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header - Company
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(company.ragione_sociale, 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const companyLines: string[] = [];
  if (company.indirizzo) companyLines.push(company.indirizzo);
  if (company.citta || company.cap || company.provincia) {
    companyLines.push([company.cap, company.citta, company.provincia].filter(Boolean).join(' '));
  }
  if (company.partita_iva) companyLines.push(`P.IVA: ${company.partita_iva}`);
  if (company.codice_fiscale) companyLines.push(`C.F.: ${company.codice_fiscale}`);
  companyLines.forEach((line) => {
    doc.text(line, 20, y);
    y += 6;
  });
  y += 10;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`FATTURA N. ${invoice.numero_fattura}`, 20, y);
  y += 12;

  // Dates
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data emissione: ${invoice.data_emissione}`, 20, y);
  doc.text(`Scadenza: ${invoice.data_scadenza}`, 100, y);
  y += 12;

  // Client block
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 20, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.cliente.ragione_sociale, 20, y);
  y += 6;
  const clientLines: string[] = [];
  if (invoice.cliente.indirizzo) clientLines.push(invoice.cliente.indirizzo);
  if (invoice.cliente.citta || invoice.cliente.cap || invoice.cliente.provincia) {
    clientLines.push(
      [invoice.cliente.cap, invoice.cliente.citta, invoice.cliente.provincia].filter(Boolean).join(' ')
    );
  }
  if (invoice.cliente.partita_iva) clientLines.push(`P.IVA: ${invoice.cliente.partita_iva}`);
  if (invoice.cliente.codice_fiscale) clientLines.push(`C.F.: ${invoice.cliente.codice_fiscale}`);
  clientLines.forEach((line) => {
    doc.text(line, 20, y);
    y += 6;
  });
  y += 12;

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Descrizione', 20, y);
  doc.text('Qtà', 120, y);
  doc.text('Prezzo', 140, y);
  doc.text('Sconto %', 165, y);
  doc.text('Totale', 185, y);
  y += 8;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(20, y, pageW - 20, y);
  y += 6;

  // Table rows
  doc.setFont('helvetica', 'normal');
  for (const riga of invoice.righe) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.text(riga.descrizione.substring(0, 45), 20, y);
    doc.text(String(riga.quantita), 120, y);
    doc.text(riga.prezzo_unitario.toFixed(2), 140, y);
    doc.text(String(riga.sconto_percentuale ?? 0), 165, y);
    doc.text(riga.totale_riga.toFixed(2), 185, y);
    y += 7;
  }

  y += 8;
  doc.line(20, y, pageW - 20, y);
  y += 8;

  // Totals
  doc.text('Imponibile:', 120, y);
  doc.text(invoice.totale_imponibile.toFixed(2) + ' €', 185, y);
  y += 7;
  doc.text('IVA:', 120, y);
  doc.text(invoice.iva.toFixed(2) + ' €', 185, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Totale:', 120, y);
  doc.text(invoice.totale.toFixed(2) + ' €', 185, y);

  doc.save(`Fattura_${invoice.numero_fattura}.pdf`);
}
