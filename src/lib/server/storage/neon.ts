import { env } from '$env/dynamic/private';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type NeonSql = NeonQueryFunction<false, false>;

let cachedConnectionString: string | null = null;
let cachedSql: NeonSql | null = null;

export function neonConnectionString(): string {
	const connectionString = env.DATABASE_URL ?? env.NEON_DATABASE_URL;
	if (!connectionString) {
		throw new Error('Set DATABASE_URL or NEON_DATABASE_URL to use Neon Postgres storage.');
	}
	return connectionString;
}

export function getNeonSql(connectionString = neonConnectionString()): NeonSql {
	if (!cachedSql || cachedConnectionString !== connectionString) {
		cachedConnectionString = connectionString;
		cachedSql = neon(connectionString);
	}
	return cachedSql;
}
