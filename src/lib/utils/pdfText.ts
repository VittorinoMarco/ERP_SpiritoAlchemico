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

export type RenderPdfOptions = {
  /** Massimo numero di pagine da inviare al modello vision (default 3). */
  maxPages?: number;
  /** Scala rendering pdf.js (default 1.15). */
  scale?: number;
  /** Ridimensiona l’immagine se più larga di questo valore (px), per limitare payload API. */
  maxWidthPx?: number;
};

/**
 * Rasterizza le prime pagine del PDF in data URL PNG (per OpenAI Vision).
 * Solo browser (usa canvas).
 */
export async function renderPdfPagesToDataUrls(
  file: File,
  options?: RenderPdfOptions
): Promise<string[]> {
  ensureWorker();
  const maxPages = options?.maxPages ?? 3;
  const scale = options?.scale ?? 1.15;
  const maxWidthPx = options?.maxWidthPx ?? 1200;

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
  const pdf = await loadingTask.promise;
  const out: string[] = [];
  const n = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas
    } as Parameters<typeof page.render>[0]);
    await renderTask.promise;
    let dataUrl = canvas.toDataURL('image/png');
    if (viewport.width > maxWidthPx) {
      dataUrl = await downscaleDataUrlPng(dataUrl, maxWidthPx);
    }
    out.push(dataUrl);
  }
  return out;
}

function downscaleDataUrlPng(dataUrl: string, maxW: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w <= maxW) {
        resolve(dataUrl);
        return;
      }
      const ratio = maxW / w;
      w = maxW;
      h = Math.round(h * ratio);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      if (!x) {
        resolve(dataUrl);
        return;
      }
      x.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
