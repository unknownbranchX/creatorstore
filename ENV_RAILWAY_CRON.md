# CreatorStore — Railway Cron & Cleanup Jobs Environment Configuration Manifest
**Target Service:** Scheduled Crons / Payment Reconciliation (`cron`)  
**Execution Models:**  
- **Model A (Recommended CLI Worker):** `npm run cron:expire-stale-payments` & `npm run cron:cleanup-abandoned-subscriptions`  
- **Model B (External Webhook Trigger):** HTTP POST to `https://creatorstore.store/api/cron/*` with `Authorization: Bearer $CRON_SECRET`

This manifest specifies the environment variables required for running automated background cleanup, abandoned Razorpay subscription reclamation, and stale pending checkout session reconciliation.

---

## 1. Environment Variable Inventory: Model A (Standalone CLI Runner)

Run on a dedicated Railway Cron / Scheduled Worker instance or via scheduled execution triggers.

| Variable Name | Required | Secret | Provider / Source | Production Value Format | Railway Scope | Shared With |
|---|:---:|:---:|---|---|:---:|---|
| `NODE_ENV` | **Required** | No | Node.js / Railway | `production` | Runtime | Web, Worker |
| `DATABASE_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Runtime | Web, Worker |
| `DIRECT_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` | Runtime | Web, Worker |
| `RAZORPAY_KEY_ID` | **Required** | No | Razorpay Dashboard | `rzp_live_[14_chars]` | Runtime | Web |
| `RAZORPAY_KEY_SECRET` | **Required** | **Secret** | Razorpay Dashboard | 20–30 character alphanumeric secret key | Runtime | Web |
| `DODO_PAYMENTS_ENVIRONMENT` | **Required** | No | Dodo Payments | `live_mode` | Runtime | Web |
| `DODO_PAYMENTS_API_KEY` | **Required** | **Secret** | Dodo Payments Dashboard | `dodo_live_[alphanumeric_secret]` | Runtime | Web |
| `RESEND_API_KEY` | Optional | **Secret** | Resend API Settings | `re_[alphanumeric_key]` (used for dunning/expiration notices) | Runtime | Web |
| `EMAIL_FROM` | Optional | No | Resend Verified Domain | `CreatorStore <noreply@creatorstore.store>` | Runtime | Web |
| `DODO_PENDING_PAYMENT_TTL_MINUTES` | Optional | No | Cleanup Configuration | `30` (default: `30`) | Runtime | None |
| `RAZORPAY_PENDING_SUBSCRIPTION_TIMEOUT_MINUTES` | Optional | No | Cleanup Configuration | `30` (default: `30`) | Runtime | None |
| `RAZORPAY_SUBSCRIPTION_GRACE_PERIOD_DAYS` | Optional | No | Cleanup Configuration | `3` (default: `3`) | Runtime | None |
| `NEXT_PUBLIC_APP_URL` | Optional | No | CreatorStore Domain | `https://creatorstore.store` (used for billing recovery links in emails) | Runtime | Web |

---

## 2. Environment Variable Inventory: Model B (HTTP Cron Webhook Trigger)

If using Railway Cron Triggers or an external scheduler (e.g. GitHub Actions, Upstash QStash) calling the Next.js API endpoints (`/api/cron/expire-stale-payments`, `/api/cron/cleanup-incomplete-subscriptions`, `/api/cron/cleanup-otps`):

| Variable Name | Required | Secret | Provider / Source | Production Value Format | Railway Scope | Shared With |
|---|:---:|:---:|---|---|:---:|---|
| `CRON_SECRET` | **Required** | **Secret** | Cryptographic Random | 64-character hex string (`openssl rand -hex 32`) | Runtime | Web |
| `NEXT_PUBLIC_APP_URL` | **Required** | No | CreatorStore Domain | `https://creatorstore.store` | Runtime | Web |

**HTTP Invocation Example:**
```bash
curl -X POST https://creatorstore.store/api/cron/expire-stale-payments \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

---

## 3. Concurrency Safety

The standalone cleanup scripts utilize PostgreSQL distributed advisory locks (`pg_try_advisory_lock` via `withPaymentLock` in `lib/payment-lifecycle.js`). Multiple concurrent runners or overlapped cron intervals will gracefully yield without duplicate subscription cancellations or database contention.
