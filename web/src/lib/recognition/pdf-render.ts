import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Renders the first pages of a PDF to JPEG so that vision models which accept only images can read it (pdf.js on a prebuilt
// native canvas: no system packages are needed). Pages are scaled to at most MAX_SIDE pixels on the long edge.
const MAX_SIDE = 1800;

// The standard fonts are read from disk. A bare require.resolve() is rewritten by the Next.js bundler inside the built server
// (it then no longer returns a path), so the package is located with a runtime require anchored at the working directory
// (the app root in the container and in development), with the plain node_modules path as a fallback.
function standardFontsDir(): string {
  let dir: string;
  try {
    dir = path.join(path.dirname(createRequire(path.join(process.cwd(), 'package.json')).resolve('pdfjs-dist/package.json')), 'standard_fonts');
  } catch {
    dir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  }
  if (!fs.existsSync(dir)) throw new Error(`pdf.js standard fonts not found (${dir})`);
  return dir.split(path.sep).join('/') + '/';
}

export async function renderPdfPages(data: Buffer, maxPages = 3): Promise<Buffer[]> {
  const [{ createCanvas }, pdfjs] = await Promise.all([import('@napi-rs/canvas'), import('pdfjs-dist/legacy/build/pdf.mjs')]);
  const fonts = standardFontsDir();
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
