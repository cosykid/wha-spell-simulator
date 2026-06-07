import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests-e2e',
	testMatch: '**/*.e2e.{ts,js}',
	// Drawing strokes is timing sensitive; keep a single worker so the dev server
	// and the recognition worker pool are not contended by parallel canvas casts.
	fullyParallel: false,
	webServer: {
		command: 'npm run build && npm run preview --port 5173',
		port: 5173,
		reuseExistingServer: true,
		timeout: 120_000
	},
	use: {
		baseURL: 'http://127.0.0.1:5173',
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
