import * as pdfjsLib from 'pdfjs-dist';
// Vite: URL del worker per estrazione testo lato browser
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured || typeof window === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
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
