/**
 * @file Dev-only capture sink for the fire lab: accepts a PNG data URL and
 * writes it to disk so agents can Read the rendered frame directly. Not part
 * of the app — only mounted in dev.
 */
import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { writeFileSync } from 'node:fs';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) throw error(404);
	const { path, dataUrl } = (await request.json()) as { path: string; dataUrl: string };
	const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
	writeFileSync(path, Buffer.from(b64, 'base64'));
	return json({ ok: true, bytes: b64.length });
};
