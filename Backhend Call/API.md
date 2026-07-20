# selx-sip API Reference

This is the reference for developers integrating **against** a running selx-sip
instance — placing calls, receiving webhooks, building IVRs — from your own
site or backend. It assumes someone (you, or your platform operator) already
has selx-sip running; see `GETTING_STARTED.md` for standing up the platform
itself.

Everything below talks to your instance's base URL — replace
`https://your-domain` with wherever it's deployed (`http://localhost` for
local dev).

## Contents

- [Mental model](#mental-model)
- [Getting a token](#getting-a-token)
  - [POST /v1/auth/login — identifier+credential login](#post-v1authlogin--identifiercredential-login)
- [Quickstart](#quickstart)
- [API reference](#api-reference)
  - [POST /v1/calls — place a call](#post-v1calls--place-a-call)
  - [GET /v1/calls — call history](#get-v1calls--call-history)
  - [GET /v1/calls/{id} — call status](#get-v1callsid--call-status)
  - [GET /v1/calls/{id}/recordings](#get-v1callsidrecordings)
  - [POST /v1/calls/extension — an Extension places a call](#post-v1callsextension--an-extension-places-a-call)
  - [GET /v1/calls/extension/{id} — Extension call status](#get-v1callsextensionid--extension-call-status)
  - [GET /v1/calls/extension — this line's own call history](#get-v1callsextension--this-lines-own-call-history)
  - [POST /v1/calls/{id}/transfer](#post-v1callsidtransfer)
  - [POST /v1/calls/{id}/transfer/{id}/complete](#post-v1callsidtransfertransferidcomplete)
  - [POST /v1/calls/{id}/transfer/{id}/cancel](#post-v1callsidtransfertransferidcancel)
  - [POST /v1/calls/extension/{id}/transfer](#post-v1callsextensionidtransfer)
- [Balance](#balance)
  - [GET /v1/balance](#get-v1balance)
  - [GET /v1/balance/extension](#get-v1balanceextension)
  - [POST /v1/partners/users/{user_id}/balance — top up (Partner API)](#post-v1partnersusersuser_idbalance--top-up-partner-api)
- [Webhooks](#webhooks)
  - [GET /v1/webhooks — activity log](#get-v1webhooks--activity-log)
- [Partner API — provisioning Users for an external company](#partner-api--provisioning-users-for-an-external-company)
  - [POST /v1/partners/users — create a User](#post-v1partnersusers--create-a-user)
  - [Feature flags — what a partner-created User can do](#feature-flags--what-a-partner-created-user-can-do)
  - [POST /v1/partners/users/{user_id}/features/{feature} — enable a feature](#post-v1partnersusersuser_idfeaturesfeature--enable-a-feature)
  - [Public identifiers — why user_id isn't always the answer](#public-identifiers--why-user_id-isnt-always-the-answer)
  - [POST /v1/partners/users/{user_id}/regenerate-token](#post-v1partnersusersuser_idregenerate-token--i-forgot-my-token)
  - [POST /v1/partners/users/{user_id}/extensions/{extension_id}/regenerate-password](#post-v1partnersusersuser_idextensionsextension_idregenerate-password--i-forgot-my-extension-password)
- [Building an outbound IVR ("press 1 to approve")](#building-an-outbound-ivr-press-1-to-approve)
  - [Full example — text to a live "press 1" call](#full-example--text-to-a-live-press-1-call)
  - [POST /v1/tts/{name} — text-to-speech for your prompts](#post-v1ttsname--text-to-speech-for-your-prompts)
  - [GET /v1/tts/voices — browse available voices](#get-v1ttsvoices--browse-available-voices)
- [Call blast (bulk outbound-workflow calling)](#call-blast-bulk-outbound-workflow-calling)
  - [POST /v1/blasts — create and start a blast](#post-v1blasts--create-and-start-a-blast)
  - [GET /v1/blasts/{id}/targets — per-number results](#get-v1blastsidtargets--per-number-results)
  - [GET /v1/blasts/capacity — what you have to work with](#get-v1blastscapacity--what-you-have-to-work-with)
- [Errors](#errors)
- [Rate limits & concurrency](#rate-limits--concurrency)
- [Operator-only setup (not for tenant developers)](#operator-only-setup-not-for-tenant-developers)

---

## Mental model

- **User** — your account on the platform (a business/tenant). Has its own
  softphone line, webhook URL, and bearer tokens.
- **Token** — a bearer credential scoped to one User, used to authenticate
  every `/v1/*` call below. Carries its own concurrency (`max_concurrent_calls`)
  and rate limit (`rate_limit_per_min`).
- **Extension** — an *additional* named softphone line under your User (e.g.
  one per employee), beyond your account's own primary line. Useful as
  internal transfer targets. Provisioning your first Extension (operator-only
  for now — see [Operator-only setup](#operator-only-setup-not-for-tenant-developers))
  upgrades your whole account to "multi-extension": inbound calls then ring
  *every* enabled line at once (first to answer wins) instead of just your
  primary line, and every one of your lines' own SIP/WebRTC software can
  dial another sibling line directly (dial `0` for your primary line, or
  another Extension's numeric id), dial any external number directly
  (`9` + number, same convention as an internal PBX extension), and start a
  blind/attended transfer mid-call from the phone itself by dialing
  `*2<destination>#` / `*3<destination>#` — none of that goes through this
  HTTP API at all, it's SIP-device behavior once an account has more than
  one line. A plain single-line account is unaffected by any of this. An
  Extension never gets its own bearer token (only the account owner does)
  — it authenticates to the one part of this API it *can* use,
  [`POST /v1/calls/extension`](#post-v1callsextension--an-extension-places-a-call),
  with its own `phone_number`/id + password instead.
- **Number** — a phone number (DID) your account routes through for
  outbound calls, and that customers can dial in on.
- **Workflow** — an IVR script (play a prompt, branch on a keypress, forward,
  transfer, hang up). Fully generic — a workflow has no "kind" of its own,
  you can hold any number of them (create/edit/delete by `id`), and each is
  reusable wherever you point it. Whether (and how) a workflow actually runs
  is decided entirely by two independent **assignment slots** on your
  account: **outbound** — trigger whichever workflow is currently assigned
  to this slot with `workflow: true`, or bypass assignment and target any
  specific workflow (assigned or not) directly with `workflow_id`, for an
  outbound call you originate; **inbound** — if a Number is dedicated to
  your account, its inbound calls automatically run whichever workflow is
  currently assigned to your account's **inbound** slot, no separate setup
  needed, and no way for another tenant's calls to ever run it, since it's
  resolved by ownership, not by which number was dialed. A common/shared
  Number never runs a workflow on inbound. The **same workflow id can be
  assigned to both slots at once**, and either slot can be repointed at any
  time without touching the workflow's own content. `workflow_id` also lets
  you reference a specific operator/global workflow instead of your own when
  originating a call outbound.
- **TTS prompt** — text you submit that becomes a workflow's spoken prompt
  (via ElevenLabs). An account can hold several, each under its own name —
  a node only speaks when its own `voice` field references a prompt's name
  explicitly (that's what lets one keypad branch have its own distinct
  message from another). The Selx Softphone builder handles this
  automatically by namespacing every prompt name to the workflow's own
  `id` (see [Workflows](#workflows-ivr) below) so two different workflows'
  audio never collides, even for the same-looking slot (e.g. both having a
  "press 1" branch).
- **Call blast** — bulk outbound-workflow calling: paste a list of numbers,
  pick a workflow, reserve a slice of your dedicated Number's `channel_limit`
  for it (see [Call blast](#call-blast-bulk-outbound-workflow-calling)
  below). Only usable with a dedicated Number, never the shared/common one.
- **Partner** — a different kind of caller entirely: an external company
  authorized to *create* new Users programmatically (see [Partner
  API](#partner-api--provisioning-users-for-an-external-company)), rather
  than a User itself placing calls.

You never touch Asterisk, SIP, or telephony internals directly — everything
is a plain HTTPS JSON API.

## Getting a token

Tokens aren't self-service — ask your platform operator to issue one for
your User account (via the admin panel or `POST /admin/api/tokens`, see
[Operator-only setup](#operator-only-setup-not-for-tenant-developers)). You'll
get back **two values together** — keep both:

```json
{"token": "plt_live_AbCdEf0123456789...", "user_id": 1, ...}
```

**The token is shown exactly once and cannot be retrieved again** — store
both values securely (env var / secrets manager), not in source control.

**Every request needs both**, as two separate headers:
```
Authorization: Bearer <token>
X-User-Id: <user_id>
```
The token alone already uniquely identifies your account — `X-User-Id` is
deliberate defense-in-depth, not what actually prevents cross-account
access. It exists so a mismatched token/account pairing (e.g. a stale
cached token after switching accounts) fails loudly (`401 "token does not
belong to this user"`) instead of silently acting on the wrong account. A
request missing either identifying header is rejected outright (`422`).

**Alternative: `X-Phone-Number` instead of `X-User-Id`** — if you'd rather
not have to know/store your raw `user_id`, send your account's
`phone_number` instead:
```
Authorization: Bearer <token>
X-Phone-Number: <phone_number>
```
Either header alone is enough; send both and both are checked. This exists
mainly for clients that only ever learned their account's `phone_number`
(e.g. via [`POST /v1/auth/login`](#post-v1authlogin--identifiercredential-login)
below) and never a raw id.

### POST /v1/auth/login — identifier+credential login

Given an identifier and its matching secret, confirms it's valid and tells
you which account (or which Extension line under one) it belongs to — by
public id, never the raw internal one. Doesn't mint a new credential of its
own; the `credential` you send back is the same bearer token / Extension
password you already have and keep using everywhere else.

`mode` is required and explicit — `"user"` resolves against Users
(`credential` = bearer token), `"extension"` against Extensions
(`credential` = that line's own softphone password). `identifier` is either
that account's/line's own `phone_number`, **or** its raw numeric id (a
User's `user_id` or an Extension's own id, matching what token
issuance/the admin panel show) as a plain digit string — `phone_number` is
tried first regardless, the numeric id is only a fallback.

```bash
# by phone number
curl -X POST https://your-domain/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mode": "user", "identifier": "+8801700000010", "credential": "plt_live_..."}'

# by raw user id instead
curl -X POST https://your-domain/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mode": "user", "identifier": "42", "credential": "plt_live_..."}'
```

For a User's own primary line (credential = its bearer token):
```json
{
  "type": "user",
  "id": "K3XQ7RTP",
  "user_id": 42,
  "name": "Acme Corp",
  "phone_number": "+8801700000010",
  "softphone_extension": "user-42",
  "softphone_password": "...",
  "bridge_number": null
}
```
`softphone_password` is included here even though you already proved full
account ownership by presenting the bearer token — this is what lets a
client log in with just an identifier + token and still get everything
needed to register the SIP/WebRTC line, without a second credential to type
in separately. `user_id` (the raw internal id, unlike `id` above) is what
you send as `X-User-Id` on every subsequent request — included here so a
client that logged in by phone number still has a way to learn it.

For an Extension (credential = that line's own softphone password, not a
bearer token — Extensions don't have their own):
```json
{
  "type": "extension",
  "id": "K3XQ7RTP-ext-1",
  "extension_id": 7,
  "label": "Front desk",
  "phone_number": "+8801700000020",
  "softphone_extension": "ext-3",
  "bridge_number": null,
  "user_id": "K3XQ7RTP"
}
```
`extension_id` (raw internal id) is what you send as `X-Extension-Identifier`
on [`POST /v1/calls/extension`](#post-v1callsextension--an-extension-places-a-call)
below.

`401` for any mismatch — unknown `identifier`, wrong `credential`, a
disabled Extension, or `identifier`/`credential` sent with the wrong `mode`
— the same generic error every time, so none of those cases is
distinguishable from outside.

---

## Quickstart

Place a call that rings your own account's line first, then bridges to a
destination once you answer (classic click-to-call):

```bash
curl -X POST https://your-domain/v1/calls \
  -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"to": "+8801XXXXXXXXX"}'
```

```json
{"call_id": "call_3f15368c0550fe5690f4c2ee", "status": "initiated"}
```

Check on it later:

```bash
curl https://your-domain/v1/calls/call_3f15368c0550fe5690f4c2ee \
  -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

That's the whole loop for the simplest case. Read on for outbound IVR calls,
transfers, recordings, and webhooks.

---

## API reference

All endpoints below require `Authorization: Bearer <token>` **and**
`X-User-Id: <user_id>` (see [Getting a token](#getting-a-token)), plus, for
`POST`/`PUT` requests, `Content-Type: application/json`. Responses are JSON.

### POST /v1/calls — place a call

Two distinct modes, chosen by whether you pass `workflow`/`workflow_id`.

**Mode 1 — agent-mediated call** (rings a human first, then bridges):

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | The destination to dial (PSTN number or internal extension) |
| `agent_extension` | string | no | Ring one of your account's [Extensions](#mental-model) instead of the account's own primary line — must belong to your account |
| `webhook_url` | string | no | Override the webhook destination for this call only (see [Webhooks](#webhooks)) |

Flow: rings your account's softphone line (or `agent_extension`, if given) →
once answered, dials `to` → bridges the two together. Use this for
click-to-call from a dashboard, or an agent auto-dialer.

```bash
curl -X POST https://your-domain/v1/calls \
  -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"to": "+8801XXXXXXXXX", "agent_extension": "ext-2"}'
```

**Mode 2 — outbound IVR call** (no agent leg — the platform calls the
destination directly and runs a workflow on them):

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | The destination to dial |
| `workflow` | boolean | one of `workflow`/`workflow_id` | `true` — use whichever workflow is currently assigned to your account's **outbound** slot. No id needed — it just follows whatever you last assigned there. |
| `workflow_id` | integer | one of `workflow`/`workflow_id` | Explicit reference by id — targets a specific workflow directly, bypassing assignment entirely. Works for any of your own workflows (assigned to a slot or not) or an operator/global one. |

Use this for automated notification calls — "press 1 to approve your order,"
appointment reminders, delivery confirmations, anything where the platform
should call the customer and collect a keypress without a human agent
involved at all. `404` if `workflow: true` is set but your account has
nothing assigned to its outbound slot yet (`PUT /v1/workflows/outbound`
first). This is entirely separate from your **inbound** slot (if you have a
dedicated Number) — see [Mental model](#mental-model).

```bash
curl -X POST https://your-domain/v1/calls \
  -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"to": "+8801XXXXXXXXX", "workflow": true}'
```

Both modes return the same shape:

```json
{"call_id": "call_af38be6e319e2a9df2d1cc4f", "status": "initiated"}
```

`status` here is always `"initiated"` — this response fires the instant the
call is accepted for origination, not when it's answered. Poll
`GET /v1/calls/{id}` or listen for [webhooks](#webhooks) for the real outcome.

**Errors**: `409` if your account has no softphone line provisioned (mode 1,
and no `agent_extension` given); `400` if `agent_extension` doesn't belong
to your account; `404` if `workflow`/`workflow_id` doesn't resolve to a
workflow you can use; `402` if your account's [balance](#balance) is at
zero (no channel was claimed, nothing was attempted); `429` if you're over
your token's concurrent-call limit; `503` if the number has no free
channels right now; `502` if origination itself failed at the telephony
layer.

### GET /v1/calls — call history

```bash
curl "https://your-domain/v1/calls?limit=20" -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

Query params: `limit` (default 50, max 200).

```json
[
  {
    "call_id": "call_af38be6e319e2a9df2d1cc4f",
    "direction": "outbound",
    "to_number": "+8801XXXXXXXXX",
    "from_number": "09639606204",
    "status": "completed",
    "started_at": "2026-07-17T00:35:30Z",
    "answered_at": "2026-07-17T00:35:39Z",
    "ended_at": "2026-07-17T00:35:46Z",
    "has_recording": false,
    "pressed_digit": "1",
    "retry_attempt": 0,
    "retry_of_call_id": null
  }
]
```

`pressed_digit` is the most recent DTMF digit a workflow run resolved on this call (`null` if the call never went through a workflow, or the customer never pressed anything). This is the same information the `workflow_dtmf` webhook carries — useful here if you'd rather poll/list than run a webhook receiver.

`retry_attempt`/`retry_of_call_id` only apply to an outbound workflow call
that went unanswered and had a `retry_schedule_minutes` set (see "Building
an outbound IVR" below) — `retry_attempt` is `0` on the original call, `N`
on its Nth automatic redial; `retry_of_call_id` is `null` on the original
and points back at it on every retry, so `id = X OR retry_of_call_id = X`
fetches a whole chain in one list call.

Scoped to your own account — you'll only ever see calls where `user_id`
matches your token, newest first.

### GET /v1/calls/{id} — call status

```bash
curl https://your-domain/v1/calls/call_af38be6e319e2a9df2d1cc4f -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

```json
{"call_id": "call_af38be6e319e2a9df2d1cc4f", "status": "completed", "retry_attempt": 0, "retry_of_call_id": null}
```

Possible `status` values you'll see over a call's lifetime: `initiated` →
`ringing_softphone` / `ringing_bridge_number` / `ringing_number_fallback` /
`workflow_active` (mode-2 calls) → `answered` → `bridged` → `completed` (or
`failed`). `404` if the call doesn't exist or isn't yours.

### GET /v1/calls/{id}/recordings

Only returns results if recording is enabled for your account and storage is
configured platform-side (ask your operator).

```bash
curl https://your-domain/v1/calls/call_.../recordings -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

```json
[
  {
    "recording_id": 12,
    "status": "uploaded",
    "duration_seconds": 47,
    "url": "https://.../recordings/call_..._....wav"
  }
]
```

`status` progresses `recording` → `pending_upload` → `uploading` →
`uploaded` (or `failed`). `url` is only present once `status` is `uploaded`
— it's freshly generated per request (a signed, expiring link, or a stable
public one, depending on how storage is configured), never cache it long-term.

### POST /v1/calls/extension — an Extension places a call

Everything above needs a bearer token — but an Extension (an additional
line under your account, see [Mental model](#mental-model)) never gets one.
This is how it places a call anyway: same ring-then-bridge flow as
`POST /v1/calls`, authenticated with the Extension's own `phone_number`/id +
password instead.

```bash
curl -X POST https://your-domain/v1/calls/extension \
  -H "X-Extension-Identifier: +8801700000020" -H "X-Extension-Password: $EXT_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"to": "+8801XXXXXXXXX"}'
```
```json
{"call_id": "call_3f15368c0550fe5690f4c2ee", "status": "initiated"}
```

`X-Extension-Identifier` is the same `phone_number`-or-raw-id shape as
[`POST /v1/auth/login`](#post-v1authlogin--identifiercredential-login)'s
`identifier` (`mode="extension"`) — use the `extension_id` from that
response, or the phone number directly. Deliberately minimal compared to
`POST /v1/calls`: just `to`, nothing else — an Extension always rings its
own line, there's no `agent_extension` choice to make, and no
`workflow`/`workflow_id`/`webhook_url` support (yet).

| Status | Meaning |
|---|---|
| `401` | Invalid extension identifier or password |
| `409` | This Extension's own SIP/WebRTC line isn't provisioned yet |
| `402` | The owning account's [balance](#balance) is at zero — an Extension bills against it, it has none of its own |
| `503` | No free channels on the account's Number right now — retry shortly |

### GET /v1/calls/extension/{id} — Extension call status

Same shape as [`GET /v1/calls/{id}`](#get-v1callsid--call-status) above,
same two headers instead of a bearer token. Scoped to the *account* that
owns the Extension (not "calls this specific Extension placed" — an
Extension has no id space of its own here), same permissiveness a User's
own token already has for its account's calls.

```bash
curl https://your-domain/v1/calls/extension/call_3f15368c0550fe5690f4c2ee \
  -H "X-Extension-Identifier: +8801700000020" -H "X-Extension-Password: $EXT_PASSWORD"
```

**Not yet supported for an Extension**: recordings, workflow-driven calls —
still bearer-token-only. Transfer/merge *is* supported — see
[POST /v1/calls/extension/{id}/transfer](#post-v1callsextensionidtransfer)
below.

### GET /v1/calls/extension — this line's own call history

The Extension equivalent of [`GET /v1/calls`](#get-v1calls--call-history)
above — same response shape, same `limit` param, same two headers instead
of a bearer token. Scoped **narrower** than the status endpoint above,
though: only calls that actually rang *this* line (matched via which line
answered), not every call on the account — the same "each employee sees
their own log" boundary a real multi-line office phone has.

```bash
curl "https://your-domain/v1/calls/extension?limit=50" \
  -H "X-Extension-Identifier: +8801700000020" -H "X-Extension-Password: $EXT_PASSWORD"
```

**Outbound-only** — an inbound call answered by this line can't be
included yet (the backend doesn't currently record which specific line
answered a ring-group call; the admin panel's own per-line usage report
has this identical gap).

### POST /v1/calls/{id}/transfer

Transfer a call that's currently bridged (`status: "bridged"`) to a new
destination — either blind (fire-and-forget) or attended (consult first).

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | Transfer destination |
| `mode` | `"blind"` \| `"attended"` | no, default `"blind"` | |
| `via` | `"extension"` \| `"trunk"` | no, default `"extension"` | `extension` dials an internal line (e.g. another agent); `trunk` dials out through this call's own number to a real phone number |

```bash
curl -X POST https://your-domain/v1/calls/call_.../transfer \
  -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"to": "ext-2", "mode": "attended", "via": "extension"}'
```

```json
{"transfer_id": 4, "status": "pending"}
```

For `mode: "blind"`, that's the whole flow — the platform swaps the new
party in and drops the old one automatically once they answer. For
`mode: "attended"`, `status` becomes `"consulting"` once the new party
answers (you're now talking to them privately, customer on hold) — call one
of the two endpoints below next.

**Important — `via: "extension"` requires the target to actually be
registered** (someone logged into that softphone line right now). If nobody's
logged in, the transfer will fail every time, not intermittently.

### POST /v1/calls/{id}/transfer/{transfer_id}/complete

Only valid while `status: "consulting"` (attended mode). Swaps the consulted
party in with the customer and drops your own leg.

```bash
curl -X POST https://your-domain/v1/calls/call_.../transfer/4/complete -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

### POST /v1/calls/{id}/transfer/{transfer_id}/cancel

Only valid while `status: "consulting"`. Hangs up the consulted party and
restores you to the original call with the customer.

```bash
curl -X POST https://your-domain/v1/calls/call_.../transfer/4/cancel -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

### POST /v1/calls/extension/{id}/transfer

The Extension equivalent of the four endpoints above — identical
`to`/`mode`/`via` fields, identical `TransferResponse` shape, identical
blind/attended flow, just `X-Extension-Identifier`/`X-Extension-Password`
instead of a bearer token. Scoped **tighter** than
[`GET /v1/calls/extension/{id}`](#get-v1callsextensionid--extension-call-status)'s
own account-wide lookup: only a call that actually rang *this* line can be
transferred, matching `GET /v1/calls/extension`'s own "this line's own
calls" scoping above.

```bash
curl -X POST https://your-domain/v1/calls/extension/call_.../transfer \
  -H "X-Extension-Identifier: +8801700000020" -H "X-Extension-Password: $EXT_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"to": "ext-2", "mode": "attended", "via": "extension"}'
```

`GET /v1/calls/extension/{id}/transfer/{transfer_id}`,
`POST .../transfer/{transfer_id}/complete`, and
`POST .../transfer/{transfer_id}/cancel` all work exactly like their
bearer-token equivalents above, same two headers instead of a token.

---

## Balance

Every account has a prepaid call balance, billed in whole **seconds**
against actual talk time — the response shows both `balance_seconds` (exact)
and `balance_minutes` (`balance_seconds / 60`, for display). Once it reaches
zero, placing a **new** call returns `402` — a call already in progress is
never cut off, so the balance can briefly go slightly negative.

This applies to every way a call gets placed on the platform: `POST
/v1/calls`, `POST /v1/calls/extension` (billed against the owning account —
an Extension has no balance of its own), workflow/no-agent calls, and Call
Blast targets alike. Only outbound talk time is ever billed — ring time and
inbound calls are free.

### GET /v1/balance

Your own account's current balance.

```bash
curl https://your-domain/v1/balance -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
```json
{"user_id": 42, "balance_seconds": 930, "balance_minutes": 15.5}
```

### GET /v1/balance/extension

The Extension equivalent — same two headers instead of a bearer token,
returns the *owning account's* balance (an Extension bills against it, it
doesn't have its own).

```bash
curl https://your-domain/v1/balance/extension \
  -H "X-Extension-Identifier: +8801700000020" -H "X-Extension-Password: $EXT_PASSWORD"
```

### POST /v1/partners/users/{user_id}/balance — top up (Partner API)

Partner-only — see the [Partner API](#partner-api--provisioning-users-for-an-external-company)
section below for the auth model. Adds minutes to a User your Partner
account created; always additive, never a correction mechanism (an
operator can set an exact value by hand from the admin panel, but there's
no tenant- or partner-facing API for that).

| Field | Type | Required | Description |
|---|---|---|---|
| `minutes` | integer > 0 | yes | Minutes to add — converted to seconds internally (`minutes * 60`) |

```bash
curl -X POST "https://your-domain/v1/partners/users/42/balance?is_paid=true" \
  -H "X-Api-Key: $PARTNER_API_KEY" -H "Content-Type: application/json" \
  -d '{"minutes": 100}'
```
```json
{"user_id": 42, "balance_seconds": 6930, "balance_minutes": 115.5}
```

`?is_paid=true` is required (self-attested by your own backend, same as
every other `is_paid` gate in this API — see
[Feature flags](#feature-flags--what-a-partner-created-user-can-do)) —
omit it or send `false` and you'll get a `403`. `404` if `user_id` wasn't
created by your Partner account.

---

## Webhooks

Your platform operator configures a `webhook_url` for your User account
(and optionally per-number, per-call via `webhook_url` on the originate
request, or per-workflow-node — see below). Every call event fires an HTTPS
POST there.

**Events**: `initiated`, `answered`, `bridged`, `completed`, `failed`,
`transferred`, `transfer_failed`, `forwarded`, `workflow_node`,
`workflow_dtmf`, `workflow_complete`, `workflow_error`,
`workflow_retry_scheduled`, `workflow_retries_exhausted`.

**Base payload** (every event has these fields, plus event-specific extras
merged in):

```json
{
  "event": "workflow_dtmf",
  "call_id": "call_af38be6e319e2a9df2d1cc4f",
  "user_id": 1,
  "direction": "outbound",
  "to": "+8801XXXXXXXXX",
  "from": "09639606204",
  "status": "workflow_active",
  "timestamp": "2026-07-17T00:35:39Z"
}
```

**`user_id`** identifies which account the event belongs to — `null` for a
call with no assigned tenant at all (e.g. inbound to a common/shared
number's own `fallback_number`). If your own backend fronts multiple
selx-sip accounts behind a single shared webhook receiver, this is what you
switch on to route the event to the right place; don't assume your
receiver only ever gets one account's events just because you only
configured one URL.

**`workflow_dtmf`** adds `node` (which prompt node fired) and `digit` (what
they pressed, `""` if it timed out) — this is how you find out "the customer
pressed 1."

**`completed`**/`failed`** fire once a call ends. If a call fails, the *why*
(e.g. "No route to destination", "Normal Clearing") isn't currently exposed
through the tenant API — only `status` — so if you need the failure reason
programmatically, that's a gap to flag to your operator (it's tracked
server-side on the `Call` record, just not surfaced here yet).

**`workflow_retry_scheduled`** fires on the *original* call's webhook lane
the moment an automatic no-answer redial actually gets placed (see "No-answer
retries" below) — adds `attempt` (the new call's `retry_attempt`, e.g. `1`
for the first redial) and `retry_call_id` (the new call's own `call_id`, so
you can look it up or match it against a later `initiated`/`completed`
event for that same id).

**`workflow_retries_exhausted`** fires once on the *last* attempt in a retry
chain once no more redials are due — either every scheduled attempt has now
run and gone unanswered, or the chain hit a dead end it can't recover from
(no outbound number currently available, or the token that placed the
original call has since been revoked/deleted — check `reason` in that case).
Adds `total_attempts` (original call counts as attempt 1). This is your
signal that the chain is genuinely done — nothing further will be retried
for this customer.

### Verifying signatures

Every webhook carries `X-Signature: t=<unix_ts>,v1=<hex-hmac-sha256>`,
computed as `HMAC-SHA256(webhook_secret, "{ts}." + raw_json_body)`. Your
`webhook_secret` is visible on your account's admin detail page — treat it
like a password.

**Always verify before trusting a webhook** — reject anything with a
mismatched signature or a `ts` more than a few minutes old (replay
protection).

**Node.js**:
```js
const crypto = require("crypto");

function verifyWebhook(rawBody, signatureHeader, secret) {
  const [tsPart, sigPart] = signatureHeader.split(",");
  const ts = tsPart.split("=")[1];
  const sig = sigPart.split("=")[1];

  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // >5min old

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

**Python**:
```python
import hashlib, hmac, time

def verify_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    ts_part, sig_part = signature_header.split(",")
    ts = ts_part.split("=", 1)[1]
    sig = sig_part.split("=", 1)[1]

    if abs(time.time() - int(ts)) > 300:  # >5min old
        return False

    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

Use the **raw request body bytes**, not a re-serialized/parsed version — any
re-encoding (key order, whitespace) will break the signature check.

Also sent: `X-Selx-Webhook-Source` (which lane fired this — `call_override`,
`number`, `user`, or `workflow_node`) — useful if you've configured more than
one webhook lane and want to tell them apart.

Delivery retries with exponential backoff on failure/non-2xx — your endpoint
should be idempotent (dedupe on `call_id` + `event`, since a retry can arrive
after you already processed the original). Deliveries are dispatched
concurrently (not one-at-a-time), so **don't assume events arrive in strict
chronological order** — if your receiver needs to reconstruct a call's
timeline, sort by each event's own `timestamp` field rather than relying on
arrival order.

### GET /v1/webhooks — activity log

Don't have a receiver stood up yet, or just want to confirm a webhook
actually fired and what your endpoint returned? This lists your account's
recent deliveries without needing one:

```bash
curl "https://your-domain/v1/webhooks?limit=20" -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

```json
[
  {
    "id": 41,
    "call_id": "call_af38be6e319e2a9df2d1cc4f",
    "event": "workflow_dtmf",
    "url": "https://your-site.com/webhooks/call-outcome",
    "source": "workflow_node",
    "status": "delivered",
    "response_status": 200,
    "last_error": null,
    "attempt_count": 1,
    "created_at": "2026-07-17T00:35:39Z"
  }
]
```
The Selx Softphone app surfaces this same list under its Webhooks tab.

---

## Partner API — provisioning Users for an external company

Separate from the tenant API above — this is for a **company**, not an
individual User account, to create new Users on this platform
programmatically instead of an operator doing it by hand through the admin
panel. Two kinds of partner, set up by your operator, with different
requirements:

- **direct** — passes a pre-shared API key. No `bridge_number` at creation
  time — that's set later via a separate API.
- **reseller** — an API-seller company reselling this platform under its own
  product. Submits `bridge_number` as part of the request, and must
  additionally pass `?is_paid=true&is_verified=true` as query params on
  every call — self-attested by the reseller's own backend (we don't
  independently verify billing/KYC, we just gate on these flags).

Authenticate with `X-Api-Key: <key>` — a partner's API key is a distinct
credential from a tenant bearer token, issued by your operator via
[`POST /admin/api/partners`](#operator-only-setup-not-for-tenant-developers).

### POST /v1/partners/users — create a User

`phone_number` is required for every new User — it's what
[`POST /v1/auth/login`](#post-v1authlogin--identifiercredential-login) and
the `X-Phone-Number` header authenticate against, and must be unique across
the whole platform (`422` if it's already taken).

```bash
# direct partner
curl -X POST https://your-domain/v1/partners/users \
  -H "X-Api-Key: $PARTNER_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "phone_number": "+8801700000010"}'

# reseller partner
curl -X POST "https://your-domain/v1/partners/users?is_paid=true&is_verified=true" \
  -H "X-Api-Key: $PARTNER_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "phone_number": "+8801700000010", "bridge_number": "+8801XXXXXXXXX"}'
```

The response is an immediate acknowledgment only — no secrets:
```json
{"status": "queued", "user_id": 42, "user_slug": "K3XQ7RTP"}
```
`user_id` is kept for backward compatibility; prefer `user_slug` (or
`phone_number`) anywhere you'd otherwise store/display/log a raw id — see
[Public identifiers](#public-identifiers--why-user_id-isnt-always-the-answer)
below.

The actual credentials are delivered **only** via an asynchronous webhook to
your partner account's registered `webhook_url` (never in the HTTP response
above), signed the same way as the [call-event
webhooks](#verifying-signatures) — except with your **partner's own**
`webhook_secret` (issued alongside your API key at partner creation), not
the new User's:

```json
{
  "event": "user.created",
  "user_id": 42,
  "user_slug": "K3XQ7RTP",
  "bearer_token": "plt_live_...",
  "extension": "user-42",
  "extension_password": "...",
  "webhook_secret": "..."
}
```

`webhook_secret` in that payload is the **new User's own** — hand it to
whoever operates that account so they can verify the call-event webhooks
(see [Verifying signatures](#verifying-signatures)) they'll start receiving
once that User places/receives calls.

| Status | Meaning |
|---|---|
| `202` | Accepted — User creation queued, webhook incoming |
| `401` | Invalid/revoked partner API key |
| `403` | Reseller partner: `is_paid` and/or `is_verified` wasn't `true` |
| `422` | `phone_number` missing or already in use by another User |
| `422` | Missing `bridge_number` (reseller), or `bridge_number` sent by a direct partner — set that separately instead |

Delivery retries with exponential backoff, same as the call-event webhook
lane — your receiver should be idempotent (dedupe on `user_id` + `event`).

### Feature flags — what a partner-created User can do

Placing ordinary calls (`POST /v1/calls` with no `workflow`/`workflow_id`) is
**never gated** — every User can always do that. Everything else (call
recording, call blast, IVR workflows/TTS, multi-extension lines, call
transfer) is gated per-User by a feature flag:

- A User created by a **direct** partner (or by your operator directly) has
  every feature enabled automatically, the moment it's created.
- A User created by a **reseller** partner starts with every feature **off**.
  Hitting a gated endpoint before you enable the feature returns `403`. You
  turn a feature on once your own customer has actually paid for it:

### POST /v1/partners/users/{user_id}/features/{feature} — enable a feature

```bash
curl -X POST "https://your-domain/v1/partners/users/42/features/call_blast?is_paid=true" \
  -H "X-Api-Key: $PARTNER_API_KEY"
```

`feature` is one of: `recording`, `call_blast`, `workflows`, `multi_extension`,
`transfer`. `?is_paid=true` is required and self-attested by your own
backend — same trust model as `is_paid`/`is_verified` at account creation, we
don't independently verify billing here either. There's no corresponding
"disable" call on this API — an operator can turn a feature back off from the
admin panel if needed.

```json
{"status": "enabled", "user_id": 42, "feature": "call_blast"}
```

| Status | Meaning |
|---|---|
| `200` | Feature enabled |
| `403` | `is_paid` wasn't `true` |
| `404` | No such `user_id`, **or** that User wasn't created by this partner (a reseller can only touch Users it created itself, never any other account on the platform) |
| `422` | `feature` isn't a recognized slug |

### Public identifiers — why `user_id` isn't always the answer

`user_id` is a raw internal auto-increment number — two of them, seen a week
apart, tell you roughly how many accounts got created in between. `user_slug`
(and `extension_slug` for a line under one) doesn't have that property; it's
a random public code with no ordering to it. Prefer slugs anywhere you'd log,
display, or hand this identifier to someone outside your own backend;
`user_id` stays supported on every existing endpoint for backward
compatibility, it's just not the recommended default going forward.

### POST /v1/partners/users/{user_id}/regenerate-token — "I forgot my token"

Tokens are hashed at rest — there's no plaintext value to look up and resend,
only replace. This **revokes every currently-active token** the User has and
issues one fresh one (not "add another alongside" — a forgotten credential is
treated as possibly lost/compromised, same posture any forgot-password flow
takes).

```bash
curl -X POST https://your-domain/v1/partners/users/42/regenerate-token \
  -H "X-Api-Key: $PARTNER_API_KEY"
```
```json
{"status": "queued", "user_id": 42}
```
The new token is delivered the same way as at account creation: an
asynchronous `credentials.regenerated` webhook to your `webhook_url`
(`{"event": "credentials.regenerated", "user_id", "user_slug",
"credential_type": "token", "bearer_token"}`), never in this HTTP response.

### POST /v1/partners/users/{user_id}/extensions/{extension_id}/regenerate-password — "I forgot my extension password"

Same idea, for one Extension line under the User instead of the account's own
token. Re-provisions that line's SIP/WebRTC registration immediately with the
new password.

```bash
curl -X POST https://your-domain/v1/partners/users/42/extensions/7/regenerate-password \
  -H "X-Api-Key: $PARTNER_API_KEY"
```
```json
{"status": "queued", "user_id": 42}
```
Delivered via the same `credentials.regenerated` webhook event
(`"credential_type": "extension_password"`, plus `extension_id`,
`extension_slug`, `extension`, `extension_password`).

Both credential-recovery endpoints share the same ownership scoping as the
feature-enable endpoint above — `404` if `user_id` doesn't exist or wasn't
created by the calling partner; the extension endpoint additionally `404`s
if `extension_id` doesn't belong to that `user_id`.

---

## Building an outbound IVR ("press 1 to approve")

This is what powers a call like "Thank you for your order. Press 1 to
approve, press 2 to cancel." — no human agent, no pre-recorded voice call
menu shared with your other flows, just this one script.

### Full example — text to a live "press 1" call

Everything below, start to finish: turn text into speech, build a workflow
around it, and place the call. Four requests, no dashboard required.

```bash
TOKEN="plt_live_..."
USER_ID="1"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID")

# 1. Create the workflow — a workflow has no "kind" of its own, this is just
#    a reusable IVR script that doesn't do anything until you assign it
#    somewhere (step 3). Reference a TTS prompt name for the main prompt's
#    `voice` — here "order_approval_ask" — you'll create that prompt next.
curl -X POST https://your-domain/v1/workflows "${AUTH[@]}" -H "Content-Type: application/json" -d '{
  "name": "Order approval",
  "definition": {
    "start": "ask",
    "nodes": {
      "ask": {
        "type": "prompt",
        "voice": "order_approval_ask",
        "timeout_ms": 10000,
        "branches": {"1": "approved", "2": "cancelled", "_timeout": "no_response", "_default": "no_response"},
        "webhook_url": "https://your-site.com/webhooks/call-outcome"
      },
      "approved": {"type": "hangup"},
      "cancelled": {"type": "hangup"},
      "no_response": {"type": "hangup"}
    }
  }
}'
# -> {"id": 7, "name": "Order approval", "definition": {...}, "assigned_as": []}

# 2. Turn your prompt text into speech, under the same name the node above
#    references.
curl -X POST https://your-domain/v1/tts/order_approval_ask "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"text": "Thank you for your order. Press 1 to approve, or press 2 to cancel."}'
# -> {"name": "order_approval_ask", "voice": "tts-user-1-order_approval_ask", "text": "Thank you for your order. Press 1 to approve, or press 2 to cancel."}

# 3. Assign it to your account's outbound slot — this is what makes
#    `workflow: true` (below) actually resolve to it.
curl -X PUT https://your-domain/v1/workflows/outbound "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"workflow_id": 7}'
# -> {"slot": "outbound", "workflow_id": 7}

# 4. Call the customer — no agent leg, this rings THEM directly. `workflow:
#    true` means "whatever's currently assigned to my account's outbound
#    slot" — no id to track or pass in, as long as you don't reassign it.
curl -X POST https://your-domain/v1/calls "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"to": "+8801XXXXXXXXX", "workflow": true}'
# -> {"call_id": "call_af38be6e319e2a9df2d1cc4f", "status": "initiated"}
```

They answer, hear the ElevenLabs-generated prompt, press `1` or `2`. Your
`https://your-site.com/webhooks/call-outcome` then receives (see
[Verifying signatures](#verifying-signatures) before trusting it):

```json
{
  "event": "workflow_dtmf",
  "call_id": "call_af38be6e319e2a9df2d1cc4f",
  "user_id": 1,
  "direction": "outbound",
  "to": "+8801XXXXXXXXX",
  "from": "09639606204",
  "status": "workflow_active",
  "timestamp": "2026-07-17T00:35:39Z",
  "node": "ask",
  "digit": "1"
}
```
`digit: "1"` — that's your answer. No dashboard, no polling — steps 1–4 are
the entire integration; everything after is your webhook receiver reacting
to `digit`.

To change the message later, redo step 2 alone (same prompt name) — no need
to touch the workflow or the calling code at all, since the node still
references that same name. To change the branches, repeat step 1's `PUT
/v1/workflows/id/7` instead (updates the workflow in place, same `id`) —
step 4 never needs to change either way, since `workflow: true` follows
whatever's currently assigned, not a fixed id. To swap in a completely
different workflow later without touching your calling code at all, just
repeat step 3 with a different `workflow_id`.

### Reference

A workflow is fully generic — it has no "kind" or "default" flag of its
own. You can hold any number of them, each with its own `id`, fully
create/edit/delete-able independently:
- **Your own** — created/owned by your account, editable by you.
- **Operator/global** ones, created via `POST /admin/api/workflows` (admin
  credentials, unlimited, id-indexed) — usable by any tenant's
  `workflow_id` call, but only editable by the operator. Never resolved via
  `workflow: true` or account assignment — only by explicit `workflow_id`.

Whether (and how) one of **your own** workflows actually runs is decided
purely by **assignment** — two independent slots on your account,
`outbound` and `inbound`, each either unset or pointing at one of your
workflow ids. The same workflow id can be assigned to both slots at once,
and either slot can be repointed (or cleared) at any time without touching
the workflow's own content — see [Mental model](#mental-model) for what
each slot actually triggers. The Selx Softphone app has a built-in visual
builder (a flat list of all your workflows, each showing which slot(s) it's
currently assigned to, with per-row Edit/Delete/assign-toggle actions and a
"+ New workflow" button) if you'd rather not hand-write JSON.

**Id-based CRUD** (your tenant token, no admin credentials needed):

```bash
# List all of your own workflows
curl https://your-domain/v1/workflows -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
# -> [{"id": 7, "name": "Order approval", "start": "ask", "nodes_count": 4, "assigned_as": ["outbound"]}, ...]

# Create a new one — always unassigned to start; assign it via the slot
# endpoints below once you're ready to actually use it
curl -X POST https://your-domain/v1/workflows -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"name": "Appointment reminder", "definition": {...}}'
# -> {"id": 8, "name": "Appointment reminder", "definition": {...}, "assigned_as": []}

# Fetch / edit / delete a specific one by id
curl https://your-domain/v1/workflows/id/7 -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
curl -X PUT https://your-domain/v1/workflows/id/7 -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"name": "Order approval v2"}'
curl -X DELETE https://your-domain/v1/workflows/id/7 -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

**Assignment** — `slot` is `outbound` or `inbound`:

```bash
# What's currently assigned to a slot (404 if nothing is)
curl https://your-domain/v1/workflows/outbound -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"

# Point a slot at one of your own workflows — the workflow must belong to
# you (404 otherwise). Only this slot changes; the other slot and the
# workflow's own content are untouched, and the same id can already be
# assigned to the other slot with no conflict.
curl -X PUT https://your-domain/v1/workflows/outbound -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"workflow_id": 7}'
# -> {"slot": "outbound", "workflow_id": 7}

# Clear a slot's assignment — does NOT delete the workflow itself, just
# unassigns it from this slot
curl -X DELETE https://your-domain/v1/workflows/outbound -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
# Same two verbs work identically for /v1/workflows/inbound
```

**No-answer retries** — set `retry_schedule_minutes` on a workflow itself —
a list of delays in minutes, one per retry, each relative to when the
*previous* attempt ended (not cumulative from the original call). Only
actually takes effect for a workflow currently reached via an
**outbound**-triggered call (`workflow: true`/`workflow_id`) — nothing ever
retries an inbound call, since the platform never originates those:

```bash
curl -X PUT https://your-domain/v1/workflows/id/7 -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"retry_schedule_minutes": [5, 15]}'
# -> 1st redial 5 min after the original call goes unanswered;
#    2nd redial 15 min after THAT redial itself goes unanswered
#    (~20 min after the original, total). Omit or set null to go back to
#    one attempt only. Up to 10 entries, each 1–1440 minutes.
```

Applies to **any** `POST /v1/calls {"workflow": true}`/`workflow_id` call
placed with this workflow that ends unanswered — busy, explicitly rejected,
and genuine no-answer are all retried the same way (no cause-based
filtering). Every redial is a completely ordinary call under the hood (same
`to`, same `variables`, a fresh number claim) — you'll see it show up as
its own row in `GET /v1/calls` linked back via `retry_of_call_id`, and get
the usual `initiated`/`answered`/`completed`/`failed` events for it, plus
`workflow_retry_scheduled`/`workflow_retries_exhausted` on the *original*
call's lane (see [Webhooks](#webhooks)) marking the chain's overall
progress. A `PUT` that omits `retry_schedule_minutes` entirely leaves
whatever you had configured unchanged — send it explicitly as `null` to
clear it.

**Node types**:

| Type | Fields | Behavior |
|---|---|---|
| `play` | `voice`, `next`, `webhook_url` | Plays an audio file, then moves to `next` |
| `prompt` | `voice`, `timeout_ms` (default 8000), `branches`, `webhook_url` | Plays audio, waits for one DTMF digit |
| `forward` | `number`, `gateway`, `webhook_url` | Dials a PSTN number, bridges as an ordinary call from there on |
| `transfer_agent` | `extension`, `webhook_url` | Dials an internal extension, bridges as an ordinary call from there on |
| `hangup` | `webhook_url` | Ends the call |

Every node type accepts an optional `webhook_url` — fires a `workflow_node`
event (and, for `prompt`, `workflow_dtmf`) to that URL specifically, in
addition to whatever URL your account/number/call already resolves to (see
[Multi-lane webhooks](#webhooks)).

**`prompt` branch resolution** (exact order matters):
1. A real keypress → `branches[<digit>]`, else `branches["_default"]`
2. No keypress before `timeout_ms` → `branches["_timeout"]`, else `branches["_default"]`
3. Nothing matches → the call ends with a `workflow_error` webhook event

An empty-string branch target (`""`) means "end cleanly, do nothing more" —
different from a `hangup` node, which actively hangs up. A single node
re-visited more than 5 times (a loop) ends the call automatically as a
safety net.

**Example** — the exact shape used for order approval:

```json
{
  "name": "Order approval",
  "definition": {
    "start": "ask",
    "nodes": {
      "ask": {
        "type": "prompt",
        "voice": "order-approval",
        "timeout_ms": 10000,
        "branches": {"1": "approved", "2": "cancelled", "_timeout": "no_response", "_default": "no_response"},
        "webhook_url": "https://your-site.com/webhooks/call-outcome"
      },
      "approved": {"type": "hangup"},
      "cancelled": {"type": "hangup"},
      "no_response": {"type": "hangup"}
    }
  }
}
```

`voice` references an audio filename — but on **your own** workflows you
can omit it entirely: a `play`/`prompt` node with no `voice` falls back to
whatever text is currently saved under your account's prompt named
`"default"` (see the next section — `POST /v1/tts/{name}`), re-resolved
fresh on every call — update that prompt's text later and every future call
speaks the new version immediately, no need to touch the workflow at all.
**This one `"default"` fallback is shared across every workflow on your
account** — if you hold more than one workflow and leave `voice` unset on
more than one of them, they'll all speak the same text. Set `voice`
explicitly (a distinct name per workflow, e.g. `"order_approval_ask"`, as
shown in the walkthrough above) to keep multiple workflows' audio from
colliding — this is exactly what the Selx Softphone builder does
automatically for every workflow it creates. Set `voice` explicitly to
reference a *different* named prompt's own `voice` value (e.g. one node says
"thank you", another says "sorry, try again" — each its own name), or to
override this on an **operator/global** workflow, where it must reference a
filename already staged on the server (ask your operator). `next`/`branches`
values reference other node names in the same `nodes` object.

Trigger a workflow for an outbound call with `POST /v1/calls` and
`workflow: true` (whatever's assigned to your outbound slot) or
`workflow_id` (a specific one, yours or operator/global), as shown in the
walkthrough above. A workflow assigned to your **inbound** slot needs no
explicit trigger at all — it runs automatically the moment your account has
both a dedicated Number and something assigned there. Either way, the
result arrives via the `workflow_dtmf` webhook on whichever `webhook_url`
you set (node-level, as above, or your account-level default).

### POST /v1/tts/{name} — text-to-speech for your prompts

Turns plain text into the audio file a workflow node's `voice` field
references — no recording equipment, no manually staging a file. Your
account can hold **several named prompts**, not just one — `name` is a
filename-safe slug (letters/digits/`_`/`-`, up to 32 chars) you choose;
submitting to an existing name overwrites that prompt's audio and text,
there's no history. The name `"default"` is special — see the `voice`
fallback note in [Reference](#reference) above — any other name is only
ever used by explicitly setting a node's `voice` to that prompt's own
`voice` value.

```bash
curl -X POST https://your-domain/v1/tts/default -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"text": "Thank you for your order. Press 1 to approve, or press 2 to cancel."}'
```
```json
{"name": "default", "voice": "tts-user-1", "text": "Thank you for your order. Press 1 to approve, or press 2 to cancel.", "voice_id": null, "model_id": null, "language": null}
```
Use `voice` exactly as returned in a workflow node's `voice` field.
Generation takes a few seconds (round-trips to ElevenLabs) — this endpoint
doesn't return until it's done and the file is ready to play.

**Your own voice, not the platform default.** Pass optional `voice_id`
(an ElevenLabs voice ID), `model_id` (an ElevenLabs model ID), and/or
`language` (e.g. `"bn"` for Bangla — picks a language-appropriate default
model when `model_id` isn't also set, without you needing to know
ElevenLabs' model names) alongside `text`. Setting these on the prompt
named `"default"` is what gives your whole account its own voice, since
every voice-less node and every `say`-template (dynamic, per-call TTS)
falls back to that prompt:
```bash
curl -X POST https://your-domain/v1/tts/default -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" \
  -d '{"text": "আপনার অর্ডারের জন্য ধন্যবাদ।", "voice_id": "your-elevenlabs-voice-id", "language": "bn"}'
```
A later submission that only changes `text` does **not** reset a
previously-set `voice_id`/`model_id`/`language` back to the platform
default — those three are only touched when the request body explicitly
includes them. Send an explicit `null` for one to actually clear it.

```bash
# List all of your account's prompts
curl https://your-domain/v1/tts -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
# -> [{"name": "default", "voice": "tts-user-1", "text": "...", "voice_id": null, "model_id": null, "language": null}, {"name": "thankyou", "voice": "tts-user-1-thankyou", "text": "...", "voice_id": null, "model_id": null, "language": null}]

# Fetch or delete one by name (404 if that name doesn't exist)
curl https://your-domain/v1/tts/default -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
curl -X DELETE https://your-domain/v1/tts/default -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```

Requires your operator to have configured an ElevenLabs API key
platform-side — a `502` with a message like "text-to-speech is not
configured on this platform" means they haven't yet.

### GET /v1/tts/voices — browse available voices

Lists this platform's ElevenLabs voice library so you can pick a `voice_id`
for `POST /v1/tts/{name}` instead of needing one already from ElevenLabs'
own dashboard. Same list for every tenant — the platform has one ElevenLabs
account, you're picking from its shared voice library, not bringing your
own. Cached server-side (an hour), so it's cheap to call on every page load
of a voice picker.

```bash
curl https://your-domain/v1/tts/voices -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
```json
[
  {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "preview_url": "https://...", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
  {"voice_id": "...", "name": "...", "preview_url": null, "category": "cloned", "labels": null}
]
```
`preview_url` is a short sample clip (may be `null` for some voices) —
play it directly in a browser `<audio>` element, it needs no auth. Pass the
`voice_id` you land on as `voice_id` in a `POST /v1/tts/{name}` body.

---

## Call blast (bulk outbound-workflow calling)

Calls a large list of numbers automatically, running the same workflow on
each one — e.g. "press 1 to confirm your order," an appointment reminder, a
promo blast to a few thousand customers. **Only available to an account
with its own dedicated Number** — this reserves a slice of that Number's own
`channel_limit`, which isn't something one tenant can do to the
shared/common Number (other tenants also place calls through it).

### Mental model

- **Reserve, don't partition.** You pick `reserved_channels` (e.g. 2 of your
  Number's 5 total) — the blast is capped at that many calls in flight at
  once, and **guaranteed** that many: while it's running, ordinary calls
  (agent-mediated, or `workflow: true`/`workflow_id`) are capped at
  `channel_limit - reserved_channels`, so they can never crowd the blast
  out. The other channels keep behaving completely normally the whole time
  — this isn't a hard split of your Number into two pools, just a guarantee
  on the blast's own slice.
- **Create = start.** There's no separate draft/start step — `POST
  /v1/blasts` immediately begins dialing.
- **Pause gives the reservation back immediately.** Whatever's already
  ringing or connected keeps running to its own natural conclusion; pausing
  just stops new numbers from being dialed. This is the *only* way to free
  up those channels before the blast finishes on its own — resume picks up
  exactly where it left off.
- **Cancel is permanent.** Numbers never dialed are marked `skipped`;
  numbers already mid-call keep running and still get a real final outcome
  recorded, same as pause.
- **Retries reuse the workflow's own `retry_schedule_minutes`** (see
  [Building an outbound IVR](#building-an-outbound-ivr-press-1-to-approve))
  — no separate retry concept for a blast. A number counts as still "in
  flight" (occupying one of the blast's reserved slots) for its entire
  attempt-plus-retries lifecycle, not just while actually ringing — so
  `reserved_channels` is really "how many numbers are being worked at once,"
  not a literal count of active phone channels at any given instant.

### POST /v1/blasts — create and start a blast

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | A label for your own reference |
| `workflow_id` | integer | yes | Which workflow runs on each answered call — yours or an operator/global one |
| `numbers` | string[] | yes | The list to call. Deduped and trimmed server-side; blanks dropped. Up to 5,000 per blast |
| `reserved_channels` | integer | yes | How many concurrent slots to guarantee this blast, `1` to your dedicated Number's `channel_limit` |

```bash
curl -X POST https://your-domain/v1/blasts -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "Content-Type: application/json" -d '{
  "name": "July promo",
  "workflow_id": 7,
  "numbers": ["+8801XXXXXXXXX", "+8801YYYYYYYYY", "..."],
  "reserved_channels": 2
}'
```
```json
{
  "id": 3,
  "name": "July promo",
  "workflow_id": 7,
  "number_id": "num_1",
  "reserved_channels": 2,
  "status": "running",
  "created_at": "2026-07-19T10:00:00Z",
  "paused_at": null,
  "completed_at": null,
  "progress": {"total": 1000, "pending": 998, "calling": 2, "done": 0, "answered": 0, "unanswered": 0, "error": 0, "skipped": 0}
}
```

**Errors**: `400` if your account has no dedicated Number, `numbers` is
empty/over 5,000, or `reserved_channels` is outside `1..channel_limit`;
`404` if `workflow_id` doesn't resolve to a workflow you can use; `409` if
`reserved_channels` doesn't fit what's currently free (another running
blast already has some of your Number's capacity reserved).

### GET /v1/blasts — list your blasts

```bash
curl https://your-domain/v1/blasts -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
Same shape as the create response, newest first, `progress` always current.

### GET /v1/blasts/{id} — one blast's status/progress

Same shape as a single item from the list above.

### GET /v1/blasts/{id}/targets — per-number results

Query params: `status` (`pending`/`calling`/`done`), `limit` (default 100,
max 1000), `offset`.

```bash
curl "https://your-domain/v1/blasts/3/targets?status=done&limit=50" -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
```json
[
  {"id": 101, "to_number": "+8801XXXXXXXXX", "status": "done", "outcome": "answered", "call_id": "call_af38be6e319e2a9df2d1cc4f"},
  {"id": 102, "to_number": "+8801YYYYYYYYY", "status": "done", "outcome": "unanswered", "call_id": "call_3f15368c0550fe5690f4c2ee"}
]
```
`outcome` is `null` until `status` is `done` — `"answered"`, `"unanswered"`
(exhausted its retries with no answer), `"error"` (a real dial attempt
failed), or `"skipped"` (the blast was cancelled before this number was ever
dialed). `call_id` lets you cross-reference `GET /v1/calls/{id}` or the
`workflow_dtmf` webhook for what happened on that specific call.

### POST /v1/blasts/{id}/pause — stop dialing, keep the reservation-free promise you got

```bash
curl -X POST https://your-domain/v1/blasts/3/pause -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
`409` if the blast isn't currently `running`.

### POST /v1/blasts/{id}/resume — pick back up where it left off

```bash
curl -X POST https://your-domain/v1/blasts/3/resume -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
`409` if the blast isn't `paused`, or if `reserved_channels` no longer fits
(something else has since claimed that capacity on your Number).

### POST /v1/blasts/{id}/cancel — stop for good

```bash
curl -X POST https://your-domain/v1/blasts/3/cancel -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
`409` if the blast is already `completed`/`cancelled`. Not resumable —
create a new blast if you want to try again.

### GET /v1/blasts/capacity — what you have to work with

Lets you show a merchant "you have N channels, M already reserved, K free"
*before* they submit a create request.

```bash
curl https://your-domain/v1/blasts/capacity -H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID"
```
```json
{"channel_limit": 5, "reserved_channels": 2, "available": 3}
```
`400` if your account has no dedicated Number (same error as
`POST /v1/blasts` — the feature just isn't usable at all).

---

## Errors

Standard HTTP status codes, JSON body `{"detail": "human-readable message"}`.

| Status | Meaning |
|---|---|
| `400` | Bad request — e.g. an `agent_extension` that doesn't exist for your account |
| `401` | Invalid/revoked bearer token, or `X-User-Id` doesn't match the token's actual account |
| `403` | The feature you're calling isn't enabled for your account (call blast, IVR workflows/TTS, multi-extension, transfer) — see [Feature flags](#feature-flags--what-a-partner-created-user-can-do). Placing an ordinary call is never affected by this |
| `404` | Call, transfer, or workflow not found (or not yours) |
| `409` | Call isn't in a state that allows this action (e.g. transferring a call that isn't bridged yet, or no softphone line provisioned) |
| `422` | Missing/malformed request — including a missing `Authorization` or `X-User-Id` header |
| `402` | Insufficient balance — see [Balance](#balance). No call was placed |
| `429` | Over your token's concurrent-call limit |
| `502` | Origination failed at the telephony layer (bad number, provider rejected it, etc.) |
| `503` | No free channels on the number right now — retry shortly |

## Rate limits & concurrency

Each token has two independent caps, set when it's issued:
- **`max_concurrent_calls`** — how many calls can be simultaneously in
  flight on this token. Exceeding it returns `429` on the next `POST /v1/calls`.
- **`rate_limit_per_min`** — a rolling per-minute cap on call attempts,
  regardless of concurrency.

Both are per-token, not per-account — if you have multiple tokens, each has
its own limits. Ask your operator to adjust either if you're hitting them
legitimately (not as a workaround for a bug on your end).

---

## Operator-only setup (not for tenant developers)

These need admin credentials (`admin` / the platform's `ADMIN_PASSWORD`),
not a tenant bearer token — included here for completeness if you're
wearing both hats.

**Issue a token**:
```bash
curl -u admin:$ADMIN_PASSWORD -X POST https://your-domain/admin/api/tokens \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "max_concurrent_calls": 3, "rate_limit_per_min": 30}'
```
```json
{"token": "plt_live_...", "token_prefix": "plt_live_...", "token_id": 7, "user_id": 1}
```
Hand the developer both `token` and `user_id` — they need both for every
request (see [Getting a token](#getting-a-token)).

**Revoke a token**:
```bash
curl -u admin:$ADMIN_PASSWORD -X POST https://your-domain/admin/api/tokens/{token_id}/revoke
```

**Create a partner** (direct or reseller — see [Partner
API](#partner-api--provisioning-users-for-an-external-company)):
```bash
curl -u admin:$ADMIN_PASSWORD -X POST https://your-domain/admin/api/partners \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Reselling Co", "partner_type": "reseller", "webhook_url": "https://acme.example.com/webhooks/selx"}'
```
```json
{"api_key": "partner_live_...", "api_key_prefix": "partner_live_...", "partner_id": 3}
```
`partner_type` is `"direct"` or `"reseller"`. The `api_key` is shown exactly
once — store it securely and hand it to the partner.

**Revoke a partner**:
```bash
curl -u admin:$ADMIN_PASSWORD -X POST https://your-domain/admin/api/partners/{partner_id}/revoke
```

**Bulk-import numbers**:
```bash
curl -u admin:$ADMIN_PASSWORD -X POST https://your-domain/admin/api/numbers/bulk \
  -H "Content-Type: application/json" \
  -d '[{"id": "num_1", "e164": "+8801...", "provider_password": "...", "channel_limit": 2}]'
```

**Workflow CRUD**: `POST` / `GET` / `PUT` / `DELETE` on
`/admin/api/workflows` (and `/admin/api/workflows/{id}`) — same shape as the
[example above](#building-an-outbound-ivr-press-1-to-approve).

Everything else (creating Users by hand, provisioning softphone lines,
adding Extensions, assigning Numbers, viewing the admin's own webhook
secret) is done through the admin panel at `/admin` — see `README.md` for a
full tour. Programmatic User creation on behalf of an external company goes
through the [Partner API](#partner-api--provisioning-users-for-an-external-company)
instead.

**Toggle a User's features by hand**: open that User in the admin panel and
follow "Manage features →" on its detail page (`/admin/user-features/{id}`)
— a checkbox per feature, independent of the reseller enable-API above. Use
this to correct a reseller's billing state manually, or to turn a feature
off for an admin/direct-partner-created User that had everything on by
default.
