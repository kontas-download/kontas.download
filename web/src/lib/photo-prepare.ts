import { HttpError } from './errors';

// Photo preparation for recognition and preview. The stored original is never touched: these functions only produce a derived copy.

// HEIC / HEIF container (iPhone photos): an ISO base media file whose major brand is one of the HEVC image brands.
export function isHeic(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(buffer.subarray(8, 12).toString('latin1'));
}

export const PREPARED_LONG_SIDE = 2500;
const JPEG_QUALITY = 88;

// HEVC photos are decoded by a wasm build of libheif (heic-convert): the prebuilt sharp binaries ship without an HEVC decoder.
async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  try {
    const convert = (await import('heic-convert')).default;
    return Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.95 }));
  } catch {
    throw new HttpError(422, 'HEIC nuotraukos nepavyko nuskaityti. Išsaugokite ją kaip JPEG arba PDF ir įkelkite iš naujo.');
  }
}

// The recognition/preview copy of an image: HEIC decoded, EXIF orientation applied, long side limited to 2500 px (never enlarged),
// mild contrast normalization (1%-99% stretch), flattened on white and saved as JPEG. A damaged non-HEIC image is returned as it is
// (the recognition provider then reports it); a damaged HEIC is an error because nothing else can show it.
export async function prepareImage(buffer: Buffer, mimeType: string): Promise<{ data: Buffer; mimeType: string; converted: boolean }> {
  const heic = isHeic(buffer);
  const source = heic ? await heicToJpeg(buffer) : buffer;
  try {
    const sharp = (await import('sharp')).default;
    const data = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize({ width: PREPARED_LONG_SIDE, height: PREPARED_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .normalise({ lower: 1, upper: 99 })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return { data, mimeType: 'image/jpeg', converted: true };
  } catch {
    if (heic) return { data: source, mimeType: 'image/jpeg', converted: true };
    return { data: buffer, mimeType, converted: false };
  }
}
