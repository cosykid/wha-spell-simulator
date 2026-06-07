/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests-e2e',
	testMatch: '**/*.e2e.{ts,js}',
	// Drawing strokes is timing sensitive; keep a single worker so the dev server
	// and the recognition worker pool are not contended by parallel canvas casts.
	fullyParallel: false,
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
		trace: 'on-first-retry'
	},
	// Chrome only, per the test brief.
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
