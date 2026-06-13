#!/usr/bin/env bash
# One-shot database migration: dump the source database (DATABASE_URL) and restore
# it into the destination database (DATABASE_URL_VPS). Used for the Neon -> self-
# hosted VPS cutover. Runs identically locally and in CI
# (.github/workflows/db-migrate.yml).
#
# This is a FULL dump (schema + data), so the destination should be empty: the
# restore creates the tables/indexes and loads the rows. Do NOT pre-run the
# migrations against an empty destination — the restore brings the schema with it,
# and migrations/ (idempotent, `create ... if not exists`) own schema evolution
# from then on. To re-run against a non-empty destination, set CLEAN=true.
#
# Required tools: pg_dump/pg_restore matching the SOURCE server major.
#
# Required env:
#   DATABASE_URL          Source connection string. A Neon '-pooler' host is
#                         rewritten to the direct host automatically (pg_dump wants
#                         the direct host, not the pgbouncer pooler).
#   DATABASE_URL_VPS      Destination connection string.
# Optional:
#   CLEAN                 'true' to DROP existing objects before restoring
#                         (pg_restore --clean --if-exists). Default: false, which
#                         appends into an empty/freshly-migrated schema.
#   BACKUP_DIR            Where to write the intermediate dump (default: a temp dir).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL (source) is required}"
: "${DATABASE_URL_VPS:?DATABASE_URL_VPS (destination) is required}"

clean="${CLEAN:-false}"

# pg_dump should use Neon's direct host, not the pgbouncer pooler.
source_url="${DATABASE_URL/-pooler./.}"
dest_url="$DATABASE_URL_VPS"

###############################################################################
# Robust PostgreSQL client resolution (version-matching, no guessing).
# Mirrors scripts/db-backup.sh.
###############################################################################

detect_pg_major() {
	# Extract server major version (e.g. 18 from 18.2) from the source.
	psql "$source_url" --no-psqlrc --quiet --tuples-only \
		-c "show server_version;" \
		| sed 's/^ *//;s/ .*//' \
		| cut -d. -f1
}

find_pg_bin() {
	local major="$1"

	# Debian/Ubuntu standard layout
	if [[ -x "/usr/lib/postgresql/$major/bin/pg_dump" ]]; then
		echo "/usr/lib/postgresql/$major/bin"
		return
	fi

	echo "❌ PostgreSQL client $major is required but not installed." >&2
	echo "" >&2
	echo "Install it with:" >&2
	echo "  sudo apt-get install -y postgresql-common" >&2
	echo "  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y" >&2
	echo "  sudo apt-get install -y postgresql-client-$major" >&2
	exit 1
}

echo "Detecting source PostgreSQL server version..."
server_major="$(detect_pg_major)"
pg_bin="$(find_pg_bin "$server_major")"

PG_DUMP="$pg_bin/pg_dump"
PG_RESTORE="$pg_bin/pg_restore"

echo "Source PostgreSQL major version: $server_major"
echo "Using: $($PG_DUMP --version)"

###############################################################################
# Dump source
###############################################################################

backup_dir="${BACKUP_DIR:-$(mktemp -d)}"
mkdir -p "$backup_dir"
dump_path="$backup_dir/migrate-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"

echo "Dumping source to $dump_path ..."
"$PG_DUMP" --format=custom --no-owner --no-privileges --file "$dump_path" "$source_url"

# Validate dump integrity before touching the destination.
"$PG_RESTORE" --list "$dump_path" > /dev/null
echo "Dump OK ($(du -h "$dump_path" | cut -f1))"

###############################################################################
# Restore into destination
###############################################################################
# --single-transaction keeps the restore atomic (and works through a pgbouncer
# transaction pool: it is one server-side transaction). On any error the
# destination is left untouched.

restore_args=(--no-owner --no-privileges --single-transaction)
if [[ "$clean" == "true" ]]; then
	echo "CLEAN=true: existing objects will be dropped before restore."
	restore_args+=(--clean --if-exists)
fi

echo "Restoring into destination ..."
"$PG_RESTORE" "${restore_args[@]}" --dbname "$dest_url" "$dump_path"

echo "✅ Migration complete: source -> destination."
