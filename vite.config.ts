import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defaultClientConditions, defineConfig, type Plugin } from 'vite';

const crossOriginIsolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'credentialless',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

function crossOriginIsolationPlugin(): Plugin {
	const applyHeaders = (
		_request: unknown,
		response: { setHeader: (name: string, value: string) => void },
		next: () => void
	) => {
		for (const [name, value] of Object.entries(crossOriginIsolationHeaders)) {
			response.setHeader(name, value);
		}
		next();
	};

	return {
		name: 'cross-origin-isolation-headers',
		configureServer(server) {
			server.middlewares.use(applyHeaders);
		},
		configurePreviewServer(server) {
			server.middlewares.use(applyHeaders);
		}
	};
}

/* -- Where the recognizer's heavy assets come from ------------------------- */

const repoFile = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/** The postinstall-synced copy in `static/onnxruntime/`, which needs no network. */
const LOCAL_ORT_WASM_BASE = '/onnxruntime/';

const MODEL_FILES = [
	'static/models/glyph-recognizer.onnx',
	'static/models/glyph-recognizer.onnx.data',
	'static/models/glyph-class-to-idx.json'
];

/**
 * Where onnxruntime-web fetches its wasm binary and JS glue from at runtime,
 * stamped into the bundle as `__ORT_WASM_BASE__`.
 *
 * The package ships eight `ort-wasm-simd-threaded*` variants totalling ~74MB and
 * the recognizer loads exactly one, so a deployed build points at jsDelivr rather
 * than paying our own bandwidth for a 22MB download per cold visitor. jsDelivr
 * answers with `access-control-allow-origin: *` and `cross-origin-resource-policy:
 * cross-origin`, which is what this app's COEP `credentialless` page needs to
 * accept a cross-origin binary.
 *
 * The version is read off the installed package rather than typed in. A wasm
 * binary from a different onnxruntime-web release than the bundled JS glue fails
 * at load, so the two can never be allowed to drift.
 */
function ortWasmBase(command: 'serve' | 'build'): string {
	const override = process.env.ORT_WASM_BASE;
	if (override) {
		return override;
	}
	if (command === 'serve') {
		return LOCAL_ORT_WASM_BASE;
	}
	const installed = JSON.parse(
		readFileSync(repoFile('node_modules/onnxruntime-web/package.json'), 'utf8')
	) as { version: string };
	return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${installed.version}/dist/`;
}

/**
 * A short content hash over the deployed model files, stamped into the bundle as
 * `__MODEL_ASSET_VERSION__` and appended to every `/models/` URL the recognizer
 * requests (see `src/lib/parser/ml/config.ts`).
 *
 * Those filenames are stable across retrains, so the long `immutable` cache that
 * `vercel.json` puts on `/models/` would otherwise strand a new model behind a
 * year-old copy. Hashing the bytes moves the graph, its weight sidecar, and the
 * class map to a fresh URL together, so a client can never mix a new graph with
 * a cached sidecar. A missing file is skipped, because recognition is documented
 * to fall back to dictionary templates when the model is absent.
 */
function modelAssetVersion(): string {
	const digest = createHash('sha256');
	for (const file of MODEL_FILES) {
		try {
			digest.update(readFileSync(repoFile(file)));
		} catch {
			digest.update(`missing:${file}`);
		}
	}
	return digest.digest('hex').slice(0, 12);
}

export default defineConfig(({ command }) => ({
	plugins: [crossOriginIsolationPlugin(), sveltekit()],
	resolve: {
		// Pick onnxruntime-web's extern-wasm build. Its default build inlines the
		// Emscripten glue, and that glue's `new URL('...asyncify.wasm',
		// import.meta.url)` makes Vite emit a 22MB asset into the app bundle (once
		// per build, so twice with the classifier worker) that nothing ever fetches,
		// because `ort.env.wasm.wasmPaths` overrides the bundled URL.
		conditions: [...defaultClientConditions, 'onnxruntime-web-use-extern-wasm']
	},
	define: {
		__ORT_WASM_BASE__: JSON.stringify(ortWasmBase(command)),
		__MODEL_ASSET_VERSION__: JSON.stringify(modelAssetVersion())
	},
	server: {
		headers: crossOriginIsolationHeaders
	},
	preview: {
		headers: crossOriginIsolationHeaders
	}
}));
