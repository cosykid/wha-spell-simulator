/** Minimal zero-dependency PNG writer (8-bit RGB, no filtering). */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
	const buf = Buffer.alloc(12 + data.length);
	buf.writeUInt32BE(data.length, 0);
	buf.write(type, 4, 'ascii');
	buf.set(data, 8);
	buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
	return buf;
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
	const stride = width * 3;
	const raw = Buffer.alloc((stride + 1) * height); // +1 filter byte per scanline
	for (let y = 0; y < height; y++) {
		raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}
