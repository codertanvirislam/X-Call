# Testing

## Automated tests (Vitest)

Run the full suite:

```bash
yarn test          # run once
yarn test:watch    # re-run on file change
```

These are fast **unit tests** with no database or network — they cover the
security-critical and business-logic helpers:

| File | Covers |
|------|--------|
| `src/lib/phone.test.ts` | BD phone normalization (every signup/login gate) + masking |
| `src/lib/crypto.test.ts` | Token encryption round-trip + tamper detection, OTP hashing, `randomOtp` |
| `src/lib/auth.test.ts` | Password rules, bcrypt hash/verify, salting |
| `src/lib/session.test.ts` | JWT session round-trip for ADMIN & STORE, rejects tampered / storeId-less tokens |
| `src/lib/calling.test.ts` | Server-side balance fetch + the "no minutes → block" (402) enforcement guard |

> Tests get dummy env values from `vitest.config.ts` (`DATABASE_URL`, secrets).
> Nothing connects to the real database.

## Manual end-to-end checklist

Full-flow tests would need a throwaway database (the app uses a live managed
MySQL), so walk these by hand with `SMS_DEV_MODE="true"` and `PAYMENT_MODE="mock"`.
The OTP prints in the `yarn dev` terminal as `[SMS_DEV] ... X-Call OTP: NNNNNN`.

### Store owner
1. `/signup` with a **fresh** phone → OTP → set password → lands on `/dashboard`.
2. `/kyc` → submit NID → status PENDING.
3. Buying before KYC approval is **blocked** ("Complete and get KYC approved…").

### Admin
4. Log in with `ADMIN_PHONE` / `ADMIN_PASSWORD` → `/admin`.
5. `/admin/kyc` → approve the submission.
6. `/admin/stores` → the store shows KYC APPROVED, owner phone, 0 employees.

### Purchase + provisioning
7. Owner `/packages` → Buy → subscription becomes ACTIVE, dashboard shows
   "Calling account: Ready to call" once the backend token arrives.
8. The raw bearer token is **never** shown in the browser (only Ready/Setting up).

### Employees
9. Owner `/team` → adding an employee is **blocked** until a subscription is active.
10. With an active subscription, owner adds an employee phone → appears as
    "Employee / Pending sign-in".
11. Employee opens the app with that phone → `/signup` → OTP → set password →
    lands in the **same store's** dashboard (shares KYC + subscription).
12. Owner can Remove an employee; the owner cannot be removed.

### Edge cases worth checking
- The admin phone cannot also sign up as a store (login resolves admin first).
- A disabled/removed employee can no longer log in.
- Retrying a failed provision does **not** double-credit minutes
  (guarded by `Order.minutesCreditedAt`).
