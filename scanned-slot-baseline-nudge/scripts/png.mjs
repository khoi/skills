// Dependency-free PNG codec (8-bit, non-interlaced, colour type 2 or 6) so the slot-band measurement
// needs no packages. Pixels are always normalised to RGBA. Self-contained copy of the codec used by
// local-scan-fill-preservation-gate; a skill cannot assume a sibling skill is installed.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let crcLookup = null;

function crcTable() {
  if (crcLookup) return crcLookup;
  crcLookup = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcLookup[n] = c >>> 0;
  }
  return crcLookup;
}

function crc32(buffer) {
  const table = crcTable();
  let c = 0xffffffff;
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG_SIGNATURE_MISSING ' + file);
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], colorType: data[9], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG_IHDR_MISSING ' + file);
  if (header.depth !== 8) throw new Error('PNG_BIT_DEPTH_UNSUPPORTED ' + header.depth);
  if (header.colorType !== 2 && header.colorType !== 6) throw new Error('PNG_COLOR_TYPE_UNSUPPORTED ' + header.colorType);
  if (header.interlace !== 0) throw new Error('PNG_INTERLACE_UNSUPPORTED');

  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(header.width * header.height * 4);
  let prior = new Uint8Array(stride);
  let line = 0;
  for (let y = 0; y < header.height; y++) {
    line = y * (stride + 1);
    const filter = raw[line];
    const row = Uint8Array.from(raw.subarray(line + 1, line + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) throw new Error('PNG_FILTER_UNSUPPORTED ' + filter);
      row[i] = value & 0xff;
    }
    for (let x = 0; x < header.width; x++) {
      const src = x * channels, dst = (y * header.width + x) * 4;
      out[dst] = row[src];
      out[dst + 1] = row[src + 1];
      out[dst + 2] = row[src + 2];
      out[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
    prior = row;
  }
  return {width: header.width, height: header.height, channels: 4, pixels: out};
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Test helper: a white canvas with an optional painter callback (x, y, rgba) => [r,g,b,a] | null.
export function blankCanvas(width, height) {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  return {width, height, channels: 4, pixels};
}

export function fillPixel(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.pixels[i] = rgb[0];
  image.pixels[i + 1] = rgb[1];
  image.pixels[i + 2] = rgb[2];
  image.pixels[i + 3] = rgb[3] ?? 255;
}
