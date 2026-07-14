# Running Squad Uplink in a Container

> **Status: experimental.** This runs the portal web UI together with the GitHub
> Copilot CLI (as a local subprocess) inside a single Docker container — handy for
> always-on, headless hosts like **TrueNAS SCALE**, Synology, or any Docker engine.
>
> Native `npm start` on Windows/macOS/Linux is unaffected by any of this. The
> container behavior is opt-in via the `COPILOT_CONTAINER` flag.

## What's in the image

A single container that, on start, launches `copilot --server` on an internal
port and the portal web server on **3847**. It includes:

- **Node 24** (base image)
- **PowerShell 7** (`pwsh`) — the Copilot CLI uses it to run shell-command tools
- **An agent toolset**, baked in so Copilot can actually do work in the box (the
  non-root user can't `apt install` at runtime): **Python 3** (+`venv`/`pip`) and
  **`uv`/`uvx`**, **`git`**, **`gh`** (GitHub CLI), **`jq`**, **`make`**,
  **`patch`**, **`zip`/`unzip`**, **`xz`** (so `.tar.xz` works), plus `wget`,
  `less`, and `openssh-client`. `npx`/`node` come with the base image.
- The built portal (`dist/`) and the **patched** `node_modules` (the `patch.mjs`
  SDK fix is applied at build time). The Copilot CLI (`@github/copilot` ≥ 1.0.65)
  ships its native runtime as per-platform optional dependencies, so npm installs
  only the `linux-x64` build that matches the image — there are no foreign-platform
  binaries to strip.

It also:

- **Runs as a non-root user** (`568:568` by default — TrueNAS SCALE's `apps`
  user) so files it writes to mounted datasets are owned sensibly. Override with
  `--build-arg PUID=… --build-arg PGID=…` at build, or `user: "uid:gid"` at run.
- **Puts `~/.local/bin` on `PATH`** so anything the agent installs with
  `uv tool install`, `pip install --user`, or a downloaded static binary is
  runnable by name — and, because `~` is a persistent volume (below), survives
  image updates.
- **Tells the agent about the container** — on boot the entrypoint writes a
  Squad Uplink-managed `~/.copilot/instructions/squad-uplink-container.instructions.md`
  so Copilot knows it's non-root with no `sudo`/`apt`, that system Python is
  PEP 668 externally-managed (use `uv`, a venv, or `pip install --user`), where to
  put binaries (`~/.local/bin`), and what persists. It never touches your own
  `~/.copilot/copilot-instructions.md`.
- **Exposes a health probe** at `GET /healthz` (unauthenticated, no secrets), wired
  to a Docker `HEALTHCHECK` so the engine/TrueNAS report real readiness.
- **Auto-creates a fresh per-session workspace** (`/work/YYMMDD-NN`) for each new
  session — see `PORTAL_WORKSPACE_DIR` below.

## Authentication

Authenticate GitHub one of two ways:

### Environment token (primary — best for headless)

Set a GitHub token with Copilot access in the environment and the CLI picks it up
on every boot — nothing to click, ideal for an always-on box. The CLI reads, in
order: `GITHUB_COPILOT_GITHUB_TOKEN`, `GITHUB_TOKEN`, `COPILOT_GITHUB_TOKEN`.

```bash
echo "GITHUB_TOKEN=ghp_xxxxxxxx" > .env   # next to docker-compose.yml
```

(On TrueNAS, set it as an environment variable in the Custom App instead of `.env`.)

### Sign in from the web UI (the normal interactive way)

No token set? The portal shows a sign-in screen with two tabs:

- **Browser sign-in (default)** — the portal runs GitHub's device-code flow and
  pre-fills the code/URL: open the link, authorize, done.
- **Access Token** — paste a fine-grained PAT with Copilot access instead.

Either way the credential persists (browser sign-in in the `copilot-home` volume;
a pasted PAT in `uplink-data`, re-injected as `COPILOT_GITHUB_TOKEN` each boot), so
you only do it once. The **Log out** button (Sessions panel) clears it.

> The portal also has its **own** session token (the key that gates who can open
> the web UI). That is separate from GitHub auth — see the next section.

## Portal session token (web access)

The portal is gated by a **session token** — a secret that anyone opening the web
UI must present (it's appended to the URL as `?token=...` and remembered by the
browser). This is independent of the GitHub credential the CLI uses.

**First run (claim it):** if no token is set, the first browser visit shows a
**"Generate session token"** screen. Click it, **copy the token (you won't see it
again)**, and you're in. Other devices open the same URL and paste the token once.

**Pin it instead (recommended for shared/exposed deployments):** set `PORTAL_TOKEN`
in `.env` to a known secret. The claim screen is skipped, the Open-WebUI URL is
predictable, and you rotate access by changing the value and redeploying.

**Remove it from the UI:** when signed in, the key icon next to **Log out**
(Sessions panel) removes the token — every device is signed out and the portal
returns to the claim screen. (This is disabled when `PORTAL_TOKEN` is set; change
the env var instead.)

**Forgot the token? Reset it from the host:**

```bash
# File-based token (no PORTAL_TOKEN set): delete it and restart.
docker compose exec squad-uplink rm -f /app/data/token.txt
docker compose restart squad-uplink
# → comes back up tokenless; the next browser visit shows "Generate session token".
```

If you pinned it with `PORTAL_TOKEN`, deleting the file won't help (the env value
re-pins on every boot) — change `PORTAL_TOKEN` in `.env` and run
`docker compose up -d` instead.

## Volumes (persist these)

| Volume | Container path | Holds |
| --- | --- | --- |
| `copilot-home` | `/home/copilot` | **The whole home dir** — GitHub auth, sessions, skills, agents, MCP config (`~/.copilot`) **and** anything the agent installs (`~/.local/bin`, venvs, caches). The important one. |
| `uplink-data` | `/app/data` | Squad Uplink-managed state — your **Guides & Prompts** (created, edited, or imported), Themes, session shields, session-agent assignments, the portal session token, pasted GitHub PAT, tunnel config, and debug logs. (The read-only *example* Guides/Prompts catalog ships in the image, not here.) |
| `work` *(bind mount)* | `/work` | Per-session workspaces Copilot reads/edits — bind-mounted to a host dir so it's easy to share on your LAN |

> **Why the whole home dir?** A single `copilot-home` volume (rather than just
> `~/.copilot`) means tools the agent installs into `~/.local/bin`, venvs, and npm
> caches also persist — and, being a real volume (not a network-share bind mount),
> it supports `chmod +x`, so those tools are actually runnable.

Mount the folders you want Copilot to operate on, or it only sees its own scratch
space. Example in `docker-compose.yml`:

```yaml
    volumes:
      - copilot-home:/home/copilot
      - uplink-data:/app/data
      - "${PORTAL_WORK_HOST_DIR:-./work}:/work"   # bind mount for LAN/SMB access
```

Set the host path in `.env` (defaults to `./work` next to the compose file):

```bash
PORTAL_WORK_HOST_DIR=/mnt/SSDs/copilot-work
```

> **File ownership:** the container runs its first-boot setup as **root**, chowns the
> managed data volumes (`/home/copilot`, `/app/data`) to `568:568`, and makes the
> `/work` mount point writable — then drops to that unprivileged user. So named
> volumes, TrueNAS ixVolumes, and a fresh bind mount all become writable
> automatically; there's no pre-chown dance. For an SMB-shared `/work` you'll still
> want the group setup below so your *other* accounts can read/write the files too.

## Sharing `/work` over SMB

The `/work` directory is a **bind mount** to a host directory precisely so you can
share it on your LAN. The container and an SMB share point at the *same* host
directory — it's the **default place where each new Copilot session gets its
working folder (CWD)** and where the agent writes any files it produces, so your
other computers can read/edit that output over the network. (Sessions, auth, and
keys live in the Docker-managed volumes, *not* here.)

The only thing to get right is **permissions**, because the container writes as
`568:568` and your SMB users are different accounts. The clean, collaborative model
is: **the agent is just another member of your read-write group, and the dataset's
ACL — not file ownership — decides who can read/write.** That way any file, whether
the agent created it or a human dropped it over SMB, is editable by all writers and
readable by all readers, regardless of who owns it.

The setup differs a little between a plain POSIX host (ext4/xfs) and a
ZFS/NFSv4-ACL dataset (the TrueNAS SCALE default). Pick the one that matches your
host.

### TrueNAS SCALE / any ZFS NFSv4-ACL dataset (recommended)

TrueNAS SMB datasets default to `acltype=nfsv4, aclmode=restricted,
aclinherit=passthrough`. On these, **POSIX mode bits, `chmod` setgid, and `umask`
are largely cosmetic** — real access *and inheritance* come from the NFSv4 ACL, not
from `chmod`/`UMASK`. So don't rely on the setgid+umask trick here; use inheriting
ACEs instead.

1. **Create a host dataset** and point both compose and SMB at it, e.g.
   `/mnt/SSDs/copilot-work` (set `PORTAL_WORK_HOST_DIR` in `.env`).
2. **Create your groups** as usual — e.g. `copilot-rw` (read-write) and
   `copilot-ro` (read-only) — and add your human users to them.
3. **Set inheriting NFSv4 ACEs on the dataset** so *new* files/dirs (from anyone)
   automatically grant the right access. In the TrueNAS UI: **Datasets → your
   dataset → Edit ACL**, add the entries below with the inherit flags **"apply to
   this dataset, child datasets, and files"**, and check **Apply permissions
   recursively**. Or from a root shell:
   ```bash
   # group RW: modify + full inheritance onto new files and dirs
   nfs4xdr_setfacl -a 'group:copilot-rw:rwxpDdaARWcCos:fd:allow' /mnt/SSDs/copilot-work
   # group RO: read + inheritance
   nfs4xdr_setfacl -a 'group:copilot-ro:rxaRcs:fd:allow'         /mnt/SSDs/copilot-work
   ```
   The `fd` (file+dir inherit) flags are what make *newly created* items writable —
   the job the old `chmod 2775`/`UMASK` recipe tried (and failed) to do on NFSv4.
4. **Give the container access via that same `copilot-rw` group** — set the
   **`WORK_RW_GID`** env var to the group's gid (e.g. `3003`). On boot the root
   entrypoint creates that gid inside the container and adds the runtime user to it
   *before* dropping privileges, so the agent writes files via the `copilot-rw`
   ACE exactly like your human RW users do. No rebuild needed — it's just an env
   var. (Look for `runtime user joined group … for /work RW access` in the logs.)
5. **Create the SMB share** on the dataset; grant `copilot-rw` read/write and
   `copilot-ro` read-only.

> **Why `WORK_RW_GID` is needed:** the agent runs unprivileged after a `gosu`
> privilege drop, and `gosu` builds the process's supplementary groups from the
> *image's* `/etc/group` only (it discards Docker `group_add`). `WORK_RW_GID` makes
> the entrypoint add the runtime user to your RW gid before that drop, so the
> membership actually reaches the running agent. Without it, the agent can still
> write files owned by its own gid (568), but **not** files a human created under
> the `copilot-rw` group.

### Plain POSIX host (ext4/xfs bind mount)

If `/work` is a normal Linux filesystem (not ZFS NFSv4), the classic setgid+umask
approach works:

1. Create the dataset/dir and your `copilot-rw`/`copilot-ro` groups (as above).
2. **Own + setgid the directory** so new files inherit the share group:
   ```bash
   chown -R 568:copilot-rw /srv/copilot-work
   chmod -R 2775 /srv/copilot-work      # 2 = setgid: new files keep the group
   ```
3. **Keep `UMASK=002`** (already set in compose) so files the container creates are
   group-writable (`664`/`775`).
4. **Set `WORK_RW_GID`** to the `copilot-rw` gid so the agent can also write files a
   *human* created under that group (setgid controls the group; membership controls
   whether the agent may write them).
5. Create the SMB share; grant `copilot-rw` RW and `copilot-ro` RO.

> The container makes the `/work` mount point writable on boot (it chowns the
> top-level to `568`), so it won't crash on a fresh dataset. It leaves an existing
> `568:`-owned dataset otherwise alone, so it won't clobber your group/ACL setup.

Over SMB you'll see one folder per session (`<session-id>/YYMMDD-NN/…`); that's
expected and makes browsing per-session output easy.

### Verifying the agent's real permissions (troubleshooting)

If writes fail, check the agent's **actual** identity — and beware a common trap:
`docker exec -u 568 …` is **not** a faithful test, because Docker auto-adds gid 568
to the exec'd process's supplementary groups, so a write test there can pass even
when the agent fails. Test like the real (gosu-dropped) agent instead:

```bash
C=ix-squad-uplink-squad-uplink-1   # your container name

# 1) memberships exist in the image's /etc/group:
docker exec "$C" getent group copilot          # -> copilot:x:568:copilot
docker exec "$C" getent group "$WORK_RW_GID"   # -> work-rw:x:<gid>:copilot  (if set)

# 2) the gosu-DROPPED user actually receives them (this is what the uid-only
#    `gosu "${PUID}"` form fixes; the old uid:gid form returned 568 only):
docker exec "$C" gosu 568 id                    # -> groups=568(copilot),<rwgid>(work-rw)

# 3) the LIVE agent process really has them (empty Groups = still broken):
grep ^Groups /proc/"$(pgrep -f 'dist/launcher.js' | head -1)"/status  # -> Groups: 568 <rwgid>

# 4) end-to-end: the agent's real creds can write a HUMAN-owned file on /work:
setpriv --reuid 568 --regid 568 --groups 568,<rwgid> \
  sh -c 'echo agent >> /work/<some-session>/probe.txt && echo WRITE_OK'
```

Expect the `Groups:`/`groups=` output to include `568` (the image self-membership)
plus your `WORK_RW_GID` if set. If it's **empty**, either you're on an image before
rc.24 (the `gosu` privilege drop was discarding the memberships) or the container is
running as a **Custom User** (non-root), which skips the entrypoint entirely — see
the caveat in the TrueNAS wizard table below. (Note: `docker exec -u 568 …` is *not*
a faithful test — Docker auto-adds gid 568, so it can pass even when the agent fails;
use `gosu`/`setpriv`/`/proc` as above.)

## Environment variables (config contract)

All optional unless noted. Defaults are baked into the image; the compose file
sets the common ones explicitly for visibility.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | *(empty)* | GitHub token with Copilot access — the **primary** auth path for headless use. Also read: `GITHUB_COPILOT_GITHUB_TOKEN`, `COPILOT_GITHUB_TOKEN`. |
| `PORTAL_TOKEN` | *(empty)* | Pins the portal **session token** (web-access key). Unset = first visit offers a one-time "Generate session token" claim. Set = predictable URL; rotate/reset by changing it + redeploying. See [Portal session token](#portal-session-token-web-access). |
| `PORTAL_WORKSPACE_DIR` | `/work` | Root under which new sessions auto-create `YYMMDD-NN` workspace folders. |
| `PORTAL_WORK_HOST_DIR` | `./work` | **Host** path bind-mounted to `/work`. Set to your shared dataset (e.g. `/mnt/SSDs/copilot-work`) for SMB access. |
| `UMASK` | `002` | umask for files written into `/work`. `002` = group-writable (`664`/`775`) for an SMB read-write group. **Note:** effective on plain POSIX (ext4/xfs) mounts; on ZFS/NFSv4-ACL datasets (TrueNAS default) it's largely cosmetic — use inheriting ACEs instead (see [Sharing /work over SMB](#sharing-work-over-smb)). |
| `WORK_RW_GID` | *(empty)* | gid of your host **read-write** group for a shared `/work` (e.g. your `copilot-rw` gid). On boot the entrypoint adds the runtime user to this group *before* dropping privileges, so the agent can write files that group owns — letting the agent and your SMB users edit each other's files. Needed because `gosu` only honors the image's `/etc/group` (it discards Docker `group_add`). See [Sharing /work over SMB](#sharing-work-over-smb). |
| `TZ` | `UTC` | Local timezone for log and workspace-folder timestamps (e.g. `America/Chicago`). |
| `COPILOT_CONTAINER` | `1` | Container mode: disables the in-app self-updater and apply endpoints. |
| `PORTAL_ALLOWED_HOSTS` | *(empty)* | Comma-separated extra hostnames allowed in the `Host` header (DNS-rebinding defense). IP-literal and `localhost` access always works; **only needed if you reach the portal through a custom domain or reverse proxy** (e.g. `portal.example.com,nas.local`). Unknown domain Hosts get `403`. |
| `COPILOT_AUTO_UPDATE` | `0` | Stops the CLI layer from self-updating (image-managed instead). |
| `PUID` / `PGID` | `568` / `568` | The uid/gid the app drops to after the root entrypoint fixes volume ownership. Also build args. Override via env (e.g. `PUID=1000`) to match a host account that owns your `/work` dataset. |

## Quick start (any Docker host)

Drop this `docker-compose.yml` next to an (optional) `.env`, then run
`docker compose up -d`. It pulls the published image — no build step. You can also
paste this same YAML straight into a TrueNAS Custom App's **Install via YAML** editor.

```yaml
services:
  squad-uplink:
    image: ghcr.io/swigerb/squad-uplink:latest
    container_name: squad-uplink
    init: true
    ports:
      - "3847:3847"
    environment:
      GITHUB_TOKEN: "${GITHUB_TOKEN:-}"   # optional — or sign in from the web UI
      PORTAL_TOKEN: "${PORTAL_TOKEN:-}"   # optional — pins the web-access token
      TZ: "${TZ:-UTC}"
      UMASK: "002"
      # WORK_RW_GID: "3003"   # optional — gid of your SMB read-write group so the
                              # agent can edit files your human users create on /work
                              # (see "Sharing /work over SMB"). ZFS/NFSv4 datasets
                              # also need inheriting ACEs; UMASK is POSIX-only.
    volumes:
      - copilot-home:/home/copilot
      - uplink-data:/app/data
      - "${PORTAL_WORK_HOST_DIR:-./work}:/work"   # host dir for the agent's CWD / LAN share
    restart: unless-stopped

volumes:
  copilot-home:
  uplink-data:
```

```bash
docker compose up -d                       # pulls the image and starts it
docker compose logs -f squad-uplink      # grab the session-token line
# open http://<host>:3847 and sign in to GitHub
```

(Prefer to build from source? Use the repo's `docker-compose.yml` with `build: .`
uncommented and `image:` commented out.)

## TrueNAS SCALE (Custom App)

TrueNAS SCALE (Electric Eel 24.10+) runs Docker. Deploy the **published GHCR
image** as a **Custom App** — no building required. Easiest is to paste the
[compose YAML above](#quick-start-any-docker-host) into the app's **Install via
YAML** editor. If you'd rather use the GUI wizard, here are its fields in the order
TrueNAS presents them:

| Wizard field | What to set |
| --- | --- |
| **Application Name** | App name `squad-uplink` (your choice); leave **Version** as-is — it's the Custom App wrapper's version, not the image's (you pick the image via Image Tag below). |
| **General** | **Notes:** optional free-text description. |
| **Image Configuration** | **Repository** `ghcr.io/swigerb/squad-uplink` (public — no login), **Tag** `latest` (or pin e.g. `0.8.0`), **Pull Policy** `Pull the image if it is not already present on the host` (choose the "always pull" option to force-refresh `latest` on every redeploy). |
| **Container Configuration** | Leave **Hostname** blank; **Entrypoint** and **Command** empty (the image defines them); set **Timezone** (e.g. `America/Chicago`); **Restart Policy** `Unless Stopped`; leave **Disable Built-in Healthcheck** unchecked (the image ships its own `/healthz`); leave **TTY** and **Stdin** unchecked (runs headless); no **Devices**. |
| **Container Configuration › Environment Variables** | Click **Add**, then set Name `UMASK` and Value `002` (makes agent-created files group-writable — for POSIX mounts; on a ZFS/NFSv4 dataset use inheriting ACEs instead). For a shared SMB `/work` where humans and the agent edit each other's files, also add Name `WORK_RW_GID` and Value `<your copilot-rw gid>` (see [Sharing /work over SMB](#sharing-work-over-smb)). Optionally add `GITHUB_TOKEN=<token>` (primary auth) and/or `PORTAL_TOKEN=<secret>` (pin the web-access token). `COPILOT_CONTAINER=1` is already baked in. |
| **Security Context Configuration** | Leave **Privileged** unchecked, **Capabilities** empty, and **Custom User** unchecked — the image already runs as `568:568` (TrueNAS's `apps` user). Only set a custom `uid:gid` if your `/work` dataset is owned by a different account. **Caveat:** setting a Custom User starts the container **non-root**, which skips the entrypoint's root self-heal *and* the `gosu` drop — so the `WORK_RW_GID` membership never gets applied. In that mode supply supplementary groups via Docker/compose `group_add: ["<gid>"]` instead. |
| **Network Configuration** | Leave **Host Network** unchecked (use the port mapping below, not the host's network stack); leave **Networks** empty (default bridge); leave **Custom DNS** (Nameservers / Search Domains / DNS Options) all empty. |
| **Network Configuration › Ports** | Add a port: Port Bind Mode `Publish port on the host for external access`, Host Port `3847` (pick another if taken), Container Port `3847`, Protocol `TCP`, Host IPs none. |
| **Portal Configuration** | Click **Add** and set Name `Web UI`, Protocol `HTTP`, **Use Node IP** checked, Port `3847`, Path `/`. Gives you a clickable button on the app card. **Tip:** once you have a session token — either the one you generate from the portal UI on first visit or a pinned `PORTAL_TOKEN` — edit Path to `/?token=<that-value>` so the button opens already signed in. The token is stored in the app config, so only do this on a trusted/personal NAS. |
| **Storage Configuration** | Add the three mounts below. |

**Storage Configuration** — add three mounts. For every entry, leave **Read Only**
and **Enable ACL** off; you only set the **Type**, the **Mount Path** (the
in-container path), and the one type-specific field:

| Type | Mount Path | Then set | Holds |
| --- | --- | --- | --- |
| `ixVolume` | `/home/copilot` | Dataset Name `copilot-home` | Auth, sessions, skills, agents, and agent-installed tools. |
| `ixVolume` | `/app/data` | Dataset Name `uplink-data` | Portal session token + saved PAT. |
| `Host Path` | `/work` | Host Path, e.g. `/mnt/SSDs/copilot-work` | The agent's working dir — share it over SMB. Must be writable by `568:568`. |

> **Why ACL/user are left alone:** the image already runs as `568:568` (TrueNAS's
> `apps` user), so you don't set a user unless your `/work` dataset is owned by a
> different account. Leave **Enable ACL** off on all three — the volumes don't need
> it, and for `/work` you manage the share's permissions on the dataset itself (see
> [Sharing /work over SMB](#sharing-work-over-smb)).

Click **Install**, then open `http://<nas-ip>:3847` (or click the **Web UI** button)
and sign in.

## Updates

The container is immutable, so the in-app self-updater is **disabled**
(`COPILOT_CONTAINER=1`). Update by **pulling a newer image** — the portal and the
bundled `@github/copilot` CLI/SDK are versioned together in the image tag:

```bash
docker compose pull            # fetch the newest :latest (or change the pinned tag)
docker compose up -d           # recreate the container; volumes carry over
```

On TrueNAS, edit the Custom App and bump the image tag (or re-pull `latest`), then
redeploy. Your `copilot-home` (auth, sessions, skills, **and agent-installed
tools**) and `uplink-data` (portal token + PAT) persist across the swap.

## What changes in container mode

- **In-app update banners/buttons are suppressed** — `/api/updates/apply*` return a
  "managed by the image" message instead of mutating the container.
- **Runs non-root** (`568:568`) — see the file-ownership note under Volumes.
- **Health probe** — `GET /healthz` backs a Docker `HEALTHCHECK`; orchestrators show
  the container as healthy once the HTTP server is answering.
- **Graceful shutdown** — `init: true` (tini) runs as PID 1 to forward `SIGTERM` and
  reap the CLI subprocess on `docker stop`.
- **The terminal Console keys** (`[u]`, `[t]`, `[r]`, …) require a TTY and are
  inactive in a detached container. Native equivalents: `docker logs` (event log),
  the in-UI **Restart Portal / Restart Copilot** buttons, an image pull (update),
  `docker stop` (quit).

## Caveats / open items

- **Token expiry/refresh** in a long-lived headless container — if a credential
  expires, just sign in again from the web UI (or refresh the `.env` token value).
- **Tunnel** (remote access) is untested in-container; LAN access works out of the
  box since the server binds `0.0.0.0`. Don't expose 3847 to the internet without a
  reverse proxy + real auth.
- **MCP servers** — Node (`npx`) and Python (`uvx`/venv) based servers run out of
  the box thanks to the bundled toolset. A server that needs some *other* binary
  must have it present in the image (rebuild) or be reachable as a remote/HTTP MCP.
  See **Adding a local (stdio) MCP server** below for how install-time files persist.

## Adding a local (stdio) MCP server

Remote/HTTP MCP servers are just a URL — nothing to persist. **Local `stdio` servers**
(a script the CLI launches, e.g. a Python `server.py`) have two parts, and **both live
under `~/.copilot`, so both persist** via the `copilot-home` volume across container
restarts **and** image updates:

| Part | Path | Persists? |
| --- | --- | --- |
| Registration (command/args/env) | `~/.copilot/mcp-config.json` | ✅ in `copilot-home` |
| The server's own files/code | `~/.copilot/mcp-servers/<name>/…` | ✅ in `copilot-home` |
| Its runtime deps (if `--user`/`uv`) | `~/.local/…`, venvs | ✅ in `copilot-home` |

Guidance:

- **Add the server from *inside* the container** (via the web UI / agent), not by copying
  a config from your desktop. The `command`/`args` paths are **OS-specific** — a desktop
  config points at a Windows/macOS path (e.g. `C:\Users\you\.copilot\mcp-servers\…`) that
  doesn't exist in the Linux container. Installing in-container writes a native path.
- **Install Python deps so they persist:** the non-root user can't write system
  site-packages (PEP 668), so use `uv`/`uvx`, a venv, or `pip install --user`. Anything in
  `~/.local` / venvs under `~` rides the `copilot-home` volume and survives updates.
  (System `pip install` would be lost on the next image pull *and* fails for the non-root user.)
- **Interpreters already resolve:** `python` (aliased to `python3`), `python3`, `uv`, `uvx`,
  and `node`/`npx` are all on `PATH` in the image — no extra setup needed to launch them.
- **A server needing some *other* binary** (not Python/Node) must be baked into the image
  (rebuild) — the agent can't `apt-get` at runtime as the non-root user.
