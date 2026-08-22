/**
 * @file Minimal zero-dependency PNG writer (8-bit RGB, no scanline filtering),
 * salvaged from the `theorycrafting` branch. Baselines are byte-compared, so
 * the encoder must stay deterministic: no timestamps, no ancillary chunks.
 */

import { deflateSync } from 'node:zlib';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BIT_DEPTH = 8;
const COLOR_TYPE_RGB = 2;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
	let c = n;
	for (let k = 0; k < 8; k += 1) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i += 1) {
		c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
	const buffer = Buffer.alloc(12 + data.length);
	buffer.writeUInt32BE(data.length, 0);
	buffer.write(type, 4, 'ascii');
	buffer.set(data, 8);
	buffer.writeUInt32BE(crc32(buffer.subarray(4, 8 + data.length)), 8 + data.length);
	return buffer;
}

/**
 * Encode a tightly packed RGB buffer as a PNG.
 *
 * @example
 * writeFileSync(path, encodePng(width, height, rgb));
 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
	const stride = width * 3;
	// One filter byte per scanline, always 0 (None).
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y += 1) {
		raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = BIT_DEPTH;
	header[9] = COLOR_TYPE_RGB;

	return Buffer.concat([
		Buffer.from(PNG_MAGIC),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}
