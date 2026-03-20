import * as pdfjsLib from 'pdfjs-dist';

/**
 * Worker da CDN: in produzione Nginx spesso serve i `.mjs` in `/_app/` come
 * `application/octet-stream`, e il browser rifiuta i dynamic import (spec moduli).
 * unpkg risponde con `application/javascript`.
 * Mantieni allineata a `dependencies.pdfjs-dist` in package.json.
 */
const PDFJS_DIST_VERSION = '4.10.38';

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured || typeof window === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_DIST_VERSION}/build/pdf.worker.min.mjs`;
  workerConfigured = true;
}

/** Estrae tutto il testo da un PDF (client-side). */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  ensureWorker();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => {
        if (item && typeof item === 'object' && 'str' in item) {
          return (item as { str: string }).str;
        }
        return '';
      })
      .join(' ');
    parts.push(line);
  }
  return parts.join('\n');
}
