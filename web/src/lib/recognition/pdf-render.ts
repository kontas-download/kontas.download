import path from 'node:path';

// Renders the first pages of a PDF to JPEG so that vision models which accept only images can read it (pdf.js on a prebuilt
// native canvas: no system packages are needed). Pages are scaled to at most MAX_SIDE pixels on the long edge.
const MAX_SIDE = 1800;

export async function renderPdfPages(data: Buffer, maxPages = 3): Promise<Buffer[]> {
  const [{ createCanvas }, pdfjs] = await Promise.all([import('@napi-rs/canvas'), import('pdfjs-dist/legacy/build/pdf.mjs')]);
  const fonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/';
  const task = pdfjs.getDocument({ data: new Uint8Array(data), standardFontDataUrl: fonts, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: Buffer[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(base.width, base.height)) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
      pages.push(canvas.toBuffer('image/jpeg', 80));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
