# src/lib/server

Server-only code: password hashing, sessions, and the Postgres layer. SvelteKit refuses to bundle this
directory into the client, so nothing here may be reached from a component or any client-side module.

## Check `DATABASE_URL_VPS` before touching a database

The app and `npm run db:migrate` both read `DATABASE_URL_VPS`, and a working `.env` in this repo often
points at the live VPS rather than at localhost. Read it before running migrations or any DB-backed test.

For experiments use the throwaway Postgres in [`docker-compose.dev.yml`](../../../docker-compose.dev.yml),
or override inline for the one command (`DATABASE_URL_VPS=postgres://... npm run db:migrate`). This is also
why the DB-backed e2e specs are skipped unless `E2E_DB=1`. Keep any new one behind `DB_SPECS_DISABLED` in
[`tests-e2e/helpers/account.ts`](../../../tests-e2e/helpers/account.ts).

## Files

- [`auth/password.ts`](auth/password.ts): `hashPassword`, `verifyPassword`, `fallbackPasswordHash`.
- [`auth/session.ts`](auth/session.ts): `establishSession`, `resolveSession`, `destroySession`,
  `SESSION_COOKIE`.
- [`storage/db.ts`](storage/db.ts): the kysely `Database` interface (one row type per table), the `pg`
  pool, `getDb`, `databaseUrl`.
- [`storage/postgresConnection.ts`](storage/postgresConnection.ts): connection-string and TLS
  normalization.
- [`storage/userStore.ts`](storage/userStore.ts), [`sessionStore.ts`](storage/sessionStore.ts),
  [`spellStore.ts`](storage/spellStore.ts), [`labelledSampleStore.ts`](storage/labelledSampleStore.ts):
  one module per table. All queries live in these.

## How it works

**Passwords.** Node's built-in scrypt, so no native dependency on the serverless runtime. The stored
string is self-describing (`scrypt$N$r$p$salt$hash`, base64url parts), so cost parameters can be raised
later without invalidating existing accounts. `verifyPassword` reads the parameters back off the record and
compares with `timingSafeEqual`.

**Sessions.** 32 random bytes handed to the browser in an httpOnly, `sameSite: lax`, `secure` outside dev
`wha_session` cookie. The database stores only the SHA-256 hex of that token, so a leaked dump cannot be
replayed as cookies. TTL is 30 days and slides forward once a session drops below half its lifetime.

**Database.** kysely over `pg`. `getDb()` memoizes one Kysely instance and one small pool per connection
string (`PG_POOL_MAX`, default 5) because pgbouncer multiplexes the real connections and Vercel functions
are short lived. Every store function takes `db: Db = getDb()` last so a test can inject its own.

## Invariants and gotchas

**Every migration must be idempotent.** [`scripts/migrate.ts`](../../../scripts/migrate.ts) keeps no
applied-migrations ledger and replays every `migrations/*.sql` on each run. Use `if not exists` /
`if exists` throughout. CI applies the whole set twice to prove it
(`.github/workflows/db-migrate-test.yml`), and a merge to `main` that touches `migrations/` deploys them to
the VPS automatically (`db-migrate-deploy.yml`).

**The migrator splits files on a semicolon at end of line.** A semicolon inside a function body or a
dollar-quoted block would be cut mid-statement. Keep migrations to plain DDL.

**`jsonb` params must be `JSON.stringify`ed on insert and update.** `JsonColumn<T>` in `db.ts` encodes
this: select as `T`, insert and update as `string`. Passing an object straight through makes node-postgres
send a Postgres array or record literal instead of JSON.

**[`hooks.server.ts`](../../hooks.server.ts) swallows session errors to `null` on purpose.** A storage hiccup or a missing
`DATABASE_URL_VPS` degrades the visitor to a guest instead of failing the whole page. Do not "fix" it by
rethrowing.

**`locals.user` is authentication, never authorization.** Ownership is enforced in SQL. `deleteSpellOwned`
and `setSpellPublished` both carry `where user_id = ...`. Any new owner-scoped query must do the same.

**Mutations are remote functions, reads are GET endpoints.**
[`../spells/spells.remote.ts`](../spells/spells.remote.ts) and
[`../auth/auth.remote.ts`](../auth/auth.remote.ts) each re-check `currentUser()` by hand and return
`{ ok: false, reason }` instead of throwing, so the dialog can render a message. Reads stay plain GETs
(`/api/spells`, `/api/samples`, `/api/me`) so guests can browse the library without a session.

**Login hashes even for an unknown username**, against `fallbackPasswordHash()`, so response timing does
not reveal whether an account exists. Preserve that shape when editing the login path.

**`upvote_count` is denormalized.** It may only change inside the same transaction as its `spell_upvotes`
row, as `addSpellUpvote` and `removeSpellUpvote` do, or the tally drifts from the votes.

**Usernames are unique case-insensitively** through the `users_username_lower_key` expression index.
Lookups must compare `lower(username)` to hit it, and inserts must map Postgres error code `23505` to
`DuplicateUsernameError`.

**Route every connection string through `normalizePostgresConnectionString` and `sslFor`.** Some providers
emit `sslrootcert=system`, which makes node-postgres try to open a file literally named `system`.

## Extending

- **New table**: add an idempotent `migrations/NNN_*.sql`, declare its row interface in the `Database`
  interface in `db.ts`, and add one store module. Do not write queries in routes or components.
- **New mutation**: a `command` in a `*.remote.ts` file with a zod schema, re-checking `currentUser()`
  inside and scoping the SQL by `user_id`.
- **Shared row shapes** that the client also needs go in [`../structures/`](../structures/CLAUDE.md), not
  here.

## Related

- Tests that need no database: [`tests/password.test.ts`](../../../tests/password.test.ts),
  [`tests/postgresConnection.test.ts`](../../../tests/postgresConnection.test.ts).
- Gated e2e: `tests-e2e/library.e2e.ts`, `tests-e2e/spell-presets.e2e.ts`.
