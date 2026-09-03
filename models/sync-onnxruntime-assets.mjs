// Copies the ONNX Runtime web assets the recognizer loads at /onnxruntime/ from
// the installed onnxruntime-web package into static/. Runs on postinstall so
// local dev and CI always serve assets that match the installed package version
// instead of committing ~74MB of wasm to the repository.
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A deployed build fetches these from jsDelivr instead (see `ortWasmBase` in
// vite.config.ts), so syncing here would only push 74MB of wasm into a deploy
// that never serves a byte of it.
if (process.env.VERCEL) {
	console.log('Skipping ONNX Runtime asset sync: deployed builds load them from the CDN.');
	process.exit(0);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(scriptDir, '../node_modules/onnxruntime-web/dist');
const targetDir = path.resolve(scriptDir, '../static/onnxruntime');

const assets = (await readdir(sourceDir)).filter((name) =>
	name.startsWith('ort-wasm-simd-threaded')
);
if (!assets.length) {
	throw new Error(`No ort-wasm-simd-threaded assets found in ${sourceDir}`);
}

await mkdir(targetDir, { recursive: true });
await Promise.all(
	assets.map((name) => copyFile(path.join(sourceDir, name), path.join(targetDir, name)))
);
console.log(`Synced ${assets.length} ONNX Runtime assets into static/onnxruntime/`);
