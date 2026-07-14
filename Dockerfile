# syntax=docker/dockerfile:1
#
# Squad Uplink — container image (experimental).
#
# Runs the portal web UI together with the GitHub Copilot CLI (as a local
# subprocess) in a single container. Designed for headless hosts such as
# TrueNAS SCALE, Synology, or any Docker engine.
#
# Auth: provide a GitHub token via the GITHUB_TOKEN env var, and/or mount a
# pre-authenticated ~/.copilot directory as a volume (see docs/DOCKER.md).

# ---- Stage 1: build (esbuild for the server + Vite for the web UI) ----
FROM node:24-bookworm AS builder
WORKDIR /app

# Install root deps first for better layer caching.
# The `postinstall` hook runs patch.mjs, which fixes a broken ESM import in
# @github/copilot-sdk — so the patched node_modules is produced here.
COPY package.json package-lock.json patch.mjs ./
RUN npm ci --no-fund --no-audit

# Install web UI deps (separate package.json).
COPY webui/package.json webui/package-lock.json ./webui/
RUN cd webui && npm ci --no-fund --no-audit

# Copy the rest of the source and build (produces dist/, including dist/webui).
COPY . .
RUN npm run build

# NOTE: @github/copilot >=1.0.65 ships its native runtime as per-platform optional
# dependencies (@github/copilot-<os>-<arch>); npm installs only the one matching the
# build arch, so there are no foreign-platform binaries to prune. The old
# prebuilds/mxc-bin trim step was removed (the package no longer vendors them).

# ---- Stage 2: runtime ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# Non-root runtime user. Defaults to 568:568 — TrueNAS SCALE's "apps" user — so
# files written to bind-mounted datasets (e.g. /work shared over SMB) are owned
# correctly out of the box. Override at build time for other hosts:
#   docker build --build-arg PUID=1000 --build-arg PGID=1000 .
# or at run time with `user: "1000:1000"` in docker-compose.yml.
ARG PUID=568
ARG PGID=568

# PowerShell 7 — the Copilot CLI uses `pwsh` to execute shell-command tools.
# Without it, command-running tools degrade. Pinned; bump as needed.
#
# Runtime tools baked into the final image. The non-root runtime user has no sudo
# and CANNOT apt-install at runtime, so anything the agent should always have must
# be added here at build time. Polyglot-lean: Python is included (Copilot reaches for
# it constantly + many stdio MCP servers need it); Go and C/C++ compilers are still
# omitted to keep the image reasonable — add them if you need them.
#  - curl/wget: fetch files (curl also used by the HEALTHCHECK and the pwsh download).
#  - git (+ openssh-client, less): clone/commit/diff, git-over-SSH, pager for git output.
#  - gh: GitHub CLI (PRs, issues, releases) — installed from GitHub's official apt repo.
#  - zip/unzip/xz-utils/patch/make/jq: everyday archive (incl. .xz/.tar.xz), patch, build-driver, and JSON tooling.
#  - python3/python3-venv/python3-pip: Python runtime + venv/pip for scripting and Python MCP servers.
#    NOTE: Debian marks system Python "externally managed" (PEP 668) AND the non-root user can't write
#    system site-packages, so prefer `uv`, a venv, or `pip install --user` (~/.local persists via the home volume).
#  - uv: Astral's fast Python package/Tool runner; `uvx` is how many MCP servers launch. Installed as a
#    static binary to /usr/local/bin; manages venvs/tools into ~ (persistent) and works fine non-root.
#  - lsof: used by "Restart Copilot" to free port 3848 before relaunching the CLI.
#  - tzdata: lets the TZ env set the container's local time (log + folder timestamps).
ARG PWSH_VERSION=7.6.3
ARG UV_VERSION=0.11.28
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git openssh-client less zip unzip xz-utils patch make jq gosu \
      python3 python3-venv python3-pip libicu72 lsof tzdata \
 && mkdir -p -m 755 /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-linux-x64.tar.gz" -o /tmp/pwsh.tar.gz \
 && mkdir -p /opt/microsoft/powershell/7 \
 && tar zxf /tmp/pwsh.tar.gz -C /opt/microsoft/powershell/7 \
 && chmod +x /opt/microsoft/powershell/7/pwsh \
 && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh \
 && rm /tmp/pwsh.tar.gz \
 && curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz" -o /tmp/uv.tar.gz \
 && tar zxf /tmp/uv.tar.gz -C /tmp \
 && install -m 0755 /tmp/uv-x86_64-unknown-linux-gnu/uv /usr/local/bin/uv \
 && install -m 0755 /tmp/uv-x86_64-unknown-linux-gnu/uvx /usr/local/bin/uvx \
 && rm -rf /tmp/uv.tar.gz /tmp/uv-x86_64-unknown-linux-gnu \
 && ln -sf /usr/bin/python3 /usr/local/bin/python \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create the non-root user/group and the directories that volumes mount onto,
# owned by it. Docker initializes a fresh named volume with the ownership of the
# image dir it covers, so the default volumes are writable without any chown dance.
# `~/.local/bin` is pre-created (and on PATH below) so `pip install --user` and
# `uv tool install` land somewhere runnable that also persists via the home volume.
# `usermod -aG copilot copilot` makes the runtime user an explicit SUPPLEMENTARY
# member of its own group. This looks redundant (568 is already the primary gid),
# but it is NOT — do not "simplify" it away. `gosu` builds the process's
# supplementary group list from /etc/group memberships only, and on ZFS/NFSv4-ACL
# filesystems (TrueNAS SMB datasets) a `group@`/named-`group:` write ACE is honored
# only when the owning gid is in the process's SUPPLEMENTARY set — the primary gid
# alone is not evaluated. Without this line, `useradd -g` leaves `copilot:x:568:`
# with an empty member list, so after the gosu drop the agent has an empty
# supplementary list and cannot write group-owned files on a bind-mounted /work.
# Referenced by name so it survives the entrypoint's runtime `groupmod -o -g` renumber.
RUN groupadd -g "${PGID}" copilot \
 && useradd -u "${PUID}" -g "${PGID}" -m -d /home/copilot -s /usr/sbin/nologin copilot \
 && usermod -aG copilot copilot \
 && mkdir -p /home/copilot/.copilot /home/copilot/.local/bin /app/data /work \
 && chown -R copilot:copilot /home/copilot /app /work

# Bring over the built app and the patched node_modules from the builder.
COPY --from=builder --chown=copilot:copilot /app/dist ./dist
COPY --from=builder --chown=copilot:copilot /app/node_modules ./node_modules
COPY --from=builder --chown=copilot:copilot /app/package.json ./package.json
COPY --from=builder --chown=copilot:copilot /app/BUILD ./BUILD
COPY --from=builder --chown=copilot:copilot /app/bin ./bin
# Read-only example Guides/Prompts catalog served by /api/examples (the "Start
# from" templates). Lives at /app/examples (= __dirname/../examples). Without
# this the multi-stage final image would drop it and the picker shows only
# Blank + Import. The desktop zip ships it via package.mjs's file list.
COPY --from=builder --chown=copilot:copilot /app/examples ./examples

# Entrypoint (strip any CRLs so it runs on Linux regardless of host checkout).
# Use an absolute chmod mode (0755) — `chmod +x` is masked by the build host's
# umask, which on some hosts leaves the file non-readable/-executable for the
# non-root runtime user (exit 126: Permission denied).
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod 0755 /usr/local/bin/docker-entrypoint.sh

# Container-mode behavior:
#  - COPILOT_CONTAINER=1 disables the portal's in-app self-updater (updates come
#    from rebuilding/pulling the image, not from mutating this running container).
#  - COPILOT_AUTO_UPDATE=0 stops the CLI layer from self-updating too.
#  - HOME points at the non-root user's home so ~/.copilot resolves there.
#  - PORTAL_WORKSPACE_DIR=/work makes new sessions auto-create their per-session
#    workspace (YYMMDD-NN) under the mounted /work volume by default. Without this
#    the portal falls back to <appRoot>/work (/app/work) — ephemeral and NOT the
#    bind mount — so workspaces wouldn't survive updates or appear over SMB. Setting
#    it here means a bare `docker run` or a TrueNAS Custom App works with no extra
#    env var (compose still sets the same value explicitly).
#  - PATH puts ~/.local/bin first so agent-installed tools (pip --user, uv tool
#    install) are runnable by name; the CLI's shells are non-interactive and don't
#    source ~/.profile, so this must be set explicitly here.
ENV COPILOT_CONTAINER=1 \
    COPILOT_AUTO_UPDATE=0 \
    NODE_ENV=production \
    PUID=${PUID} \
    PGID=${PGID} \
    HOME=/home/copilot \
    PORTAL_WORKSPACE_DIR=/work \
    PATH="/home/copilot/.local/bin:/app/node_modules/.bin:${PATH}"

# Build-time version stamps, queryable via `docker inspect` without running the
# container. These are the PINNED build-time values; the runtime-actual versions
# are also emitted to the console at startup ([Versions] …). The standard
# org.opencontainers.image.* labels (version/revision/source) are applied by CI's
# docker/metadata-action. PORTAL/CLI/SDK are passed by CI as build args (resolved
# from the repo + lockfile); pwsh/uv reuse the install ARGs above; node is the base.
ARG PORTAL_VERSION=unknown
ARG CLI_VERSION=unknown
ARG SDK_VERSION=unknown
LABEL com.squad-uplink.portal-version="${PORTAL_VERSION}" \
      com.squad-uplink.cli-version="${CLI_VERSION}" \
      com.squad-uplink.sdk-version="${SDK_VERSION}" \
      com.squad-uplink.node="24-bookworm-slim" \
      com.squad-uplink.pwsh="${PWSH_VERSION}" \
      com.squad-uplink.uv="${UV_VERSION}"

EXPOSE 3847

# Mark the container healthy once the HTTP server answers the unauthenticated
# /healthz probe. Gives Docker/TrueNAS a real readiness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:3847/healthz" > /dev/null || exit 1

# NOTE: we intentionally do NOT set `USER` here. The container starts as root so
# the entrypoint can fix ownership of freshly-mounted volumes (TrueNAS ixVolumes
# and host bind-mounts arrive empty + root-owned), then drops to ${PUID}:${PGID}
# via gosu before launching the app. The running process is therefore unprivileged.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
