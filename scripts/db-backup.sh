#!/usr/bin/env bash
# Dump the Postgres DB and upload it to Cloudflare R2 with
# grandfather-father-son retention prefixes (daily/, weekly/, monthly/).
# Expiry is handled by R2 lifecycle rules on those prefixes, not by this
# script. Runs identically locally and in CI (.github/workflows/db-backup.yml).
#
# Required env:
#   DATABASE_URL          Postgres connection string. A Neon '-pooler' host is
#                         rewritten to the direct host automatically.
# Required unless --no-upload:
#   R2_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com
#   R2_ACCESS_KEY_ID      R2 API token credentials (S3-compatible)
#   R2_SECRET_ACCESS_KEY
# Optional:
#   R2_BUCKET             Bucket name (default: wha-spell-simulator-postgres-backups)
#   MAX_BUCKET_MB         Abort before uploading if the bucket already holds
#                         more than this (default: 5000)
#   BACKUP_DIR            Where to write the dump (default: a temp dir)

set -euo pipefail

upload=true
if [[ "${1:-}" == "--no-upload" ]]; then
	upload=false
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

# pg_dump should use Neon's direct host, not the pgbouncer pooler.
direct_url="${DATABASE_URL/-pooler./.}"

###############################################################################
# Robust PostgreSQL client resolution (version-matching, no guessing)
###############################################################################

detect_pg_major() {
	# Extract server major version (e.g. 18 from 18.2, 17 from 17.1, etc.)
	psql "$direct_url" --no-psqlrc --quiet --tuples-only \
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

echo "Detecting PostgreSQL server version..."
server_major="$(detect_pg_major)"
pg_bin="$(find_pg_bin "$server_major")"

PG_DUMP="$pg_bin/pg_dump"
PG_RESTORE="$pg_bin/pg_restore"
PSQL="$pg_bin/psql"

echo "Server PostgreSQL major version: $server_major"
echo "Using: $($PG_DUMP --version)"

###############################################################################
# Backup paths
###############################################################################

backup_dir="${BACKUP_DIR:-$(mktemp -d)}"
stamp="$(date -u +%Y-%m-%d)"
dump_path="$backup_dir/wha-$stamp.dump"
csv_path="$backup_dir/labelled_samples-$stamp.csv"

###############################################################################
# Dump database
###############################################################################

echo "Dumping database to $dump_path ..."
"$PG_DUMP" --format=custom --no-owner --no-privileges --file "$dump_path" "$direct_url"

# Validate dump integrity early
"$PG_RESTORE" --list "$dump_path" > /dev/null
echo "Dump OK ($(du -h "$dump_path" | cut -f1))"

###############################################################################
# CSV export
###############################################################################

echo "Exporting labelled_samples to $csv_path ..."
"$PSQL" "$direct_url" --no-psqlrc --quiet \
	-c "\\copy labelled_samples to '$csv_path' with (format csv, header)"

[[ -s "$csv_path" ]] || { echo "CSV export came out empty" >&2; exit 1; }

rows=$(($(wc -l < "$csv_path") - 1))
gzip -9 "$csv_path"
csv_path="$csv_path.gz"

echo "CSV OK ($(du -h "$csv_path" | cut -f1) gzipped, ${rows}+ rows)"

###############################################################################
# Optional upload
###############################################################################

if [[ "$upload" == false ]]; then
	echo "--no-upload: stopping here."
	exit 0
fi

: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"

bucket="${R2_BUCKET:-wha-spell-simulator-postgres-backups}"
max_bucket_mb="${MAX_BUCKET_MB:-5000}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
export AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"

used_bytes="$(aws s3 ls "s3://$bucket" --recursive --summarize --endpoint-url "$R2_ENDPOINT" \
	| awk '/Total Size:/ {print $3}')"

used_mb=$((used_bytes / 1024 / 1024))
echo "Bucket $bucket currently holds ${used_mb}MB (limit ${max_bucket_mb}MB)"

if ((used_mb > max_bucket_mb)); then
	echo "Bucket exceeds MAX_BUCKET_MB; refusing to upload." >&2
	exit 1
fi

###############################################################################
# GFS prefixes
###############################################################################

prefixes=(daily)
[[ "$(date -u +%u)" == 7 ]] && prefixes+=(weekly)
[[ "$(date -u +%d)" == 01 ]] && prefixes+=(monthly)

for prefix in "${prefixes[@]}"; do
	aws s3 cp "$dump_path" "s3://$bucket/$prefix/" --endpoint-url "$R2_ENDPOINT"
	aws s3 cp "$csv_path" "s3://$bucket/$prefix/" --endpoint-url "$R2_ENDPOINT"
done

aws s3 cp "$dump_path" "s3://$bucket/latest.dump" --endpoint-url "$R2_ENDPOINT"
aws s3 cp "$csv_path" "s3://$bucket/latest.csv.gz" --endpoint-url "$R2_ENDPOINT"

echo "Uploaded to: ${prefixes[*]} + latest.dump + latest.csv.gz"