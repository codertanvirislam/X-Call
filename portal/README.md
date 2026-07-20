# X-Call Portal

Simple customer + admin portal for selling call-center API packages on top of the selx-sip backend.

## What it does

**User side**
1. Signup with phone OTP (once)
2. Set password → later login with phone + password
3. Submit KYC (NID number + front/back image or PDF → S3)
4. After admin approves KYC, buy a package
5. Pay (mock mode for dev, webhook mode for real gateway)
6. On real payment success only → create/fund selx user + enable features
7. Dashboard shows API token, user id, package expiry, live balance

**Admin side**
1. Review KYC approve/reject
2. Search users
3. Lookup live balance + usage from selx backend using the user token
4. View orders/payments

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- S3 for KYC files
- Selx Partner API for provisioning

## Setup

```bash
cd portal
cp .env.example .env
# fill DATABASE_URL and other secrets
npm install
npm run db:setup
npm run dev
```

Open http://localhost:3000

### Required env

See `.env.example` for the full list.

Minimum to start local UI:
- `DATABASE_URL`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_PHONE` / `ADMIN_PASSWORD` (seed admin)
- `SMS_DEV_MODE=true` (OTP printed in server console)
- `PAYMENT_MODE=mock`

For real KYC uploads:
- S3 variables

For real provisioning after payment:
- `SELX_BASE_URL`
- `SELX_PARTNER_API_KEY`
- `SELX_PARTNER_WEBHOOK_SECRET`
- `SELX_DEFAULT_BRIDGE_NUMBER`

Set partner webhook URL in selx admin to:
`https://YOUR_DOMAIN/api/webhooks/selx`

## Payment modes

### mock (development)
Buying a package immediately completes payment and provisions.

### webhook (production generic)
Your payment backend should POST:

`POST /api/payments/webhook`  
Header: `X-Payment-Secret: <PAYMENT_WEBHOOK_SECRET>`

```json
{
  "orderId": "...",
  "status": "SUCCESS",
  "provider": "bkash",
  "providerPaymentId": "trx_123"
}
```

Only `SUCCESS` triggers selx provisioning (`is_paid=true`).

## Package end rules

- Backend enforces minutes (`402` when balance is 0)
- Portal stores package `expiresAt`
- Active subscriptions past expiry are marked `EXPIRED` on dashboard/admin load

## Scripts

```bash
npm run dev
npm run db:push
npm run db:seed
npm run build
```
