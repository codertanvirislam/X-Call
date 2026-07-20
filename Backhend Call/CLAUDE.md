# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-tenant "calling platform as a service" built on Asterisk: 100+ phone
numbers (each its own provider sub-account/trunk), assignable to tenant
users who each get a bearer token to place calls via an HTTP API, with
webhooks for call events and an admin panel to manage numbers/tenants/tokens.
Originally a single-tenant PBX for "Selorax" (still present: a WebRTC test
softphone on extension `7001` and desk extensions `6001`/`6002`) — that part
still works unchanged and coexists with the platform layer.

Raw Asterisk `.conf` file comments are written in Banglish (Bengali +
English) — keep that style when editing them. Python code uses normal
English comments.

## Commands

Bring up the full stack:
```
docker compose up --build -d
```
Services: `asterisk`, `postgres` (Asterisk's own realtime `ps_*` tables
only, as of the MySQL migration), `mysql` (the app's own business tables),
`api` (FastAPI, tenant + admin API/UI), `worker` (ARI listener, webhook
dispatcher, reconciliation, reload coordinator, health poller, and others —
see Architecture), `caddy` (reverse proxy). Every service has a `mem_limit`/
`cpus` cap and (except `postgres`/`mysql`, which already had one, and
`caddy`) a `healthcheck` — `docker compose ps` shows `(healthy)`/`(unhealthy)`
per service; `api`'s hits `GET /healthz`, `worker`'s reads the heartbeat
file `worker/heartbeat.py` writes every 15s (see Architecture).

**Static Asterisk config is baked into the image at build time**
(`COPY`'d in the Dockerfile) — editing `config/*.conf` needs a rebuild to
take effect. **Numbers/trunks are realtime** (Postgres-backed) — admin
panel or API changes take effect live, no rebuild/restart needed (see
Architecture). Secrets (`config/res_pgsql.conf`, `ari.conf`,
`manager.conf`) are rendered from `.template` files at container start by
`docker-entrypoint.sh`, from env vars in `.env` — never baked into the image.

Apply the app's own MySQL schema (first-time setup, or after a `models.py`
change):
```
docker compose run --rm api alembic upgrade head
```
(`db/app-schema.mysql.sql` is a fresh-install reference/fallback, kept in
sync with the Alembic migrations by hand — day-to-day changes should go
through `alembic revision --autogenerate` instead of editing it directly.)

`.env` holds all generated secrets (gitignored). If missing, generate with
`openssl rand -hex 24` per value — see `docker-compose.yml` for which keys
are expected (`POSTGRES_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`,
`ARI_PASSWORD`, `ASTERISK_DB_PASSWORD`, `AMI_HEALTH_POLLER_PASSWORD`,
`TOKEN_HASH_PEPPER`, `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD`). `DATABASE_URL`
is optional — if set, it overrides the local `mysql` compose service
entirely (point it at an external managed MySQL instance for production);
must use the `mysql+aiomysql://` scheme specifically (SQLAlchemy's async
MySQL dialect), not a bare `mysql://` DSN.

**Optional production-tuning env vars** (all have sane defaults, only set
these to override): `UVICORN_WORKERS` (default 4 — `api`'s uvicorn worker
process count; safe to raise, `api` holds no in-process state, everything
is DB-backed) · `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` (default 20/20 for `api`,
10/10 for `worker`) and `REALTIME_DB_POOL_SIZE`/`REALTIME_DB_MAX_OVERFLOW`
(default 5/10 and 5/5) — total MySQL connections opened by `api` alone ≈
`UVICORN_WORKERS × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`, confirm the target
MySQL instance's `max_connections` comfortably exceeds this (see
`app/db.py`'s engine comment) · `ASTERISK_CAPACITY_WARN_THRESHOLD` (default
80 — see the Known Gaps note on Asterisk's scaling ceiling).

Run the test suite (`backend/tests/` — see Known Gaps):
```
docker compose run --rm -v "$(pwd)/backend:/srv" \
    -e MYSQL_ROOT_PASSWORD=$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) \
    api sh -c "pip install -r requirements-dev.txt && pytest -v"
```
Runs against an isolated `callplatform_test` database on the same local
`mysql` service — never against whatever `DATABASE_URL` is actually
configured to (see `backend/tests/conftest.py`'s module docstring for why
that distinction is enforced in code, not just by convention).

Bulk-add numbers (the intended way to add 100+, not one at a time via the
admin UI):
```
python3 scripts/bulk_import_numbers.py numbers.csv \
    --base-url https://your-domain --admin-password "$ADMIN_PASSWORD"
```
CSV columns: `id,e164,provider_password,channel_limit,enabled`.

Nightly DB backup (run via cron on the droplet, not in a container — see
the script's header for required env vars):
```
scripts/backup_db.sh
```

Useful Asterisk CLI checks (`docker exec asterisk-dev asterisk -rx "..."`):
- `pjsip show endpoints` — static (7001/6001/6002/selorax-trunk) + realtime
  numbers, all in one list
- `pjsip show registrations` — trunk registration status (ground truth;
  ARI's endpoint state is NOT reliable for this, verified empirically)
- `dialplan show from-trunk-realtime` — the platform's inbound entry point

## Architecture

### Asterisk layer

**`Dockerfile`** — Debian 11 + Asterisk + openssl + gettext-base (for
`envsubst`, used by `docker-entrypoint.sh` to render secret-bearing config
from `.template` files at container start).

**`config/pjsip.conf`** — only fixed/internal objects now: `transport-udp`
(5060), `transport-ws` (8088, WebRTC), `[7001]`/`[6001]`/`[6002]`. Provider
trunks (`selorax-trunk` and all platform numbers) live in **Postgres
realtime**, not here — see below.

**Realtime PJSIP** (`config/sorcery.conf`, `config/extconfig.conf`,
`config/res_pgsql.conf.template`) — `res_config_pgsql` (native, no ODBC)
reads `ps_endpoints`/`ps_auths`/`ps_aors`/`ps_endpoint_id_ips`/
`ps_registrations` from Postgres, using a least-privilege `asterisk_ro` role
(`SELECT`-only on those tables; the app's `platform_rw` role does the
writing). `sorcery.conf` maps **both** the static `pjsip.conf` file and
realtime for the same object types — static objects are checked first, so
`7001`/`6001`/`6002` keep working unchanged. Endpoint/auth/aor/identify
lookups are live per-call, no reload needed; **registration** changes need
a `pjsip reload` (handled automatically by `worker/reload_coordinator.py`,
debounced).

**Security incident, caught live in production**: each number's `ps_aors`
row only ever carried a static `contact` pointing at icctalk (no dynamic
registration is ever legitimate against a trunk endpoint — icctalk sends
us calls and challenges our own outbound REGISTER, it never registers
*into* us), but `ps_endpoints` set `outbound_auth` without also setting
`auth` (inbound). Without an inbound `auth`, Asterisk accepts a REGISTER
for that endpoint from *anyone*, no password needed. An external host
(unrelated to icctalk) exploited exactly this gap, registering a bogus
dynamic contact against a number's AOR that then won contention against
the real static contact for outbound routing — every outbound call on
that number silently dialed nowhere for hours before it was traced.
**The fix was `max_contacts=0` on `ps_aors`, not `auth=` on
`ps_endpoints`** — `services/realtime_sync.py::sync_number_to_realtime`
sets it on every number now, automatically, no per-number manual step
needed. Setting inbound `auth` instead was tried first and reverted
immediately: it also blocks icctalk's own legitimate unauthenticated
inbound INVITEs (trunk providers are trusted by IP, not challenged), so it
silently broke every inbound call the moment it deployed. `max_contacts=0`
closes the actual hole (nothing can ever register a dynamic contact
against these AORs again) without touching how INVITEs are authenticated
at all, since INVITE handling never goes through the registrar/AOR
contact-claim logic in the first place.

The `ps_*` tables were created via Asterisk's own official Alembic
migration chain (vendored at the exact matching version in
`db/realtime-migrations/`, run via `db/realtime-migrations/migrate.sh`) —
never hand-write this schema. Note: that migration tooling needs
`sqlalchemy<2.0 alembic<1.8` pinned (see the requirements.txt in that
directory) — modern SQLAlchemy 2.x silently no-ops the commit against this
Asterisk-authored `env.py`, a real bug hit and worked around during
development.

**`config/extensions.conf`** — dialplan:
- `[from-internal]` / `[from-trunk]` / `[store-a]` / `[store-b]` — original
  Selorax logic, untouched. `selorax-trunk`'s inbound context is still
  `from-trunk` (legacy), even though it's now a realtime `numbers` row.
- `[from-trunk-realtime]` — the platform's inbound entry point, one static
  `Stasis(callplatform,inbound)` line that **never changes as numbers
  scale** (no per-DID dialplan entries). New realtime numbers get
  `context=from-trunk-realtime`; `worker/ari_listener.py::
  _handle_inbound_start` resolves which `Number` a call landed on via
  `channel["dialplan"]["exten"]` (the actual dialed DID, read straight off
  the `StasisStart` event, already present with no extra ARI round-trip) —
  matched against `Number.e164`. **Real cross-tenant bug, caught live**:
  this used to resolve via `CHANNEL(endpoint)` instead — every one of an
  account's numbers registers as its own PJSIP endpoint, but they all share
  icctalk's one signaling IP, and this Asterisk build has no header-based
  endpoint identifier module installed (`res_pjsip_endpoint_identifier_header.so`
  is genuinely absent — confirmed via `module show like identifier`, only
  `_ip`/`_user`/`_anonymous` exist), so `identify_by=ip` is inherently
  ambiguous once there's more than one number: every inbound call, for
  every number, silently landed on whichever endpoint happened to match
  first — e.g. a call to number 3 played number 1's workflow. The dialed
  extension has no such ambiguity (it's exactly what the caller dialed),
  so resolving on that instead sidesteps the identify-by-IP problem
  entirely rather than solving it — `config/sorcery.conf`'s per-number
  `ps_endpoint_id_ips` row still exists (see `services/realtime_sync.py`)
  but its only remaining job is "accept the INVITE at all," not "tell us
  whose it is."

**`config/manager.conf.template`** (AMI) — used only by
`worker/health_poller.py`. Real Asterisk quirk worth knowing: **AMI action
dispatch (even read-only queries) is gated on the `write` class, not
`read`** — `write=` empty means no action can ever execute. The health
poller account has `write = system,reporting` — exactly the two classes
`PJSIPShowRegistrationsOutbound` needs, deliberately excluding
`originate`/`call`/`command` so it still can't control calls.

**`config/ari.conf.template`** — the `asterisk-app` ARI user, used only by
`worker/ari_listener.py`. `/ari/*` is never exposed publicly — see Caddy
below.

**Production-only: Bangladesh trunk relay (WireGuard).** `selorax-trunk`'s
provider (icctalk) rejects SIP registration/traffic from a non-Bangladesh
source IP — the DigitalOcean droplet has no BD-based IP of its own, so
production routes all trunk-bound traffic through a WireGuard tunnel to a
separate BD-hosted VPS, which relays it out on a BD-registered public IP.
This is **droplet-level host config, outside Docker and outside this repo**
— nothing to build/deploy, but essential to know when debugging trunk
connectivity in production (local dev never goes through this at all):
- `/etc/wireguard/wg0.conf` on the droplet (systemd `wg-quick@wg0.service`,
  enabled + active) — the droplet is `10.10.10.2/24`; the BD VPS is the
  `[Peer]`, tunnel address `10.10.10.1`, public `Endpoint` on port `51820`.
- **`AllowedIPs` does double duty** — it's both the inbound decrypt filter
  AND, for anything listed, an actual outbound route through `wg0` (visible
  in `ip route show` as a host route). It must include the trunk provider's
  own SIP server IP, not just the BD VPS's tunnel address `10.10.10.1/32`
  — otherwise outbound trunk traffic never routes through the tunnel at
  all. Real, live-hit gotcha during setup, not a theoretical one.
- **`config/pjsip.conf`'s `transport-udp`** advertises
  `external_media_address`/`external_signaling_address` as the **BD VPS's
  own public IP** (its WireGuard `Endpoint`), not the droplet's — so
  icctalk's response/media traffic targets the BD VPS, which relays it
  back through the tunnel to the droplet. `transport-ws` (WebRTC, browser
  softphones) is unaffected by any of this — it still advertises the
  droplet's own public IP, since browser clients connect to the droplet
  directly, never through the BD relay.
- This is exactly why `config/pjsip.conf` is environment-specific and
  **must never be blindly synced** from a local dev checkout to the
  droplet — local dev's own `external_media_address` (a residential/dev-box
  IP, only useful for testing directly against a real trunk) and the
  droplet's BD-relay IP are deliberately different values, hand-maintained
  per environment. `docker-compose.yml`/`config/rtp.conf` are safe to sync
  as-is (verified identical droplet-vs-local as of this note); `config/
  pjsip.conf` is not — diff it first, every time, before ever copying it to
  production. **`scripts/deploy.sh`** (see README.md) enforces this in
  code, not just in this note: it diffs `config/pjsip.conf` against the
  droplet's live copy before touching anything and hard-stops the whole
  deploy (backend included) if they differ, printing exactly what a human
  needs to review — always deploy through it rather than hand-rolling
  `rsync`/`ssh` again.
- Fragile against either side's public IP changing (a dynamic residential/
  hosting IP) — happened for real once already, see the dated comment in
  `config/pjsip.conf`. If the trunk starts rejecting registration/calls
  again in production, check `wg show` on the droplet for a recent
  handshake first (see README.md's Troubleshooting), then re-verify the
  WireGuard `Endpoint`/`AllowedIPs` and pjsip.conf's advertised addresses
  still match current reality. The BD VPS **drops ICMP even when healthy**
  — ping is useless as a health check for it (a real red herring during
  the 2026-07-19 outage diagnosis); the honest probe is the admin panel's
  System Status tunnel indicator (a SIP OPTIONS round-trip through the
  tunnel, see the health_poller note below) or `wg show`'s
  latest-handshake age.

**Production-only: fail2ban (droplet host, outside Docker and this repo).**
The public SIP port draws constant scanner/toll-fraud floods (real
measurements: 15k+ rejected requests/minute, 41MB of Asterisk log in 4
minutes, plus one successful REGISTER hijack — see the Realtime PJSIP
security note above). Manual IP blocking lost that race, so the droplet
runs fail2ban watching the asterisk container's docker json log:
- `/etc/fail2ban/filter.d/asterisk-docker.conf` — matches
  `pjsip_distributor` NOTICE failures AND `res_pjsip_registrar` "unable to
  register" WARNINGs (the latter is what a scanner whose From-user happens
  to match a trunk endpoint id produces — it sails past auth since trunk
  endpoints deliberately have none, and only `max_contacts=0` stops it).
  `datepattern` is pinned to the docker json `time` field — fail2ban
  0.11's auto-detection crashes (IndexError) on the embedded ANSI color
  escapes.
- `/etc/fail2ban/jail.d/asterisk-docker.local` — bans into the
  **`DOCKER-USER`** chain (`chain = DOCKER-USER`, `protocol = all`):
  docker-published ports bypass INPUT entirely, and the flood is UDP —
  the first attempt (default INPUT + tcp) banned successfully while
  blocking nothing, a real trap. `ignoreip` covers docker-internal
  (**critical**: browser softphones arrive via Caddy as 172.18.0.2 — a
  tenant typo'ing their SIP password must never get Caddy banned, which
  would take down all web traffic), WireGuard nets, icctalk, and the BD
  relay. `logpath` is a glob over all container log dirs — resolved at
  jail start, so after the asterisk container is ever recreated (new
  container id = new log path), run `fail2ban-client reload
  asterisk-docker` or bans silently stop updating.

### Backend (`backend/`)

Two services from one image (`backend/Dockerfile`), split because a
persistent ARI WebSocket consumer must be a singleton and shouldn't share a
failure domain with the stateless API:

- **`app/`** (service `api`) — FastAPI. Every `/v1/*` tenant endpoint uses
  `app/auth.py::bearer_auth`, which now requires **both**
  `Authorization: Bearer <token>` **and** `X-User-Id: <user_id>`, rejecting
  (401) if they don't match the same account — the token alone already
  uniquely determines the owner (every query is scoped by `token.user_id`
  regardless), so this is deliberate defense-in-depth against a client
  sending a stale/mismatched token+account pairing, not what actually
  enforces per-tenant isolation. `admin_tokens.py`'s `IssueTokenResponse`
  and the admin panel's "Issue new token" page both now echo `user_id`
  alongside the raw token so operators hand out both together.
  `routers/calling.py` is the tenant API (`POST /v1/calls` — agent-mediated,
  or `workflow_id` set for a no-agent outbound IVR call, see the workflow
  engine note below — `GET /v1/calls`, `GET /v1/calls/{id}`,
  `GET /v1/calls/{id}/recordings`). `routers/transfers.py` — `POST /v1/calls/{id}/transfer`
  (blind or attended), `.../transfer/{id}/complete`, `.../transfer/{id}/cancel`
  — see `services/transfers.py` and the transfer note below.
  `routers/workflows.py` — HTTP-Basic-protected IVR/workflow CRUD for
  operator/global workflows (`Workflow.user_id IS NULL`, usable by any
  tenant but only editable by the operator; always `kind="outbound"` today —
  nothing resolves a global workflow for inbound). `routers/tenant_workflows.py`
  is the bearer-auth equivalent for tenant-owned ones (`Workflow.user_id`
  set, scoped and only usable/editable by that tenant), path-scoped by
  `Workflow.kind` (`/v1/workflows/outbound`, `/v1/workflows/inbound` — see
  the workflow engine note below) — same `app/schemas/workflow.py`
  node/definition schema for both, so validation never drifts between them.
  `routers/tenant_webhooks.py` —
  `GET /v1/webhooks`, a read-only activity log of this tenant's own
  `webhook_outbox` deliveries (event/url/status/response_status), so a
  tenant can confirm a webhook actually fired without standing up a
  receiver first. The Selx Softphone app has UI for both (Workflows tab —
  a simple form builder, not raw JSON; Webhooks tab).
  `admin_ui.py` mounts SQLAdmin for Users/Extensions/Tokens/Partners/
  Numbers/Calls (session auth, `/admin/login`); `NumberAdmin.after_model_change`
  calls `services/realtime_sync.py` so admin edits and API edits stay
  consistent. `routers/admin_tokens.py` / `admin_numbers.py` are
  HTTP-Basic-protected (`admin` / `ADMIN_PASSWORD`) routes for token
  issuance and bulk number import — not exposed through SQLAdmin's generic
  form (token creation needs server-side random generation + show-once,
  which a plain model form can't do securely). `routers/partner_users.py` /
  `admin_partners.py` are the Partner API — see the note below.

  **Creating a Partner from the panel itself** — `PartnerCreateView`
  (`admin_ui.py`), a real "New Partner" sidebar entry, not a button bolted
  onto `PartnerAdmin`'s own list page. sqladmin's `list.html`/`details.html`
  templates each have exactly one Jinja block (`content`) spanning the
  entire page body — there's no narrower block to override just a toolbar
  button without forking the whole template, an ongoing maintenance cost
  for one link. A dedicated `BaseView` + `@expose` page (sqladmin's own
  supported extension point for a non-model page) is the sturdier way to
  get a real create flow with the same show-once-key requirement
  `PartnerAdmin`'s `can_create = False` already exists for. **Register any
  `BaseView` via `admin.add_view(...)`, never `admin.add_base_view(...)`
  directly** — only `add_view` sets `view._admin_ref` before delegating,
  and `login_required` (sqladmin's own `@expose` auth wrapper) silently
  no-ops without it ("If no authentication backend is setup, this will do
  nothing") — a real, live auth-bypass gap this session hit, then caught
  and fixed via an end-to-end test asserting an unauthenticated request
  gets redirected, not a 200.

  **A "+ New Partner" button in the list toolbar too, without forking
  list.html** — `PartnerAdmin.list_template = "admin/partner_list.html"`
  (`ModelView`'s own per-view template override point;
  `templates/admin/partner_list.html`, discoverable because sqladmin's
  Jinja `ChoiceLoader` checks `templates_dir` — default `"templates"`,
  relative to the process CWD, i.e. `/srv` in the `api` container, see
  `Dockerfile`'s `COPY templates ./templates` — before falling back to its
  own bundled templates). The single-`content`-block limitation above is
  still real, but doesn't have to mean a full fork: this override
  `{% extends "sqladmin/list.html" %}` and calls `{{ super() }}` to render
  the *entire* original page unchanged, then appends one `<script>` that
  finds the toolbar's existing `.card-header .ms-auto` container (the same
  element the stock `can_create=True` "+ New {model}" button always
  renders into) and inserts the link client-side. No template content is
  duplicated, so there's nothing to drift out of sync on a future sqladmin
  upgrade — only `PartnerAdmin` sets `list_template`, every other
  `ModelView` renders sqladmin's stock list page untouched.

  **Usage reports** — `AdminReportsView` (same file), three more hidden
  `BaseView` pages (`is_visible` returns `False` — reachable only via a
  "View usage report" link added to `UserAdmin`/`PartnerAdmin`/
  `NumberAdmin`'s own `column_details_list` through
  `column_formatters_detail` returning `markupsafe.Markup(...)` — Jinja
  autoescapes formatter output by default, so a plain f-string with an
  `<a>` tag renders as literal escaped text without it). Per-user: total/
  answered/failed call counts, total talk time, and a **talk-time-by-line
  breakdown** — correlated via `Call.bridge_to_number` (only ever set by
  `services/calls.py::claim_and_originate` for an agent-mediated call, see
  that column's own docstring), matched against the account's own primary
  `softphone_extension` and any `Extension` rows. **Known gap, not a
  bug**: an inbound call answered by one line of a multi-extension
  ring-group isn't attributed to that specific line either —
  `worker/ari_listener.py` never stamps `bridge_to_number` for inbound at
  all — so it (and every IVR/blast call, which has no agent leg to begin
  with) falls into one shared "No agent line" bucket instead of a
  per-line one. Per-partner: which Users it has actually provisioned —
  derived from `partner_webhook_outbox`'s own `user.created` delivery log
  (`payload["user_id"]`), since there's no direct `Partner`→`User` foreign
  key at all (a partner-created User is otherwise indistinguishable from
  one an operator created by hand). Per-number: call count/talk time
  grouped by `Call.user_id`, for a Number that's shared across several
  accounts (or was, historically).

- **`worker/`** (service `worker`) — nine always-on asyncio tasks via
  `asyncio.gather` in `main.py` (not `return_exceptions=True` — safe in
  practice because every one of the nine wraps its own per-cycle body in
  its own `try/except`, so no task's error ever reaches `gather` at all;
  see `ari_listener.py`'s note below for why that pattern exists):
  - `ari_listener.py` — the ARI event stream. Handles inbound calls
    (`StasisStart` with `args==["inbound"]`), the two-leg outbound bridge
    (agent leg answers → dial customer leg → bridge on customer answer),
    and hangup via **`ChannelDestroyed`, not `StasisEnd`** — a call that
    fails before being answered never gets a `StasisStart`/`StasisEnd` pair
    at all, only `ChannelDestroyed` (real bug hit and fixed during
    development). Each event is dispatched through a try/except wrapper so
    one bad event can't crash the whole worker (also a real bug once: a
    bridging-logic edge case for inbound calls crashed the entire process,
    taking webhook delivery and reconciliation down with it).
  - `webhook_dispatcher.py` — drains `webhook_outbox` via
    `SELECT ... FOR UPDATE SKIP LOCKED` (claimed atomically via
    `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, not a
    select-then-commit-then-process pattern, which would silently defeat
    the lock — also a real bug hit during development). HMAC-SHA256 signs
    (`X-Signature: t=<ts>,v1=<hex>`), SSRF-guards (https-only, re-resolves
    + blocks private/loopback/link-local/metadata ranges on every
    connection attempt including redirect hops), exponential backoff.
    Deliveries within a batch run concurrently now (bounded by
    `DELIVERY_CONCURRENCY`, default 10, via `_deliver_batch`) — the original
    sequential `for` loop meant `BATCH_SIZE` (20) slow/timing-out receivers
    could take up to 20×5s to clear one poll tick while new rows kept
    queuing; each delivery is independent (own session, own commit) so this
    was safe to parallelize. `return_exceptions=True` there too, logged
    explicitly per row — one row's unexpected error never affects its
    batch-mates.
  - `reconciliation.py` — every 60s, diffs ARI's live channel list against
    `calls` rows with `slot_released_at IS NULL`, force-releases stragglers
    (covers an ARI WebSocket drop losing a hangup event) and anything over
    a 4h max duration. **Real bug caught during hardening**: `Call.started_at`
    is a `DateTime(timezone=True)` column, but MySQL's async dialects
    (aiomysql/asyncmy alike) return it as a *naive* datetime regardless —
    subtracting it from `datetime.now(timezone.utc)` raised `TypeError` on
    every sweep tick whenever any call was in progress, meaning this sweep
    likely never completed successfully in production. Fixed via
    `app/db.py::as_aware_utc()` (also applied to `services/calls.py`'s
    `circuit_broken_until` check, which had the identical bug) — normalizes
    a naive value to UTC before comparing. Apply this to any *new* Python-side
    comparison of a fetched `DateTime(timezone=True)` value against an aware
    `now` — SQL-side comparisons (raw `text()` WHERE clauses) are unaffected,
    MySQL compares the raw stored values regardless of tzinfo.
  - `workflow_reconciliation.py` — every 60s, mirrors the sweep above for
    `workflow_runs`: a row stuck at `status="running"` whose `Call` already
    has `slot_released_at` set (the call ended, normally or via the sweep
    above) gets marked `status="error"`/`error_reason="worker_restart_orphan"`.
    This is what `WorkflowRun`'s own docstring in `models.py` used to flag as
    "not implemented yet" — a worker restart mid-IVR left that row stuck at
    `running` forever with no cleanup. Cleanup/observability only, same as
    `WorkflowRun` itself — doesn't resume the run.
  - `heartbeat.py` — writes the current time to `/tmp/worker_heartbeat` every
    15s. `worker` has no HTTP surface, so this is the liveness signal
    docker-compose's healthcheck reads (`time.time() -
    getmtime('/tmp/worker_heartbeat') < 60`) — catches the whole event loop
    wedging (not one task misbehaving; every task above already survives its
    own bad events via its own try/except).
  - `reload_coordinator.py` — polls `platform_state.reload_requested_at`
    every 2s, issues at most one `pjsip reload` per batch of number changes
    (debounced — bulk-importing 100 numbers doesn't trigger 100 reloads).
  - `health_poller.py` — polls `PJSIPShowRegistrationsOutbound` via AMI
    every 30s. 3 consecutive non-`Registered` statuses circuit-breaks a
    number (`numbers.circuit_broken_until` set, its `ps_registrations` row
    deleted so Asterisk stops retrying — directly targets the stale-password
    retry-storm incident from early development). Recovery is a manual
    admin action (fix `provider_password`, re-enable — re-syncs the row).
    `circuit_broken_until` is deliberately never cleared on recovery — it
    just lapses; everything that reads it (claim_number_slot, this poller's
    own query, the System Status page below) must treat "in the past" as
    healthy, not "was ever set" (a real display bug hit on the status
    page's first day). Also runs `_check_capacity()` each cycle — Asterisk
    is a single instance with no horizontal scaling path (see this file's
    Known Gaps note), so once active ARI channels reach
    `ASTERISK_CAPACITY_WARN_THRESHOLD` (default 80) this logs a warning.
    Observability only, not an enforced cap.

    **Status snapshot + admin System Status page** — every poll cycle also
    writes `platform_state.trunk_status` (JSON: `checked_at`, a tunnel
    probe, and the per-registration status map straight from AMI), read by
    `admin_ui.py::SystemStatusView` — a *visible* sidebar entry (unlike
    AdminReportsView's hidden pages), auto-refreshing every 15s, with a
    loud staleness warning if the snapshot stops updating (dead worker
    must not silently show stale green). The tunnel indicator is
    `ari_client.get_endpoint("PJSIP", "selorax-trunk")`'s `state` —
    OPTIONS-qualify through the BD relay to icctalk, i.e. a real SIP
    round-trip over the actual production path, not a ping (the relay VPS
    drops ICMP even when healthy, a real red herring during the
    2026-07-19 outage diagnosis). ARI endpoint state IS reliable for
    qualify results — the "unreliable" warning elsewhere in this file is
    specifically about registration status. Built because of that outage:
    the relay dropped ~40 min, every registration silently entered a
    terminal `Rejected` state, and nothing surfaced it until users
    reported dead calls.

    **Registrations stuck `Rejected` after a transport outage** — real
    incident, 2026-07-19: `ps_registrations` rows carry
    `auth_rejection_permanent='yes'`, so registrations that fail during a
    tunnel/relay outage can land in a terminal state that a plain
    `pjsip reload` (or `module reload res_pjsip_outbound_registration.so`)
    does NOT clear once the path is back. Recovery that actually works:
    re-run `sync_number_to_realtime` for the affected numbers (deletes +
    recreates their `ps_registrations` rows = fresh sorcery objects; the
    reload coordinator picks it up) — same cycle as any admin-panel number
    save. All 8 registrations re-registered within a minute of doing this.
  - `dynamic_tts_cleanup.py` — hourly, deletes `dyn_tts_*.ulaw` cache files
    (per-call dynamic TTS, see `app/services/tts.py::dynamic_voice_name`)
    whose mtime is older than `dynamic_tts_cache_max_age_days` (default 30).
    Disk hygiene only, not correctness-critical — the `dyn_tts_` prefix keeps
    it from ever touching tenant-named `tts-user-*` prompts.
  - `recording_uploader.py` — every 10s, claims `recordings` rows in
    `status='pending_upload'` (same `FOR UPDATE SKIP LOCKED` claim idiom as
    `webhook_dispatcher.py`), streams the file from ARI
    (`GET /ari/recordings/stored/{name}/file` — `asterisk` and `worker` are
    separate containers with no shared volume, so this can't just read a
    local path) to a tempfile, uploads to S3-compatible storage (`boto3`,
    configured via `RECORDING_S3_*` env vars — a no-op, marked `failed`
    immediately, if unset), then deletes both the tempfile and the
    Asterisk-side stored recording. A ~5-hour catch-up sweep (every 30
    ticks) cross-checks ARI's live stored-recordings list against DB rows
    stuck in `status='recording'`, mirroring `reconciliation.py`'s
    live-channel-diff technique for a missed `RecordingFinished` event.
    Recording itself starts in `worker/ari_listener.py::_bridge_call` (not
    here) — if `users.recording_enabled`, `MixMonitor`-equivalent
    (`POST /ari/bridges/{id}/record`) starts the moment the call bridges.

- **Workflow/IVR engine** (`worker/workflow_runner.py`) — a Python state
  machine driven by ARI Stasis events (`ChannelDtmfReceived`,
  `PlaybackFinished`), **not** in-Asterisk scripting. `Workflow.kind`
  (`'inbound'` | `'outbound'`) splits a tenant's workflows into two fully
  independent slots — at most one of each per account (see
  `routers/tenant_workflows.py`'s `/v1/workflows/{kind}`), separately
  created/edited/deleted, never sharing content. **"outbound"** is what
  `POST /v1/calls {"workflow": true}`/`workflow_id` (`routers/calling.py`)
  resolves for a no-agent outbound call — `workflow_id` is rejected (404)
  if it names anything but an "outbound"-kind workflow. **"inbound"** is
  what a dedicated number's own inbound calls automatically run
  (`worker/ari_listener.py::_handle_inbound_start`): a dedicated number
  (`Number.assigned_user_id` set) resolves `Workflow.user_id ==
  Number.assigned_user_id AND Workflow.kind == "inbound"` — a tenant with no
  inbound workflow saved falls straight through to the ordinary
  softphone/`bridge_number`/`fallback_number` ring cascade, unchanged. A
  **common/shared** number (`assigned_user_id IS NULL`) never runs a
  workflow on inbound at all — there's no single owning tenant to derive one
  from, so it always goes straight to that same ring cascade. (`Number`
  used to carry its own `workflow_id` column for this — removed, since it
  let one fixed workflow silently apply to whichever tenant's call happened
  to land on a number, which was surprising given a shared number can serve
  multiple tenants.) Because the softphone's simple form builder
  (`WorkflowBuilder.tsx`) lets a `voice`-less node fall back to an
  account-wide named TTS prompt (see below), and an account can now hold one
  workflow of each kind simultaneously, the fallback prompt name itself is
  kind-namespaced to avoid the two silently overwriting each other's audio
  on the same digit: `"default"` for outbound (unchanged, so no existing
  account needs to resave anything), `"inbound_default"` for inbound — see
  `worker/workflow_runner.py::_default_prompt_name`/`_RunState.kind`. Five
  node types (`play`/`prompt`/`forward`/
  `transfer_agent`/`hangup`); a `prompt` node's branch resolution cascade is
  exact and easy to get subtly wrong: real digit → `branches[digit]`, else
  `branches["_default"]`; timeout (no digit) → `branches["_timeout"]`, else
  `branches["_default"]`; nothing resolves → `workflow_error` + hangup. **An
  empty-string branch target means "no transition, end cleanly" — leave the
  channel exactly as-is, don't hang up** — this is a distinct, deliberate
  case from the `hangup` node type, not a bug; a loop guard caps any single
  node at 5 visits per run. Run state is in-memory only, keyed by the
  driving channel id (same precedent as `_ringback_playbacks` below) — a
  `workflow_runs` DB row exists for observability, not as authoritative
  state, so a worker restart mid-IVR orphans that one call (no
  reconciliation for this yet). `forward`/`transfer_agent` nodes reuse the
  existing two-leg bridge machinery unchanged once the new leg is up — a
  workflow-originated call becomes an ordinary bridged call from that point
  on. **Real bug caught during development**: `_finish()` used to
  unconditionally cancel the run's own pending prompt-timeout task; when a
  timeout itself fires and its own call chain reaches `_finish()`, that
  cancels the *currently executing* task, silently aborting whatever ran
  after (e.g. the `hangup` node's ARI call) via a `CancelledError` at the
  next `await` with no visible error. Fixed by checking
  `asyncio.current_task()` before cancelling.

- **Call blast** (`app/routers/call_blasts.py`, `worker/blast_runner.py`,
  `app/services/call_blasts.py`) — bulk outbound-workflow calling: a
  dedicated-Number tenant pastes a list of numbers, picks a workflow, and
  reserves a slice of that Number's own `channel_limit`
  (`Number.reserved_channels`) specifically for it. **The reservation is a
  real, DB-enforced guarantee, not just pacing**: `services/calls.py::
  claim_number_slot` caps an *ordinary* call (agent-mediated, `workflow:
  true`) at `channel_limit - reserved_channels`, but a blast-originated
  claim (`for_blast=True`) checks against the full `channel_limit` — the
  blast's own pacing in `blast_runner.py` never asks for more than its own
  reservation concurrently anyway, so this one-sided cap is what actually
  keeps ordinary traffic from crowding the blast's slice out, without
  literally partitioning the Number into two pools.

  **Every `CallBlast.status` transition goes through one function**,
  `services/call_blasts.py::transition_blast` — locks the row
  (`SELECT ... FOR UPDATE`), re-verifies the current status, adjusts the
  reservation, and writes the new status, all in one commit. This exists
  because the first version of this feature read `status` unlocked in
  `pause`/`resume`/`cancel`/natural-completion, and two independent code
  reviews (ahead of the first public launch) both independently confirmed
  the same real bug: two concurrent transitions on the same blast (a
  double-clicked Pause, an HTTP client retrying a timed-out-but-actually-
  succeeded request, or a user action racing `blast_runner`'s own 5s tick)
  could both pass the stale status check and both fire a reserve/release —
  corrupting `reserved_channels` for a completely different blast sharing
  the same Number. `create_blast` similarly reserves capacity via
  `reserve_capacity_uncommitted` (no commit of its own) so the reservation
  and the `CallBlast`/`CallBlastTarget` rows land in one all-or-nothing
  commit — the original version committed the reservation separately
  first, so a failure creating the rows afterward (e.g. a large bulk
  target insert hitting a transient DB error) permanently leaked the
  reservation with no row left to ever release it.

  `worker/blast_runner.py` paces dialing up to the reserved concurrency
  (`SELECT ... FOR UPDATE SKIP LOCKED` claim, same idiom as
  `webhook_dispatcher.py`/`recording_uploader.py`), and reconciles each
  `CallBlastTarget`'s entire retry chain (original attempt + every retry —
  see the retry note below) to a real outcome. **A chain's fate is fully
  answered by `retry_scheduled_at is not None` on its latest-attempt row
  alone** — an earlier version additionally required
  `retry_attempt >= len(schedule)`, which left a target stuck in
  `"calling"` forever (permanently leaking its reservation slot) whenever
  a chain ended via `retry_scheduler.py`'s "token revoked" / "no outbound
  number available" dead-end paths instead of genuine schedule exhaustion
  — both are equally "nothing more will ever happen to this number," but
  only exhaustion pushes `retry_attempt` up. `_dial_one` also re-checks
  `blast.status == "running"` immediately before actually placing each
  call — a target already marked `"calling"` in one tick can otherwise get
  dialed *after* a pause/cancel already released the reservation backing
  it, silently bypassing the just-released guarantee via `for_blast=True`'s
  full-`channel_limit` ceiling.

  Reuses the workflow's own `retry_schedule_minutes` for no-answer
  retries — no separate retry concept for a blast — and
  `retry_scheduler.py` itself checks the owning blast's status before
  spawning a redial (skips, doesn't mark handled, if paused/cancelled, so
  a later sweep tick after resume picks it back up naturally). Pausing
  releases the reservation immediately; already-connected calls keep
  running to their own natural end, untouched. Cancelling is permanent —
  numbers never dialed are marked `"skipped"`; numbers already `"calling"`
  are deliberately left alone so `blast_runner` can still resolve them to
  a real outcome even after the blast itself is cancelled.

- **Per-account call balance** (`User.balance_seconds`, `app/services/
  calls.py::_require_positive_balance`, `app/routers/balance.py`,
  `app/routers/partner_users.py`'s balance endpoint) — a prepaid-minutes
  model, stored internally as whole seconds (never minutes) for exact
  per-second billing, checked before a call is allowed to start and
  deducted only once it ends. Applies uniformly to **every** outbound
  call path on the platform — agent-mediated (`POST /v1/calls`),
  Extension-native (`POST /v1/calls/extension`, billed against the
  *owning* account — an Extension has no balance of its own),
  workflow/no-agent calls, `retry_scheduler.py` redials, and Call Blast
  targets — because `_require_positive_balance` is called from inside
  `services/calls.py`'s three origination functions
  (`claim_and_originate`/`claim_and_originate_for_extension`/
  `claim_and_originate_workflow_call`) themselves, before any channel slot
  is claimed, rather than at the router level: `retry_scheduler.py`/
  `worker/blast_runner.py` call `claim_and_originate_workflow_call`
  directly and never go through an HTTP router at all, so hooking the
  routers instead would have missed both. Raises `402 Payment Required`
  ("insufficient balance") — unused by anything else in this codebase, the
  unambiguous choice. **Never billed**: inbound calls (no existing
  convention here treats an inbound call as a cost to the receiving
  tenant) and ring time (only `answered_at -> ended_at`, computed inside
  `services/calls.py::release_slot` — the one idempotent chokepoint every
  hangup/failure/reconciliation path already funnels through, so this is
  where the deduction lives too, extending its existing locked-row read
  to also pull `Call.user_id`/`Call.direction`). **Deliberately allowed to
  go negative**: the balance check only ever runs when a NEW call is about
  to start — a call already in progress when the account hits zero is
  never force-terminated, it's simply allowed to finish and take the
  balance slightly negative.

  `worker/blast_runner.py::_dial_one` already branched on
  `HTTPException.status_code` to decide whether a failed target gets
  retried later (`429`/`503`, transient) or marked permanently
  `"done"/"error"` (anything else) — `402` was added to the transient
  branch alongside them, since a blast can run for hours and an account
  topped up mid-run should resume automatically rather than leaving every
  target it happened to hit while empty permanently stuck.

  Two GET endpoints mirror the account/extension auth split used
  everywhere else in this codebase: `GET /v1/balance` (`bearer_auth`,
  `token.user_id`) and `GET /v1/balance/extension` (`extension_auth`,
  `extension.user_id`'s *owning* account — same reasoning as every other
  Extension-scoped endpoint, it has no balance of its own). Topping up is
  partner-initiated only, no tenant self-service endpoint exists yet:
  `POST /v1/partners/users/{user_id}/balance` (`app/routers/
  partner_users.py`) reuses the existing `_require_own_user` ownership
  check unchanged (a partner may only fund a User it actually created) and
  the same self-attested `?is_paid=true` convention `enable_user_feature`
  already established — always additive (`minutes * 60` added to
  `balance_seconds`), never a correction mechanism. The admin panel adds a
  separate, operator-only path for that: `UserAdmin`'s detail page links
  to `/admin/user-balance/{user_id}` (`AdminReportsView`, same
  hidden-`BaseView` pattern as the usage-report/feature-toggle pages),
  which offers both "Add" (identical additive semantics to the Partner
  API, usable on *any* User regardless of who created it) and "Set" (an
  absolute overwrite, for fixing a mistake without doing the arithmetic
  by hand — the Partner API has no equivalent, deliberately, since a
  partner correcting *anyone's* balance to an arbitrary value is a much
  bigger trust boundary than topping up its own users).

- **ARI-based live call transfer** (`app/services/transfers.py` +
  `worker/ari_listener.py`) — blind and attended, both fully DB-driven via
  `call_transfers` (never in-memory state shared across the `api`/`worker`
  process boundary — the exact same reasoning `services/calls.py` already
  uses for call origination). `api` fires one synchronous ARI call and
  returns immediately; every subsequent step (the new leg answering or
  failing) is picked up by `worker/ari_listener.py`'s existing
  `ChannelStateChange`/`ChannelDestroyed` handlers, extended with an early
  check for a pending/consulting transfer matching the event's channel id
  (a transfer leg's channel id is never one of `Call.agent_channel_id`/
  `customer_channel_id`, so this check is safe to run unconditionally before
  the ordinary call-leg lookup). Blind: swap the new leg into the existing
  bridge, hang up the old one; on failure, the original call is left running
  **untouched** (graceful abort). Attended: pull the agent leg into a new
  consult bridge, MOH the customer, ring the agent while the consult leg
  dials; `.../complete` swaps the consult party into the main bridge and
  drops the original agent; `.../cancel` restores the original agent leg.
  **Real bug caught during development**: the consult-leg ringback
  playback id was first tracked in an in-memory dict — but starting the
  transfer runs in `api` while stopping that playback runs in `worker`,
  separate processes with no shared memory, so the dict populated in one
  process was never visible in the other. Fixed by persisting it on the
  `call_transfers` row instead (`ringback_playback_id`). An Extension
  session (no `Token`) transfers through a separate `extension_auth`
  router reusing these same `services/transfers.py` functions — see "An
  Extension placing a call directly through the HTTP API" below for that
  router's own scoping.

- **Partner API** (`app/routers/partner_users.py` + `admin_partners.py`,
  `app/auth.py::partner_auth`) — lets an external company provision
  platform Users programmatically instead of an operator doing it by hand
  through the admin panel. A `Partner` row (`api_key_hash`/`api_key_prefix`,
  hashed the same way as `Token.token_hash`) authenticates via
  `X-Api-Key`, minted/revoked only through `admin_partners.py`
  (HTTP-Basic `require_admin`, same as tokens/numbers — key shown once,
  same reasoning as token issuance). Two `partner_type`s with different
  rules on `POST /v1/partners/users`: `"direct"` creates a User with no
  `bridge_number` (set later via a separate, not-yet-built API) — the
  simple/trusted-partner path; `"reseller"` requires `bridge_number` in
  the request body **and** `?is_paid=true&is_verified=true` query params
  (self-attested by the reseller's own backend — not independently
  verified) or the request is rejected (403/422) with no User created.
  On success the endpoint provisions the User's softphone line
  (`services/softphone.py`, same call as the admin panel's "Provision
  softphone line" action) and a bearer `Token` in one request, then
  returns only `{"status": "queued", "user_id": ...}` synchronously — the
  actual credentials (bearer token, extension, extension password, the new
  User's own `webhook_secret`) are delivered **only** via an async webhook
  to the Partner's own `webhook_url`, via `PartnerWebhookOutbox` (see
  below), never in the HTTP response itself.

- **Per-user feature flags** (`app/services/features.py`, `user_features`
  table, `User.created_by_partner_id`) — placing an ordinary call
  (`POST /v1/calls` with no `workflow`/`workflow_id`) is never gated; every
  other capability (call recording, call blast, IVR workflows/TTS,
  multi-extension lines, call transfer) is gated per-User by a flag. Which
  of the platform's **three ways a User gets created** decides the starting
  state: an operator creating one by hand (`UserAdmin.insert_model`,
  `admin_ui.py`) or a **"direct"** Partner (`create_partner_user`,
  `routers/partner_users.py`) both call
  `seed_features_for_new_user(all_enabled=True)` — every feature on
  immediately. A **"reseller"** Partner's own Users get
  `all_enabled=False` — everything off except calling, until the reseller
  calls `POST /v1/partners/users/{user_id}/features/{feature}?is_paid=true`
  (self-attested, same trust model as `is_paid`/`is_verified` at creation)
  to turn one on. That endpoint is scoped by `User.created_by_partner_id`
  (set once at creation, doubles as the audit trail for "which Partner made
  this User") — a reseller can only touch a User it created itself, 404
  otherwise (also 404 for a User with `created_by_partner_id IS NULL`, i.e.
  admin-created). `require_feature(slug)` (a `Depends`-based dependency
  factory, reusing `bearer_auth`'s cached per-request resolution) is
  mounted at the router level on `call_blasts.py`/`tenant_workflows.py`/
  `tenant_tts.py`/`transfers.py`, and checked inline in
  `routers/calling.py::originate_call` for a workflow-mode call and in
  `worker/ari_listener.py::_handle_inbound_start` before resolving an
  inbound workflow (silently falls through to the ordinary ring cascade
  there instead of rejecting — there's no HTTP request to 403 on an
  inbound call) and in `ExtensionAdmin.provision_softphone_action` for
  `multi_extension`. "recording" is deliberately **not** a row in
  `user_features` — `is_feature_enabled`/`set_feature_enabled` special-case
  it onto the pre-existing `User.recording_enabled` column instead, so the
  admin panel's toggle page can show it alongside the other four as one
  uniform list without a second, separately-plumbed mechanism.
  `AdminReportsView`'s `/admin/user-features/{user_id}` page (linked from
  `UserAdmin.column_formatters_detail`, same "hidden BaseView" pattern as
  the usage reports above) is a plain checkbox form for an operator to
  toggle any of the five by hand — independent of the reseller API, e.g.
  to correct a billing state manually or to turn something off for an
  otherwise-all-enabled admin/direct-partner account. The migration
  introducing `user_features` backfills **every existing User** to all
  five enabled (a grandfather clause) — the gating system didn't exist
  before this, so no already-live account should suddenly lose access to
  something it was already using.

- **Public identifiers + phone-number login** (`User.phone_number`/
  `.slug`, `Extension.phone_number`/`.slug`, `app/services/identifiers.py`,
  `app/routers/account_auth.py`) — the raw auto-increment `id` on `User`/
  `Extension` stays a purely internal PK (used everywhere inside this
  codebase exactly as before) and is never handed to an external partner
  or login client going forward, since two sequential integers seen over
  time trivially reveal account growth/count. `slug` is the public-facing
  mask instead: `User.slug` is an 8-char random code from a 32-symbol
  alphabet (`models.py::generate_user_slug`, a bare column default — no
  DB-side collision check, same risk posture as `webhook_secret`'s own
  default just above it, since the combinatorics make a real collision
  negligible at any scale this platform is realistically at).
  `Extension.slug` can't use a bare default the same way — it's formatted
  `"<owning User's slug>-ext-<n>"`, which needs the parent's slug plus a
  DB lookup at generation time, so it's computed explicitly wherever an
  Extension is created (`ExtensionAdmin.insert_model`, `admin_ui.py`) via
  `app/services/identifiers.py::generate_extension_slug` — `n` is a
  **per-user** counter (not the Extension's own global id), so two
  different users' first lines are both legibly "...-ext-1" instead of
  continuing one platform-wide sequence that would leak total Extension
  count too.

  `phone_number` (nullable at the DB level, for pre-existing rows with
  nothing real to backfill it with) is **required going forward** on
  every creation path — `routers/partner_users.py::create_partner_user`'s
  request body, and `UserAdmin`/`ExtensionAdmin`'s admin-panel create
  forms (enforced in `insert_model`, since the column itself has to stay
  nullable — see each override's own comment). It's what
  `POST /v1/auth/login` (`app/routers/account_auth.py`) authenticates
  against: given `{mode: "user"|"extension", identifier, credential}`,
  `mode` picks which table `identifier` resolves against (explicit rather
  than inferred — a raw numeric id is otherwise ambiguous between the two
  tables), `identifier` is tried as `phone_number` first and only falls
  back to being read as that table's raw `id` if it's purely digits and no
  phone_number matched. `mode="user"` then checks the bearer token;
  `mode="extension"` checks `softphone_password` (plaintext-stored, same
  trust boundary as a SIP trunk's own `provider_password` — compared via
  `secrets.compare_digest`, not hashed, since Asterisk's realtime
  `ps_auths` row needs it directly). Returns which account/line it is
  **by slug**, never the raw id — a generic 401 for any mismatch (unknown
  identifier, wrong credential, or `identifier`/`credential` sent under
  the wrong `mode`) so none of those cases is distinguishable from
  outside. Doesn't mint any new credential of its own; it's purely
  "confirm this identifier+secret pair is genuinely valid and tell me
  which account that is." The `mode="user"` response also includes the
  account's own `softphone_password` — deliberate: presenting the full
  bearer token already proves complete account ownership (the platform's
  highest tenant privilege), so handing back the SIP secret too doesn't
  grant any new capability, it just means a client only needs an
  identifier + token to get everything needed to also register the
  SIP/WebRTC line, without a second credential entered separately (see
  selx-softphone's SettingsForm for the client side of this).

  `app/auth.py::bearer_auth` gained a second, optional way to declare
  which account a request is acting as: `X-Phone-Number`, alongside the
  original `X-User-Id` (still required exactly as before if you send it —
  this is additive, not a replacement; at least one of the two headers is
  required, both are checked if both are sent). Same reasoning as
  X-User-Id's own docstring: the bearer token alone already determines
  the owning account for every query regardless of either header, so this
  is defense-in-depth against a stale/mismatched credential pairing, not
  what actually enforces tenant isolation.

  **An Extension placing a call directly through the HTTP API** —
  `POST /v1/calls/extension` + `GET /v1/calls/extension/{id}`
  (`routers/calling.py`), authenticated by `app/auth.py::extension_auth`
  (`X-Extension-Identifier` + `X-Extension-Password`, same
  phone-or-raw-id resolution as `POST /v1/auth/login`'s `mode="extension"`
  path, shared via `find_extension_by_identifier`) instead of a bearer
  token — an Extension never gets one (only the account owner does, see
  Extension's own docstring in models.py), so there was previously no way
  for it to "just place a call" through this API at all, only via native
  SIP dialing (still true for internal/sibling dialing and phone-keypad
  transfer codes, see the multi-extension note above — this is
  specifically about the tenant HTTP API). `services/calls.py::
  claim_and_originate_for_extension` mirrors `claim_and_originate`'s own
  ring-then-bridge flow exactly (rings the Extension's own line, then once
  answered the worker dials `to` and bridges them — full `Call` row,
  webhooks, status polling, all the same machinery a User's own call gets)
  but claims **no Token slot** — there isn't one — only the Number's own
  `channel_limit`, the same simplification already established for a SIP
  phone's own native internal-dialing. `Call.token_id` stays `NULL`
  (`release_slot` already treats that as "nothing to credit back");
  `Call.user_id` is the *owning account's* id for reporting purposes, not
  a per-Extension id space (there isn't one). Deliberately minimal
  compared to the tenant endpoint — no workflow/webhook_url/
  agent_extension fields, no rate limiting beyond the Number's own cap.
  **Transfer/merge**: `app/routers/transfers.py::extension_router`
  (`POST/GET /v1/calls/extension/{id}/transfer/*`, prefix
  `/v1/calls/extension`) is the `extension_auth` equivalent of the tenant
  transfer router below — same `TransferRequest`/`TransferResponse`
  shapes and the same `services/transfers.py` functions underneath, just
  scoped tighter: `_get_owned_call_for_extension` requires
  `Call.bridge_to_number == extension.softphone_extension` (this
  Extension's own line, not just anywhere on the account), vs. the tenant
  router's account-wide `Call.user_id == token.user_id`. Gated by the same
  `transfer` feature flag via `require_feature_for_extension` (`app/
  services/features.py` — the extension-auth equivalent of `require_feature`,
  since an Extension has no `Token` to satisfy that dependency's own
  `bearer_auth` resolution with). `selx-softphone`'s `TransferPanel.tsx`
  branches on `settings.mode` to call the right API functions;
  `GET /v1/extensions/mine` (`app/routers/tenant_extensions.py`, same
  `extension_auth`) is what populates its one-click sibling-line list for
  an extension-mode session, mirroring the bearer-only `GET /v1/extensions`
  right above it.

  **Extension call history** — `GET /v1/calls/extension` (`list_extension_calls`
  in `routers/calling.py`), the same `extension_auth` headers, same
  `CallSummary` response shape as `GET /v1/calls`. Deliberately scoped
  narrower than the account-wide `GET /v1/calls/extension/{id}` status
  endpoint above (that one exists purely so an Extension can poll a call
  it just placed, not to browse others') — this one filters to
  `Call.bridge_to_number == extension.softphone_extension`, i.e. **only
  calls that rang this specific line**, matching a real multi-line office
  phone where each employee sees their own log, not the whole account's.
  Outbound-only: an inbound call answered by this line isn't attributable
  to it here either — `worker/ari_listener.py` never stamps
  `bridge_to_number` for inbound at all (see the multi-extension note
  above and `AdminReportsView`'s own per-line usage report, which has the
  identical gap) — a known, pre-existing limitation, not specific to this
  endpoint. `selx-softphone`'s `CallHistory.tsx`/`DialSuggestions.tsx`
  both call this instead of `GET /v1/calls` for an extension-mode session;
  the recording-expand affordance is hidden there too (`GET /v1/calls/{id}/
  recordings` is still bearer-token-only, same reasoning as Transfer).

  **Credential recovery** — `routers/partner_users.py`'s
  `POST /{user_id}/regenerate-token` and
  `POST /{user_id}/extensions/{extension_id}/regenerate-password`, both
  partner-scoped via the same `created_by_partner_id` ownership check
  `enable_user_feature` uses (`_require_own_user`, shared by all three).
  Tokens/extension passwords are never resent as-is — "forgot my
  credential" is treated as "assume the old one may be lost or
  compromised, rotate it out": `regenerate_user_token` revokes every
  currently-active `Token` this User has and mints one fresh one;
  `regenerate_extension_password` generates a fresh password and
  re-provisions that line immediately (always into `"platform-internal"`
  context, matching `ExtensionAdmin.provision_softphone_action` — an
  Extension row only ever exists on a multi-extension account in the
  first place). Both deliver the new credential via `PartnerWebhookOutbox`
  only, never in the HTTP response — same trust model as account
  creation. Admin-created and direct-partner-created accounts have no
  equivalent self-service API — an operator handles those by hand via the
  admin panel (issue a new token / re-run "Provision softphone line"),
  since only reseller-created accounts are meant to be partner-operated
  end to end.

- **Multi-lane webhook fan-out** (`app/services/webhooks.py`) — every
  `enqueue_webhook()` call resolves up to four lanes (per-call override →
  per-workflow-node → per-number → per-user, in that priority order),
  dedupes by URL (first/highest-priority lane wins, recorded as that row's
  `source`), and fires one `webhook_outbox` row per deduped URL —
  `webhook_dispatcher.py` adds an `X-Selx-Webhook-Source` header and logs
  every delivery attempt (success or failure) to `webhook_delivery_attempts`
  (a full audit trail — `webhook_outbox` itself only ever reflects the most
  recent attempt). `webhook_outbox.user_id` is nullable — a per-number/
  per-call lane can fire for a call with no assigned tenant at all (e.g. a
  common number's `fallback_number`). The outgoing JSON payload itself
  (built in `enqueue_webhook`) includes `"user_id": call.user_id` (nullable,
  same reasoning) — added so a receiver fronting multiple selx-sip accounts
  behind one shared webhook URL (a company with several tenants but a
  single backend endpoint) can tell which account an event belongs to;
  before this it was only tracked on the `WebhookOutbox` row internally,
  never actually sent to the destination. `webhook_dispatcher.py` runs a
  **second, parallel delivery lane** the same way (`_poll_once_partner`/
  `_deliver_one_partner`, same `SELECT ... FOR UPDATE SKIP LOCKED` claim
  idiom, same backoff schedule) draining `partner_webhook_outbox` instead
  — signed with the target **Partner's own** `webhook_secret`, not a
  User's (the payload itself contains the new User's `webhook_secret`, so
  it can't also be the signing key). No `WebhookDeliveryAttempt`-style
  per-attempt audit table for this lane — its own `status`/
  `attempt_count`/`last_error` is enough for this much lower-volume,
  provisioning-only traffic.

- **Number-level fallback** (`worker/ari_listener.py`) — a third cascade
  tier below the existing softphone/`bridge_number` one:
  softphone → `bridge_number` → `numbers.fallback_number` → reject. Each
  tier's failure re-enters the same `ChannelDestroyed` branch and cascades
  to the next; `ringing_number_fallback` is the terminal status (no tier
  after it, falls through to an ordinary release on failure).

- **Multi-extension accounts** (`models.py`'s `Extension`, `services/
  internal_dialing.py`, `worker/ari_listener.py`, `worker/feature_codes.py`)
  — a `User` with zero `Extension` rows (the default — every account starts
  this way, see the Partner API note above) keeps the original single-line
  behavior everywhere, completely unchanged. Once an operator manually
  provisions at least one enabled `Extension` under a `User` (there's still
  no self-serve API for this — SQLAdmin's "Provision softphone line" action
  on the Extension itself, which also re-provisions the owning User's own
  primary line if it already has one), that account becomes
  "multi-extension" and every one of its lines gets re-provisioned into the
  `platform-internal` dialplan context (`config/extensions.conf`) instead of
  the single-line `platform-softphone` dead-end — see
  `services/softphone.py::provision_softphone`'s `context` param and
  `admin_ui.py`'s `_account_context` helper, which decides which context a
  line gets purely from whether its owning `User` has any `Extension` rows.
  Three behavior changes follow from that:
  - **Inbound ring-group**: `worker/ari_listener.py::_handle_inbound_start`
    rings every enabled line under the account at once (the primary line +
    all enabled Extensions) instead of just the primary — first to answer
    wins, the rest are cancelled (`_handle_ring_group_member_up`); if none
    answer, the existing `bridge_number` → `fallback_number` cascade takes
    over exactly as before (`_handle_ring_group_exhausted`, sharing the same
    `_advance_inbound_fallback` decision logic the single-target path uses).
  - **Direct dialing**: `[platform-internal]`'s `_X.` pattern hands every
    dial attempt from one of these lines to
    `_handle_device_dial_start` via `Stasis(callplatform,device-dial)` —
    Python (not the dialplan) resolves what was actually dialed via
    `services/internal_dialing.py::resolve_dialed`: "9" + number is always
    external (same prefix convention as the legacy `[from-internal]`
    context); "0" rings the account's own primary line; any other digit
    string is checked against sibling `Extension.id`s on the same account.
    A sibling match is a free, **untracked** internal call (no `Call` row,
    no webhook — same as the legacy 6001↔6002 internal call it mirrors,
    just ARI-orchestrated instead of a bare dialplan `Dial()`) — see
    `_handle_device_sibling_up`/`_handle_device_sibling_destroyed`. An
    external number goes through the same `Number` selection
    (`resolve_outbound_number` — dedicated if assigned, else the common
    number) and slot-claim (`claim_number_slot`) as an ordinary
    HTTP-triggered call, just with no `Token` in play (a SIP phone doesn't
    carry a bearer token) — so per-token rate limiting doesn't apply here,
    only the `Number`'s own `channel_limit`, a deliberate simplification.
  - **Phone-initiated transfer**: dialing `*2<destination>#` (blind) or
    `*3<destination>#` (attended) mid-call triggers `worker/
    feature_codes.py`, gated to bridged calls whose account has at least one
    `Extension` (single-line accounts see no behavior change here either).
    This exists because the ARI-managed bridge these calls live in doesn't
    reliably honor Asterisk's native `*2`/`*3`-style feature codes (those
    assume a plain dialplan `Bridge()`) — so it's a DTMF listener reusing
    the exact same `services/transfers.py` functions the HTTP transfer API
    calls, not a second transfer implementation. `<destination>` follows the
    same internal/external convention as direct dialing above.
  - `Extension.enabled` lets an operator pull one line out of the ring group
    and internal dialing without deleting the row or its provisioned SIP
    credentials.

- **`services/calls.py`** — the concurrency-safety core.
  `claim_number_slot`/`claim_and_originate`'s token claim lock the target row
  first (`SELECT ... FOR UPDATE`, dialect-portable via SQLAlchemy's
  `.with_for_update()`), re-verify capacity against the locked row in
  Python, then issue a plain `UPDATE` — never read-then-write; the row lock
  is what actually prevents the race (not a WHERE clause on the UPDATE),
  same guarantee this had when it was a single `UPDATE ... RETURNING`
  statement on Postgres-only, just expressed as two statements so it also
  works on MySQL (which has no `UPDATE ... RETURNING` at all). Shared
  between outbound origination and inbound acceptance (both count against
  the same provider-contracted `channel_limit`). `release_slot` is
  idempotent (safe against duplicate hangup events). Load-tested: 50
  concurrent requests against `channel_limit=3` correctly capped and
  settled to zero with no leaks — reverified against MySQL after the
  migration below.

  **Two real production bugs caught live, both making a call that never
  actually connected report as a success**:
  1. `Call.answered_at` — what `release_slot` alone uses to decide
     `"completed"` vs `"failed"` — used to be set the instant the
     *agent's own* softphone leg auto-picked up
     (`worker/ari_listener.py::_handle_channel_state_change`'s outbound
     branch), before the customer/destination was even dialed. A call
     whose customer leg then failed, timed out, or errored still got
     marked `"completed"` with no bridge or recording ever having existed
     (visible in the admin panel: `status: completed`, real duration, but
     "No recording for this call"). Fixed by moving the assignment into
     `_bridge_call` — the one function where both legs are confirmed
     actually joined into a live bridge, for every agent-mediated flow
     (outbound, inbound single-target, inbound ring-group alike) — so
     `answered_at` now uniformly means "the call actually connected,"
     matching the "talk time is `ended_at - answered_at`, the gap before
     is ring time" convention already assumed everywhere else that reads
     it (`routers/calling.py`, `admin_ui.py`'s usage reports, this file's
     own balance-deduction note above).
  2. `app/ari_client.py::originate_via_dialplan` — used for every
     outbound customer leg and inbound fallback leg — created its `Local`
     channel without the `/n` suffix, leaving Asterisk free to "optimize"
     the Local channel pair away once it bridged into the trunk. Without
     `/n`, this can sever the ARI app's tracking of that channel entirely
     mid-call: no `ChannelDestroyed` event ever arrives, the call just
     hangs from the worker's point of view until `worker/reconciliation.py`
     force-releases it minutes later as `"reconciled_orphan"` — even
     though the customer leg may have connected fine. A timing race
     (depends on exactly when the far end answers relative to Stasis
     event delivery), which is why it only ever hit *some* outbound calls,
     never reliably reproducible on demand. Fixed by appending `/n` to
     the Local channel's endpoint string — standard, documented Asterisk
     practice for any Local channel an ARI app needs to keep controlling
     for its full lifetime.
  3. `originate_via_dialplan` sent no explicit ARI `timeout`, so ARI's own
     30-second default applied — silently contradicting the dialplan's
     `Dial(...,60)`: any callee taking longer than 30s to answer got cut
     off by us with hangup cause `"Unknown"` at exactly 30.0s on the wire
     (caught live from that suspiciously round number). The parameter now
     defaults to 65 — deliberately *above* 60 so Dial()'s own limit stays
     the binding one and the ARI timeout is only a backstop.

  **Carrier-side decline weirdness (documented so nobody re-debugs it as
  our bug)**: when a callee DECLINES a call on the BD mobile network,
  icctalk sometimes (a) delivers the decline ~11s late as `480`, (b) never
  delivers it at all (the session just keeps "ringing"), and/or (c)
  re-presents the call to the callee's handset — and a call answered
  after that re-present connects with a corrupted media path (dead air
  both ways despite a textbook 200 OK/SDP exchange on our side). Packet
  captures prove our side sends exactly ONE INVITE per call and handles
  every response per spec — normal answered calls are fine; only the
  decline→carrier-re-ring→answer sequence breaks, entirely inside
  icctalk's network. An evidence pack (pcap, Call-IDs) can be assembled
  from any repeat capture on wg0 if icctalk support ever asks.

### Database

**Split across two databases** (as of the MySQL migration): Asterisk's own
realtime `ps_*` tables stay on **Postgres** (`asterisk_ro` role,
`SELECT`-only, used by Asterisk's own `res_config_pgsql` connection — see
Asterisk layer above; `platform_rw` on this side now owns only `ps_*`, not
app tables — the split is physical, not just role-based, so there's no
`REVOKE` step, the app tables simply don't exist in this database anymore).
The app's own business tables live in **MySQL** (`backend/app/db.py`'s
`engine`/`async_session`, driver `aiomysql` — pure Python, no C build
toolchain needed, unlike `asyncmy` which has no prebuilt wheel on some
platforms, e.g. linux/arm64; also needs the `cryptography` package for MySQL
8's default `caching_sha2_password` auth handshake), reached via
`app/db_realtime.py`'s second engine/session by the few call sites that
still need to touch `ps_*` directly (`services/realtime_sync.py`,
`services/softphone.py`, `worker/health_poller.py::_circuit_break`) — each
of those now does two separate commits (one per database) instead of one
atomic transaction; accepted, since every operation on both sides is
idempotent and re-triggerable (re-saving a number, or the next health-poll
cycle, fully repairs a partial-failure window).

App tables, schema managed by **Alembic** (`backend/alembic/` — a separate,
app-owned migration chain, not to be confused with the vendored
Asterisk-owned one at `db/realtime-migrations/` for `ps_*`; see that
section's note above): `users`, `extensions` (additional named SIP/WebRTC
lines under a User, beyond that User's own primary line — see Extension's
docstring in `models.py`), `tokens` (bearer tokens, sha256+pepper hashed,
never stored plaintext — every user has their own, even when using the
shared/common number; "common" describes which number they route through,
not a shared credential), `partners` + `partner_webhook_outbox` (the
Partner API — see the note above), `numbers` (`id` matches
`ps_endpoints.id` etc.; `provider_password` stored here too, same trust
boundary as `ps_auths.password`, so realtime rows can be resynced after
disable/enable; two generated/virtual columns,
`common_flag_key`/`dedicated_user_key`, stand in for Postgres's partial
unique indexes, which MySQL doesn't support — never expose these two in
the API or admin UI), `calls` (two-leg model: `agent_channel_id` +
`customer_channel_id`, not one ARI channel id), `recordings` (call
recording upload lifecycle — see `worker/recording_uploader.py`),
`call_transfers`, `workflows` + `workflow_runs` (IVR engine — see the note
above; `workflow_runs` is observability/audit only, not authoritative
state), `tts_prompts` (named, multiple TTS prompts per User — see the note
below), `webhook_outbox` + `webhook_delivery_attempts` (full per-attempt
audit trail for the call-event lane only — see the note above),
`token_usage_windows` (DB-backed per-minute rate limiting; its upsert is
MySQL's `INSERT ... ON DUPLICATE KEY UPDATE`, not Postgres's `ON
CONFLICT`), `platform_state` (singleton row backing the reload
coordinator).

`pool_pre_ping` is deliberately **not** set on the MySQL engine (unlike the
Postgres one) — a reproduced SQLAlchemy dialect bug, verified present in
both `asyncmy` and `aiomysql`: `do_ping` decides how to call `.ping()` by
introspecting the *pymysql* package (needed separately, for Alembic's
migration runner — see `alembic/env.py`), not the actual driver in use, and
gets it wrong, crashing every pooled connection checkout. `pool_recycle=1800`
is used instead. The engine also pins
`isolation_level="READ COMMITTED"` — MySQL's default (`REPEATABLE READ`)
plus InnoDB's locking protocol produced a real, reproduced deadlock (error
1213) under ordinary concurrent `UPDATE`s to the same row (many calls on
one number ending around the same time, all decrementing
`numbers.active_channels`) that never happened under Postgres's default;
`services/db_retry.py::run_with_deadlock_retry` additionally wraps
`claim_number_slot`/`claim_and_originate`/`release_slot` to retry on a
MySQL deadlock/lock-wait-timeout regardless — both mitigations are kept
together since neither alone eliminates the risk under high concurrency,
and retry-on-deadlock is standard, expected practice for InnoDB apps with
this kind of counter-update pattern, not a workaround for a bug in the
surrounding code. Verified: 50 concurrent requests against
`channel_limit=3` still correctly settle to exactly 3 claimed, 0 after
release, matching the original Postgres-only guarantee — now also covered
by an automated test, `backend/tests/test_claim_number_slot_concurrency.py`
(see Known Gaps).

Both engines' `pool_size`/`max_overflow` are configurable via
`DB_POOL_SIZE`/`DB_MAX_OVERFLOW`/`REALTIME_DB_POOL_SIZE`/
`REALTIME_DB_MAX_OVERFLOW` env vars (see Commands) — previously hardcoded to
SQLAlchemy's defaults (5/10), which under real concurrent load would
serialize requests waiting on a connection well before any application-level
concurrency logic kicks in.

**Real bug caught during hardening**: `DateTime(timezone=True)` columns
(e.g. `Call.started_at`, `Number.circuit_broken_until`) come back as *naive*
Python datetimes from MySQL's async dialects regardless of how they were
written — comparing/subtracting one against an aware `datetime.now(timezone.utc)`
raises `TypeError`. This silently broke `worker/reconciliation.py`'s
`MAX_CALL_DURATION` check (crashed on every sweep tick with any in-progress
call — the reconciliation safety net likely never completed a sweep
successfully) and `services/calls.py::claim_number_slot`'s
`circuit_broken_until` check (would crash `/v1/calls` for any circuit-broken
number). Fixed via `app/db.py::as_aware_utc()` — apply it to any *new*
Python-side comparison of a fetched `DateTime(timezone=True)` value against
an aware `now`. SQL-side comparisons (raw `text()` WHERE clauses, or a
SQLAlchemy Core `.where(Column < value)`) are unaffected — those run inside
MySQL itself, which just compares the stored values regardless of tzinfo.

### Reverse proxy (`proxy/Caddyfile`)

Fronts Asterisk's HTTP port — `8088` is **not** published to the host
anymore. `/ws*` (WebRTC signaling) is public; `/ari/*` is deliberately
**not proxied at all** (only `worker` reaches it, over the internal compose
network). `DOMAIN` env var (`.env`) selects plain HTTP on `localhost` (dev)
vs. automatic HTTPS for a real domain (production).

### Webphone (`webphone/`)

Unchanged test client for extension `7001`, now connects through Caddy
(`ws://`/`wss://` + `/ws`, no port) instead of directly to `8088`.

## Known gaps

- `channel_limit` on `selorax-trunk` is a placeholder (`1`) — the
  provider's real concurrent-call limit wasn't visible in their portal;
  confirm with icctalk/iTelSwitchPlus and update via the admin panel.
- DID routing for the legacy `[from-trunk]` context (`store-a`/`store-b`)
  is still unfinished — `TODO_DID_STORE_A`/`TODO_DID_STORE_B` placeholders.
- IVR prompt audio (`play`/`prompt` node `voice`) resolves via `astdatadir`
  in `asterisk.conf` (`/usr/share/asterisk`, NOT `/var/lib/asterisk` — a
  real bug hit and fixed during development: files staged at
  `/var/lib/asterisk/sounds/custom/` are silently never found,
  `ast_openstream_full` logs "does not exist in any format" with no other
  clue). `/usr/share/asterisk/sounds/custom` is itself a symlink to
  `/usr/local/share/asterisk/sounds/` — that resolved path is where a
  `<voice>.gsm`/`.wav`/`.ulaw` file actually needs to live for
  `sound:custom/<voice>` to resolve. As of the TTS feature (below), this
  path is now a **shared Docker volume** (`custom_sounds`, mounted in both
  `api` and `asterisk` — see `docker-compose.yml`) — a dynamically-written
  file (TTS output) is visible to Asterisk immediately, no rebuild needed.
  What's still true: there's no *generic* file-upload endpoint for a
  tenant's own pre-recorded (non-TTS) audio — only an operator can bake one
  into the image via a `Dockerfile` `COPY`, or a tenant can get one
  generated dynamically via `POST /v1/tts/<name>` (text only, not an
  uploaded file).
- **Text-to-speech** (`app/services/tts.py`, `routers/tenant_tts.py`) — a
  tenant POSTs text to `/v1/tts/<name>`, which calls ElevenLabs
  (`elevenlabs_api_key`/`elevenlabs_voice_id` in config, empty key = clean
  502 rather than a silent no-op) requesting `output_format=ulaw_8000` —
  ElevenLabs' raw 8kHz u-law output, which is exactly Asterisk's own "ulaw"
  file format, so the response bytes are written straight to
  `<custom_sounds_dir>/<voice>.ulaw` with **zero transcoding** needed on
  our side (no ffmpeg/sox dependency added to the `api` image). An account
  can hold **several named prompts** (`TtsPrompt`, unique on
  `(user_id, name)`) instead of just one — `name` is a filename-safe slug
  validated at the API layer, since it's used verbatim in the on-disk
  filename (`TtsPrompt.voice_name`: `tts-user-<id>.ulaw` for
  `name=="default"`, reusing the exact filename this feature used before
  multiple prompts existed, for backward compatibility;
  `tts-user-<id>-<name>.ulaw` for any other name). A submission under an
  existing name overwrites that name's file and text, there's no history —
  `GET /v1/tts` lists all of an account's prompts, `GET/POST/DELETE
  /v1/tts/<name>` operate on one. **Superseded by the assignment model**:
  a workflow used to be limited to at most one per `(user, kind)` — that's
  gone. A `Workflow` has no `kind` of its own anymore (the column still
  exists in the DB, kept only for a transitional-deploy backward-compat
  window — see the workflow-assignment migration note; nothing current
  reads it for resolution). A tenant can hold any number of workflows,
  full id-based CRUD via `routers/tenant_workflows.py`'s
  `/v1/workflows`/`/v1/workflows/id/{id}`. Whether one runs at all is
  decided purely by **assignment** — `User.outbound_workflow_id`/
  `inbound_workflow_id`, two independent pointers set via
  `PUT /v1/workflows/{outbound|inbound}`, either or both, repointable any
  time without touching the workflow's own content, and the same workflow
  id can occupy both slots at once. `POST /v1/calls`'s `workflow: true`
  resolves `User.outbound_workflow_id` directly (`routers/calling.py`); a
  dedicated Number's inbound calls resolve `User.inbound_workflow_id`
  (`worker/ari_listener.py`); `workflow_id` (explicit, either mode) targets
  any workflow directly, assigned or not, yours or an operator/global one
  (`routers/workflows.py`, id-indexed, unlimited, unaffected by any of
  this). A `play`/`prompt` node with no explicit `voice` falls back to the
  account's TTS prompt literally named `"default"` — **shared across every
  workflow on the account now** (no more per-kind fallback names), so the
  Selx Softphone builder always sets `voice` explicitly, namespaced to the
  workflow's own id (`wf<id>_...`), for every workflow it creates — this is
  what actually keeps two different workflows' audio from colliding, not
  the backend fallback itself.
- **Per-tenant voice + naturalness tuning** (`TtsPrompt.voice_id`/
  `model_id`/`language`, `app/services/tts.py::resolve_voice_settings`) —
  every account no longer shares one platform-wide ElevenLabs voice.
  `POST /v1/tts/<name>` accepts optional `voice_id`/`model_id`/`language`
  alongside `text`; an explicit override always wins, otherwise `model_id`
  falls back per `language` (`"bn"` → `elevenlabs_model_id_bn`, default
  `eleven_v3` — noticeably better Bangla phoneme handling in live testing
  — anything else → the general `elevenlabs_model_id`), and `voice_id`
  falls back to the platform-wide `elevenlabs_voice_id`. A resubmission
  that omits these fields does **not** reset a previously-configured
  voice back to the platform default — `submit_tts` checks
  `body.model_fields_set`, not `is None`, so editing just `text` (the
  common case) leaves a saved `voice_id`/`model_id`/`language` alone; send
  an explicit `null` to actually clear one. `voice_settings` sent to
  ElevenLabs was also retuned from bare defaults: `stability` raised from
  ElevenLabs' own 0.5 to 0.75 (0.5 produced audibly inconsistent delivery
  between generations of the *same* cached text — a phone greeting played
  hundreds of times should sound the same every time), plus explicit
  `style: 0.0` and `use_speaker_boost: true` (previously omitted
  entirely). Dynamic per-call `say` templates (`worker/workflow_runner.py::
  _speak_dynamic`) resolve the *calling account's* own voice/model/
  language via `_resolve_account_voice_config` (same "default"-prompt
  lookup `_resolve_voice` uses) and thread it through
  `dynamic_tts_cached`/`ensure_dynamic_tts`/`prewarm_dynamic_say_nodes` —
  `dynamic_voice_name`'s cache-key hash now includes the *resolved*
  `voice_id`/`model_id`, not just text, so two tenants with different
  voices speaking the identical resolved string (e.g. "Thank you for your
  order") never collide on one cached file, and pre-warming
  (`app/routers/calling.py::originate_call`) lands in the same cache slot
  the live call will look up instead of warming the platform-default
  voice for an account that has its own.
- **Voice discovery/picker** (`GET /v1/tts/voices`, `app/services/tts.py::
  list_elevenlabs_voices`) — before this existed, a tenant could only set
  a `voice_id` (above) if they already had one from ElevenLabs' own
  dashboard; this proxies ElevenLabs' `GET /v1/voices` (voice_id, name,
  `preview_url`, category, labels) so a tenant can browse and preview
  before picking. Same list for every tenant (one platform-wide
  ElevenLabs account) — cached in a plain module-level dict
  (`_voices_cache`, `VOICES_CACHE_TTL_SECONDS` = 1h), deliberately *not*
  Redis/DB-backed since `api` runs multiple uvicorn worker processes with
  no shared memory; each worker just eats one real ElevenLabs request per
  TTL window on a cold cache, which is bounded and cheap enough not to
  need a shared store. **Registered before `/{name}` in
  `routers/tenant_tts.py`** — FastAPI matches path routes in registration
  order, so if `/voices` were declared after `/{name}` it would never be
  reached (`/{name}` would swallow it as `name=="voices"`), the exact same
  gotcha SeloraX-Backend's CLAUDE.md documents for Express route ordering.
  Consumed by the Selx Softphone's `WorkflowBuilder.tsx`: a "Voice"
  `<select>` (populated from this endpoint) plus a "▶ Preview" button that
  plays `preview_url` through a hidden `<audio>` element — the chosen
  `voice_id` is threaded through **every** `submitTts()` call in
  `handleSave` (main prompt + every keypad branch + no-answer + invalid),
  not just the `"default"` prompt, so the picker reads as one account-wide
  choice rather than a per-branch one that would silently leave other
  branches on the platform default. Selecting "Platform default" sends an
  explicit `voiceId: null` (not "leave the field out") so switching back
  actually clears a previously-chosen voice.
- ~~A worker restart mid-IVR-run orphans that one call~~ — now swept by
  `worker/workflow_reconciliation.py` every 60s, mirroring
  `reconciliation.py`'s shape: a `workflow_runs` row stuck at
  `status="running"` whose `Call` already has `slot_released_at` set gets
  marked `status="error"`/`error_reason="worker_restart_orphan"`. Cleanup
  only — it doesn't resume the run.
- ~~No automated tests~~ — a starter suite now exists at `backend/tests/`
  (pytest + pytest-asyncio, run via `docker compose run --rm
  -v "$(pwd)/backend:/srv" -e MYSQL_ROOT_PASSWORD=... api sh -c "pip install
  -r requirements-dev.txt && pytest"` — see `backend/tests/conftest.py`'s
  docstring for why it needs root once, and why it forcibly overrides
  DATABASE_URL to a `_test`-suffixed database regardless of what `.env` sets
  it to). Covers the highest-risk concurrency/reconciliation code named in
  this file's own load-testing notes: `claim_number_slot` under concurrency,
  `release_slot` idempotency, both reconciliation sweeps, and the webhook
  dispatcher's backoff schedule. Not full coverage — everything else is
  still verified through live manual testing as before, and the actual ARI
  wire behavior (exact event payload shapes, timing) still hasn't been
  verified against a real Asterisk instance by an automated test.
- Asterisk is a single instance with no horizontal scaling path — the ARI
  listener (`worker/ari_listener.py`) is a documented singleton by design.
  `worker/health_poller.py` now logs a warning once active channels reach
  `ASTERISK_CAPACITY_WARN_THRESHOLD` (default 80, see `app/config.py`) so
  approaching that ceiling is a greppable signal instead of a surprise —
  purely observability, not an enforced cap. When that threshold is
  actually being hit in practice, the real fix is sharding call capacity
  across multiple Asterisk+worker stacks (e.g. by DID or by tenant) behind
  a routing layer that picks which stack a given number's calls go through
  — not something to build preemptively before there's a real load number
  forcing it.
- ~~Multi-extension accounts never actually got the `platform-internal`
  dialplan context~~ — found during a pre-public-launch review:
  `services/softphone.py::provision_softphone`'s `context` parameter was
  completely dead — the `INSERT INTO ps_endpoints` hardcoded the literal
  `'platform-softphone'` regardless of what was passed, so every line ever
  provisioned (primary or Extension, single-line or multi-extension) got
  the single-line dead-end context. The entire multi-extension feature set
  (ring-group inbound, sibling-to-sibling dialing, `9<number>` direct
  dial-out, `*2`/`*3` phone-initiated transfer codes) was silently
  non-functional for every account. Fixed (bind param instead of a
  literal) — but **fixing the code doesn't retroactively fix already-
  provisioned lines**: any account that was set up as multi-extension
  before this fix still has the wrong context baked into its live
  `ps_endpoints` rows until an operator re-runs "Provision softphone line"
  for it from the admin panel.
- **Call blast concurrency was substantially hardened** ahead of the first
  public launch — see the Call blast architecture note above for what
  changed (`transition_blast`'s row-locking, `create_blast`'s atomic
  reservation) and why (two independent reviews both found the same real
  race condition in the original version). Covered by
  `backend/tests/test_call_blast.py`'s concurrent-transition and
  stuck-forever-target regression tests.
- **Partner API — `POST /v1/partners/users` residual gap**: provisioning
  now happens in a deliberately ordered sequence (User+Token committed
  first, softphone line second, partner notification last) specifically
  so a failure partway through always leaves a *recoverable* state (a
  fully or partially set-up account visible in the admin panel) instead of
  a fully orphaned, undiscoverable one — see `routers/partner_users.py`'s
  own comment. The one gap this doesn't close: if the very last step (the
  `PartnerWebhookOutbox` insert) itself fails, the User/Token/softphone
  line all exist and work, but the partner is never notified and has no
  automated way to find out — recoverable only via an operator manually
  pulling the account's credentials from the admin panel. Not attempted
  here: a proper fix needs a retryable "pending notification" state
  machine, more than a quick correctness pass warrants.
- **Security items flagged during the same review, not yet acted on** —
  worth a deliberate decision before wide/adversarial public exposure,
  not blocking a normal launch:
  - `worker/webhook_dispatcher.py::_resolve_and_validate`'s SSRF guard
    resolves a webhook URL's hostname and checks the result, then a
    *separate* connection is made moments later — a low-TTL attacker-
    controlled DNS record could in principle return a safe IP for the
    check and a private/metadata IP for the real connection
    (DNS-rebinding). IP-encoding tricks and redirect hops are already
    handled correctly; only this specific TOCTOU gap remains. Proper fix:
    pin the connection to the already-validated IP instead of letting
    httpx re-resolve at connect time.
  - The SQLAdmin session cookie (`Middleware(SessionMiddleware,
    secret_key=...)`, set up inside the `sqladmin` package itself) uses
    Starlette's default `same_site="lax"` (confirmed by reading
    Starlette's own `SessionMiddleware.__init__` signature — this blocks
    the obvious cross-site-POST CSRF vector) but also defaults
    `https_only=False`, so the cookie has no `Secure` attribute. Harmless
    if Caddy's automatic HTTPS (`DOMAIN` set) is always in front of it in
    production, but nothing in code enforces that pairing — worth setting
    explicitly once there's a clean way to detect "running behind HTTPS"
    that doesn't also break local dev's plain-HTTP `localhost`.
  - `docker-compose.yml` falls back to guessable defaults
    (`${ADMIN_PASSWORD:-changeme-admin-password}` and similar) for every
    credential env var if `.env` is incomplete, rather than refusing to
    start — relies entirely on setup discipline, not enforced anywhere in
    code.
  - `services/transfers.py::complete_attended_transfer`/
    `cancel_attended_transfer` run several sequential ARI calls with no
    partial-failure handling, unlike every other function in that file —
    an ARI hiccup or a hangup race mid-sequence can leave
    `call_transfers`/`Call` rows inconsistent with no automatic recovery.
  - A caller barging in with a keypress while a dynamic (`say`-template)
    TTS synthesis is still in flight can leave that node's ringback tone
    playing indefinitely, bleeding into whatever the next node plays —
    `worker/workflow_runner.py`'s staleness guard correctly aborts the
    stale synthesis but returns before reaching its own ringback-stop
    call.
  - Four older Alembic migrations (`054e1df0ebfb`, `3aed58f3d74a`,
    `da94e8f098f9`, `cad6f019667c`) have the same unnamed-FK-constraint
    `downgrade()` crash this session hit and fixed for its own migration
    — only matters if someone ever runs `alembic downgrade` past them,
    which nothing in normal operation does.
