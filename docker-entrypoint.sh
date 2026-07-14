#!/usr/bin/env bash
# Copilot Portal container entrypoint.
#
# Unlike start-portal.sh (which bootstraps a bare-metal machine: detect Node,
# npm install, interactive login), this only handles *runtime* concerns. All
# heavy setup (deps, patch.mjs, pwsh, build) is already baked into the image.
set -e

PUID="${PUID:-568}"
PGID="${PGID:-568}"

# --- First boot as root: fix volume ownership, then drop privileges ---
# The image ships NO `USER` directive, so we start as root. Freshly-mounted volumes
# need attention: Docker *named* volumes inherit the image dir's 568 ownership, but
# TrueNAS ixVolumes and host bind-mounts arrive EMPTY and root-owned. We chown the
# data dirs to the runtime user ONCE here, then re-exec ourselves as ${PUID}:${PGID}
# via gosu so the app itself runs unprivileged. On later boots ownership is already
# correct, so the chown is a no-op.
if [ "$(id -u)" = "0" ]; then
  # Align the baked `copilot` user/group if PUID/PGID were overridden at run time.
  if [ "$(id -u copilot 2>/dev/null)" != "$PUID" ]; then
    usermod -o -u "$PUID" copilot 2>/dev/null || true
  fi
  if [ "$(getent group copilot | cut -d: -f3)" != "$PGID" ]; then
    groupmod -o -g "$PGID" copilot 2>/dev/null || true
  fi
  # Data dirs the container must write. They mount onto volumes; chown only when the
  # top-level owner is wrong (cheap on first boot — the fresh volume is near-empty).
  for d in /home/copilot /app/data; do
    if [ -d "$d" ] && [ "$(stat -c '%u' "$d")" != "$PUID" ]; then
      echo "  fixing ownership of $d -> ${PUID}:${PGID}"
      chown -R "${PUID}:${PGID}" "$d" || echo "  WARNING: could not chown $d"
    fi
  done
  # /work is a host-managed bind mount (often shared over SMB). Do NOT recursively
  # rewrite the admin's dataset; just make the mount point itself writable if we can.
  if [ -d /work ] && [ "$(stat -c '%u' /work)" != "$PUID" ]; then
    chown "${PUID}:${PGID}" /work 2>/dev/null \
      || echo "  NOTE: /work is owned by another user; set its host owner/ACL to ${PUID} if the agent needs to write there"
  fi
  # Optionally join a host "read-write" group so the agent can write files that are
  # group-owned by that gid on a shared /work (e.g. an SMB dataset where humans and
  # the agent collaborate on each other's files). gosu builds the supplementary
  # group list from /etc/group ONLY, so the group must exist in-container and list
  # `copilot` as a member BEFORE we drop privileges — a runtime env var alone won't
  # do it. Set WORK_RW_GID to your share's read-write gid (e.g. your copilot-rw gid).
  # Handles a pre-existing gid (reuse its name) as well as creating a new one.
  if [ -n "${WORK_RW_GID:-}" ]; then
    rw_grp="$(getent group "$WORK_RW_GID" | cut -d: -f1)"
    if [ -z "$rw_grp" ]; then
      groupadd -o -g "$WORK_RW_GID" work-rw 2>/dev/null && rw_grp=work-rw
    fi
    if [ -n "$rw_grp" ] && usermod -aG "$rw_grp" copilot 2>/dev/null; then
      echo "  runtime user joined group '$rw_grp' (gid ${WORK_RW_GID}) for /work RW access"
    else
      echo "  WARNING: could not add runtime user to WORK_RW_GID=${WORK_RW_GID}"
    fi
  fi
  # Drop to the runtime user by UID ONLY (not uid:gid) — this line is load-bearing,
  # do NOT "simplify" it back to `gosu "${PUID}:${PGID}"`. When gosu is given an
  # explicit group it sets the supplementary list to just that one gid and SKIPS
  # initgroups(), so the /etc/group memberships established above (copilot's self-
  # membership + any WORK_RW_GID join) are silently discarded — leaving the agent
  # unable to write group@/named-group-owned files on ZFS/NFSv4 shares (/work over
  # SMB). Given only the uid, gosu runs initgroups() and picks those memberships up.
  # The user's primary gid is already ${PGID} (the groupmod -o -g above guarantees
  # it), so uid-only still lands on the correct gid AND gets the full supplementary set.
  exec gosu "${PUID}" "$0" "$@"
fi

# ---- From here on we run as the unprivileged runtime user (${PUID}:${PGID}). ----
echo "  Copilot Portal — container mode"

# Apply a umask if requested (e.g. UMASK=002 makes files the container writes
# into /work group-writable, so an SMB read-write group can edit/delete them).
if [ -n "${UMASK:-}" ]; then
  umask "${UMASK}"
  echo "  umask set to ${UMASK}"
fi

# --- Writable-volume check (safety net) ---
# Normally the root entrypoint above chowns these dirs and this never trips. It can
# still fire if the container was forced to start as a non-root user (e.g. a
# TrueNAS "Custom User" override or `docker run --user`), which prevents the
# self-heal. Explain both fixes instead of crash-looping with a cryptic
# "Permission denied (os error 13)".
UID_NOW="$(id -u)"; GID_NOW="$(id -g)"
for d in "${HOME}/.copilot" "/app/data" "${PORTAL_WORKSPACE_DIR:-/work}"; do
  if [ -d "$d" ] && [ ! -w "$d" ]; then
    echo
    echo "  ERROR: '$d' is not writable by this user (${UID_NOW}:${GID_NOW})."
    echo "  The container was started as a non-root user, so it could not fix the"
    echo "  volume's ownership itself. Either:"
    echo "    - let it start as root (remove any Custom User / --user override) so it"
    echo "      self-heals on boot, or"
    echo "    - chown the volume on the host once: chown -R ${UID_NOW}:${GID_NOW} <path>"
    echo
    exit 1
  fi
done

# --- Enable plaintext token storage (no system keychain in a container) ---
# The Copilot CLI tries the OS keychain first; when absent it asks an interactive
# y/N question to fall back to a plaintext config file. That prompt needs a TTY,
# which a headless container/web sign-in doesn't have, so `copilot login` would
# otherwise authenticate but fail to PERSIST the token ("token was not saved").
# Setting storeTokenPlaintext:true in settings.json makes the CLI store (and read)
# the token from ~/.copilot directly — no keychain, no prompt. The token still
# lives only in the mounted ~/.copilot volume.
node -e '
  const fs = require("fs"), path = require("path");
  const p = path.join(process.env.HOME, ".copilot", "settings.json");
  let s = {};
  try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  if (s.storeTokenPlaintext !== true) {
    s.storeTokenPlaintext = true;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    console.log("  enabled plaintext token storage (no keychain in container)");
  }
' || echo "  WARNING: could not set storeTokenPlaintext — browser sign-in may not persist"

# --- GitHub auth check (warn only; do not block) ---
# Three supported paths:
#   1. A token in the environment (simplest for containers).
#   2. A pre-authenticated ~/.copilot directory mounted as a volume.
#   3. Sign in from the web UI on first run (device-code flow).
HAS_TOKEN=0
if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GITHUB_COPILOT_GITHUB_TOKEN:-}" ] || [ -n "${COPILOT_GITHUB_TOKEN:-}" ]; then
  HAS_TOKEN=1
fi

HAS_CREDS=0
if [ -f "${HOME}/.copilot/config.json" ]; then
  HAS_CREDS=1
fi

if [ "$HAS_TOKEN" = "0" ] && [ "$HAS_CREDS" = "0" ]; then
  echo
  echo "  No GitHub authentication detected yet — sign in from the web UI when it"
  echo "  loads, or provide one of:"
  echo "    - a token via the GITHUB_TOKEN environment variable, or"
  echo "    - a pre-authenticated ~/.copilot mounted at ${HOME}/.copilot"
  echo
fi

# --- Container guidance for the agent (auto-managed) ---
# The Copilot CLI loads user instructions from ~/.copilot/instructions/*.instructions.md.
# Drop a Portal-owned, namespaced file there (applyTo:** so it applies globally) telling
# the agent about this environment's constraints — non-root/no sudo/no apt, Python is
# PEP 668 externally-managed (use uv / venv / pip --user), what persists, and the /work
# no-exec caveat. Rewritten each boot to stay current; never touches the user's own
# ~/.copilot/copilot-instructions.md.
INSTR_DIR="${HOME}/.copilot/instructions"
if mkdir -p "$INSTR_DIR" 2>/dev/null; then
  cat > "${INSTR_DIR}/copilot-portal-container.instructions.md" <<'EOF'
---
applyTo: "**"
description: Copilot Portal container environment
---
# Running inside the Copilot Portal container

You are in a headless Linux container, running as a **non-root** user with **no `sudo`**.

- **Do not use `apt`/`apt-get`** (no root). System tools are fixed at image build time;
  bundled already: git, gh, python3, uv/uvx, node/npx, pwsh, jq, make, patch, zip/unzip, xz.
- **Python is externally managed (PEP 668)** and system site-packages are not writable, so a
  bare `pip install <pkg>` will fail by design. Install Python packages this way instead:
  1. `uv pip install <pkg>` or `uv tool install <cli>` (preferred — fast, isolated)
  2. a venv: `python3 -m venv .venv && .venv/bin/pip install <pkg>`
  3. `pip install --user <pkg>` (lands in `~/.local/bin`, which is on `PATH`)
  Do **not** use `pip install --break-system-packages`: it works but writes into the system
  Python under `/usr`, which is **wiped on every image update** and pollutes the base — the
  three options above persist on the `~` volume and survive updates.
- **Standalone/downloaded binaries** (release tarballs, `go install` output, single-file CLIs):
  put them in `~/.local/bin` — `install -m 0755 <bin> ~/.local/bin/` (or `mv` then `chmod +x`).
  That dir is on `PATH`, persists across updates, and allows execution. Avoid `/usr/local/bin`
  (needs root, wiped on update), `/tmp` (ephemeral), and `/work` (network-share ACLs may block
  `chmod +x`).
- **Persistence:** your home (`~`, including `~/.local/bin` and `~/.copilot`) persists across
  container/image updates, so tools installed there stick. Other paths (`/tmp`, `/usr`, system
  site-packages) are ephemeral and reset on update — install durable tools under `~`.
- **Local (stdio) MCP servers:** put the server's files under `~` (e.g.
  `~/.copilot/mcp-servers/<name>/`) and install its deps with uv/venv/`pip --user` so both the
  code and its dependencies persist across updates. When registering it in
  `~/.copilot/mcp-config.json`, the `command`/`args` must use **this container's paths** (e.g.
  `/home/copilot/.copilot/mcp-servers/<name>/server.py`) — never a Windows/macOS path copied from
  another machine, which won't exist here. `python`, `python3`, `uv`/`uvx`, and `node`/`npx` are
  all on `PATH`, so any of them is fine as the launch command.
- **`/work`** is the shared workspace (often exposed over the network). It may **not allow
  `chmod +x`** due to network-share ACLs, so keep executable scripts/tools under `~`, not `/work`.
EOF
  echo "  wrote agent container guidance to ~/.copilot/instructions/"
fi

# Hand off to the launcher (which starts the CLI server + portal). exec so the
# launcher becomes the container's main process and receives SIGTERM directly.
exec node dist/launcher.js "$@"
