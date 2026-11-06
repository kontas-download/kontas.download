import fs from 'node:fs';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';

// Minimal streaming ZIP writer (method "stored", UTF-8 names). Files are read from disk in chunks, so memory stays flat however large the
// archive is: the CRC of a file is computed in a first pass, the bytes are then streamed in a second pass.
export type ZipSource = { name: string; modified: Date } & ({ data: Buffer } | { path: string });

const MAX_ENTRIES = 0xfffe;
const MAX_BYTES = 0xfffffffe; // no ZIP64: a larger archive is refused instead of written wrongly

function dosDateTime(date: Date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}

async function fileCrc(path: string): Promise<{ crc: number; size: number }> {
  let crc = 0, size = 0;
  for await (const chunk of fs.createReadStream(path) as AsyncIterable<Buffer>) { crc = crc32(chunk, crc); size += chunk.length; }
  return { crc, size };
}

async function* zipChunks(entries: Iterable<ZipSource>): AsyncGenerator<Buffer> {
  const central: Buffer[] = [];
  let offset = 0, count = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name.toLowerCase())) throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    names.add(entry.name.toLowerCase());
    if (++count > MAX_ENTRIES) throw new Error('Too many files for one ZIP archive');
    const name = Buffer.from(entry.name, 'utf8');
    const { crc, size } = 'data' in entry ? { crc: crc32(entry.data), size: entry.data.length } : await fileCrc(entry.path);
    if (offset + size > MAX_BYTES) throw new Error('The ZIP archive would exceed 4 GB');
    const { time, day } = dosDateTime(entry.modified);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc >>> 0, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.concat([local, name]);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12); cd.writeUInt16LE(day, 14); cd.writeUInt32LE(crc >>> 0, 16); cd.writeUInt32LE(size, 20); cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, name]));
    yield head;
    offset += head.length;
    if ('data' in entry) { if (size) yield entry.data; } else {
      let sent = 0;
      for await (const chunk of fs.createReadStream(entry.path) as AsyncIterable<Buffer>) { sent += chunk.length; yield chunk; }
      if (sent !== size) throw new Error(`File changed while archiving: ${entry.name}`);
    }
    offset += size;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  yield directory;
  yield end;
}

export function zipStream(entries: Iterable<ZipSource>): ReadableStream<Uint8Array> {
  return Readable.toWeb(Readable.from(zipChunks(entries), { objectMode: false })) as ReadableStream<Uint8Array>;
}
