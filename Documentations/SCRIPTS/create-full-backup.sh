#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND="$PROJECT_ROOT/restaurant-system/backend"
DATABASE="$BACKEND/src/database/database.sqlite"

echo "Dragonfly Garden - manual data backup"
echo "Project: $PROJECT_ROOT"
echo "Stop the restaurant application before continuing."

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet dragonfly-garden; then
  echo "ERROR: dragonfly-garden is active. Stop it and retry." >&2
  exit 1
fi

if command -v ss >/dev/null 2>&1 && ss -H -ltn 'sport = :5000' | grep -q LISTEN; then
  echo "ERROR: port 5000 is listening. Confirm the application is stopped and retry." >&2
  exit 1
fi

if [[ ! -f "$DATABASE" ]]; then
  echo "ERROR: database not found: $DATABASE" >&2
  exit 1
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/dragonfly-backup.XXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT

cp -- "$DATABASE" "$STAGE/database.sqlite"
for suffix in -wal -shm; do
  if [[ -f "$DATABASE$suffix" ]]; then
    cp -- "$DATABASE$suffix" "$STAGE/database.sqlite$suffix"
  fi
done

for relative in \
  frontend/public/menu-images \
  frontend/public/feedback-images \
  restaurant-system/backend/uploads; do
  if [[ -d "$PROJECT_ROOT/$relative" ]]; then
    mkdir -p "$STAGE/$(dirname "$relative")"
    cp -a -- "$PROJECT_ROOT/$relative" "$STAGE/$relative"
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/DragonflyBackups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ARCHIVE="$BACKUP_DIR/dragonfly-backup-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGE" .
chmod 600 "$ARCHIVE"
echo "Backup created: $ARCHIVE"
echo "The archive contains restaurant data. Store it securely."
