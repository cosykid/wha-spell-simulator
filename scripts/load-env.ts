import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	const quote = trimmed[0];
	if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function loadDotEnv(files = ['.env', '.env.local']): void {
	for (const file of files) {
		const path = resolve(process.cwd(), file);
		if (!existsSync(path)) {
			continue;
		}

		const lines = readFileSync(path, 'utf8').split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			const assignment = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
			const separator = assignment.indexOf('=');
			if (separator <= 0) {
				continue;
			}

			const key = assignment.slice(0, separator).trim();
			const value = stripQuotes(assignment.slice(separator + 1));
			if (key && process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}
}
