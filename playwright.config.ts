/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests-e2e',
	testMatch: '**/*.e2e.{ts,js}',
	// Drawing strokes is timing sensitive; keep a single worker so the dev server
	// and the recognition worker pool are not contended by parallel canvas casts.
	fullyParallel: false,
	// The drag-to-place specs are timing sensitive (palette drag -> async place ->
	// recognition -> inspector); retry once locally / twice on CI so a transient
	// miss self-heals. Pairs with the existing `trace: 'on-first-retry'`.
	retries: process.env.CI ? 2 : 1,
	webServer: {
		// Use the dev server in local runs so that you don't need to rebuild the app for every test
		command: process.env.CI ? 'npm run preview' : 'npm run dev',
		port: process.env.CI ? 4173 : 5173,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	use: {
		baseURL: `http://127.0.0.1:${process.env.CI ? 4173 : 5173}`,
		trace: 'on-first-retry',
		// Open drawers/panels instantly (their slide transitions are guarded by this
		// media query). Otherwise a spec can read a palette card's box mid-animation
		// and the drag-to-place gesture lands off the moving card.
		reducedMotion: 'reduce'
	},
	// Chrome only, per the test brief.
	projects: [
		{
			name: 'chromium',
			// A square viewport so the cover-square canvas (sized to the long viewport
			// edge) exactly fills it: no off-screen overflow, and normalized 0..1 draw
			// coordinates map 1:1 onto the canvas the way the specs assume. The canvas
			// stays square either way, so this exercises the same recognition pipeline
			// as a landscape window.
			use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 1024 } }
		}
	]
});
