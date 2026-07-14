#!/usr/bin/env bash
#
# update-container.sh — update the Copilot Portal container from a source tarball.
#
# Typical NAS workflow:
#   1. Drop a fresh copilot-portal-container-src.tar.gz onto the SMB share
#      (default source: /mnt/HDDs/copilot-work/copilot-portal/).
#   2. From the NAS console, run this script with docker privileges:
#        sudo ./update-container.sh
#
# It extracts the tarball over the app directory, makes sure the /work bind
# mount is configured, then rebuilds and restarts the container and tails logs.
#
# Override any path with an env var (use `sudo -E` so they pass through), e.g.:
#   APP_DIR=/mnt/SSDs/apps/copilot-portal \
#   SRC_TARBALL=/path/to/copilot-portal-container-src.tar.gz \
#   PORTAL_WORK_HOST_DIR=/mnt/HDDs/copilot-work \
#   sudo -E ./update-container.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/mnt/SSDs/apps/copilot-portal}"
SRC_TARBALL="${SRC_TARBALL:-/mnt/HDDs/copilot-work/copilot-portal/copilot-portal-container-src.tar.gz}"
WORK_HOST_DIR="${PORTAL_WORK_HOST_DIR:-/mnt/HDDs/copilot-work}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found on PATH (run with sudo?)"
docker compose version >/dev/null 2>&1 || die "'docker compose' plugin not available"
[ -f "$SRC_TARBALL" ] || die "source tarball not found: $SRC_TARBALL"
[ -d "$APP_DIR" ]     || die "app directory not found: $APP_DIR"

say "Extracting $(basename "$SRC_TARBALL") -> $APP_DIR"
tar xzf "$SRC_TARBALL" -C "$APP_DIR" -o --touch

cd "$APP_DIR"

# Ensure the /work bind mount points at the shared dataset (leave any existing
# value untouched — don't clobber a deliberate override).
if [ -f .env ] && grep -q '^PORTAL_WORK_HOST_DIR=' .env; then
  say "PORTAL_WORK_HOST_DIR already set in .env ($(grep '^PORTAL_WORK_HOST_DIR=' .env | cut -d= -f2-))"
else
  say "Adding PORTAL_WORK_HOST_DIR=$WORK_HOST_DIR to .env"
  echo "PORTAL_WORK_HOST_DIR=$WORK_HOST_DIR" >> .env
fi

# Refresh this runner's own copy (for next time) from the freshly extracted one,
# but only when we're not running from inside APP_DIR (avoids self-overwrite).
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$SELF_DIR" != "$APP_DIR" ] && [ -f "$APP_DIR/update-container.sh" ]; then
  cp "$APP_DIR/update-container.sh" "$SELF_DIR/update-container.sh" 2>/dev/null || true
fi

say "Rebuilding and restarting the container"
docker compose up -d --build

say "Container status"
docker compose ps

say "Following logs (Ctrl+C to stop — the container keeps running)"
docker compose logs -f --tail=40
