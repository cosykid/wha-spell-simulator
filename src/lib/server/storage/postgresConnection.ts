import type { PoolConfig } from 'pg';

/**
 * node-postgres treats `sslrootcert` as a filesystem path. Some Postgres
 * providers emit libpq-style URLs with `sslrootcert=system`, meaning "use the
 * platform trust store"; in Node, leaving that param in place makes pg try to
 * open a file literally named `system`.
 */
export function normalizePostgresConnectionString(connectionString: string): string {
	let url: URL;
	try {
		url = new URL(connectionString);
	} catch {
		return connectionString;
	}

	if (url.searchParams.get('sslrootcert') === 'system') {
		url.searchParams.delete('sslrootcert');
		if (!url.searchParams.has('sslmode')) {
			url.searchParams.set('sslmode', 'verify-full');
		}
	}

	return url.toString();
}

/**
 * Maps libpq's `sslmode` query param to a node-postgres TLS config.
 * - `disable`/absent -> no TLS (local Postgres on a trusted network).
 * - `require`/`prefer` -> encrypt, but don't verify the chain.
 * - `verify-ca`/`verify-full` -> encrypt and enforce the certificate chain.
 */
export function sslFor(connectionString: string): PoolConfig['ssl'] {
	let sslmode: string | null = null;
	try {
		sslmode = new URL(connectionString).searchParams.get('sslmode');
	} catch {
		sslmode = connectionString.match(/[?&]sslmode=([^&]+)/)?.[1] ?? null;
	}

	if (!sslmode || sslmode === 'disable') {
		return false;
	}
	return sslmode === 'verify-ca' || sslmode === 'verify-full'
		? { rejectUnauthorized: true }
		: { rejectUnauthorized: false };
}
