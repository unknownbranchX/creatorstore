# CreatorStore — Railway Web Service Environment Configuration Manifest
**Target Service:** Web (`web`)  
**Command:** `npm run build && npm run start`  
**Runtime:** Next.js (Node.js 20+)

This manifest specifies every environment variable required by the **CreatorStore Web Service** on Railway. It powers user authentication, storefront rendering, creator dashboard, checkout flows, webhook ingestion, and background cron API endpoints.

---

## 1. Environment Variable Inventory for Web Service

| Variable Name | Required | Secret | Provider / Source | Production Value Format | Railway Scope | Shared With |
|---|:---:|:---:|---|---|:---:|---|
| `NODE_ENV` | **Required** | No | Node.js / Railway | `production` | Build & Runtime | Worker, Cron |
| `PORT` | Optional | No | Railway | `3000` (or dynamic Railway `$PORT`) | Runtime | None |
| `NEXT_PUBLIC_APP_URL` | **Required** | No | CreatorStore Domain | `https://creatorstore.store` (no trailing slash) | Build & Runtime | Cron |
| `DATABASE_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Build & Runtime | Worker, Cron |
| `DIRECT_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` | Build & Runtime | Worker, Cron |
| `JWT_SECRET` | **Required** | **Secret** | Generated Cryptographic Secret | 64-char hex string (`openssl rand -hex 32`, min 32 chars) | Runtime | None |
| `COOKIE_SECURE` | Optional | No | Platform Configuration | `true` (defaults to true in production) | Runtime | None |
| `GOOGLE_CLIENT_ID` | **Required** (for Google Auth) | No | Google Cloud Console | `[client-id].apps.googleusercontent.com` | Runtime | None |
| `GOOGLE_CLIENT_SECRET` | **Required** (for Google Auth) | **Secret** | Google Cloud Console | `GOCSPX-[alphanumeric_secret]` | Runtime | None |
| `GOOGLE_REDIRECT_URI` | Optional | No | Platform Configuration | `https://creatorstore.store/api/auth/callback/google` | Runtime | None |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | No | Google Cloud Console | `[client-id].apps.googleusercontent.com` | Build & Runtime | None |
| `CORS_ORIGINS` | Optional | No | Platform Configuration | `https://creatorstore.store,https://*.creatorstore.store` (defaults to `*`) | Build & Runtime | None |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | No | Supabase Project Settings | `https://[project-ref].supabase.co` | Build & Runtime | None |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | No | Supabase API Credentials | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (Anon key) | Build & Runtime | None |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | **Secret** | Supabase API Credentials | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (Service role key) | Runtime | None |
| `RAZORPAY_KEY_ID` | **Required** | No | Razorpay Dashboard | `rzp_live_[14_chars]` | Runtime | Cron |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | **Required** | No | Razorpay Dashboard | `rzp_live_[14_chars]` (must match `RAZORPAY_KEY_ID`) | Build & Runtime | None |
| `RAZORPAY_KEY_SECRET` | **Required** | **Secret** | Razorpay Dashboard | 20–30 character alphanumeric live secret key | Runtime | Cron |
| `RAZORPAY_WEBHOOK_SECRET` | **Required** | **Secret** | Razorpay Webhook Settings | Secret configured in Razorpay Webhooks dashboard | Runtime | None |
| `RAZORPAY_CREATOR_PLAN_ID` | **Required** | No | Razorpay Subscriptions | `plan_[14_chars]` (Creator monthly INR plan) | Runtime | None |
| `RAZORPAY_PRO_PLAN_ID` | **Required** | No | Razorpay Subscriptions | `plan_[14_chars]` (Pro monthly INR plan) | Runtime | None |
| `RAZORPAY_CREATOR_ANNUAL_PLAN_ID` | Optional | No | Razorpay Subscriptions | `plan_[14_chars]` (Required if India annual Razorpay flow enabled) | Runtime | None |
| `RAZORPAY_PRO_ANNUAL_PLAN_ID` | Optional | No | Razorpay Subscriptions | `plan_[14_chars]` (Required if India annual Razorpay flow enabled) | Runtime | None |
| `DODO_PAYMENTS_ENVIRONMENT` | **Required** | No | Dodo Payments | `live_mode` (**CRITICAL**: defaults to test_mode if omitted!) | Runtime | Cron |
| `DODO_PAYMENTS_API_KEY` | **Required** | **Secret** | Dodo Payments Dashboard | `dodo_live_[alphanumeric_secret]` | Runtime | Cron |
| `DODO_PAYMENTS_WEBHOOK_KEY` | **Required** | **Secret** | Dodo Payments Webhooks | `whsec_[alphanumeric_secret]` | Runtime | None |
| `DODO_PRODUCT_CREATOR_INR_MONTHLY_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (has fallback ID in code) | Runtime | None |
| `DODO_PRODUCT_CREATOR_INR_ANNUAL_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (has fallback ID in code) | Runtime | None |
| `DODO_PRODUCT_PRO_INR_MONTHLY_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (has fallback ID in code) | Runtime | None |
| `DODO_PRODUCT_PRO_INR_ANNUAL_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (has fallback ID in code) | Runtime | None |
| `DODO_PRODUCT_CREATOR_MONTHLY_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (USD Creator monthly) | Runtime | None |
| `DODO_PRODUCT_CREATOR_ANNUAL_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (USD Creator annual) | Runtime | None |
| `DODO_PRODUCT_PRO_MONTHLY_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (USD Pro monthly) | Runtime | None |
| `DODO_PRODUCT_PRO_ANNUAL_ID` | Optional | No | Dodo Payments Products | `pdt_[20_chars]` (USD Pro annual) | Runtime | None |
| `RESEND_API_KEY` | **Required** | **Secret** | Resend API Settings | `re_[alphanumeric_key]` | Runtime | Cron |
| `EMAIL_FROM` | Optional | No | Resend Verified Domain | `CreatorStore <noreply@creatorstore.store>` | Runtime | Cron |
| `EMAIL_REPLY_TO` | Optional | No | Support Desk | `support@creatorstore.store` | Runtime | None |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Optional | No | Support Desk | `support@creatorstore.store` | Build & Runtime | None |
| `META_INSTAGRAM_APP_ID` | **Required** | No | Meta Developers Portal | 15–16 digit numeric ID (`123456789012345`) | Runtime | None |
| `META_INSTAGRAM_APP_SECRET` | **Required** | **Secret** | Meta Developers Portal | 32-character hex secret | Runtime | None |
| `META_INSTAGRAM_REDIRECT_URI` | Optional | No | Meta App OAuth Settings | `https://creatorstore.store/api/integrations/instagram/callback` | Runtime | None |
| `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | **Required** | **Secret** | Meta Webhooks Dashboard | Custom alphanumeric secret token | Runtime | None |
| `META_API_VERSION` | Optional | No | Meta Graph API | `v21.0` (defaults to `v21.0`) | Runtime | Worker |
| `CRON_SECRET` | **Required** | **Secret** | Generated Cryptographic Secret | 64-char hex string securing `/api/cron/*` | Runtime | Cron |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional | No | Google Analytics | `G-XXXXXXXXXX` | Build & Runtime | None |
| `NEXT_PUBLIC_GTM_ID` | Optional | No | Google Tag Manager | `GTM-XXXXXXX` | Build & Runtime | None |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Optional | No | Analytics Config | `true` or `false` | Build & Runtime | None |

---

## 2. Build-Time vs Runtime Scoping for Railway

Next.js inlines all `NEXT_PUBLIC_*` environment variables into client JavaScript bundles at **build time** (`next build`). If these variables are not present during Railway's build phase, client bundles permanently compile with `undefined`.

### Variables Required in Railway Build Phase:
- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `NEXT_PUBLIC_SUPPORT_EMAIL`
- `DATABASE_URL` (required for schema introspection during `prisma generate`)

### Runtime-Only Secrets:
- `JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_KEY`
- `RESEND_API_KEY`
- `META_INSTAGRAM_APP_SECRET`
- `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `CRON_SECRET`

---

## 3. Production Safety Directives

1. **Dodo Payments Live Mode:** Must explicitly configure `DODO_PAYMENTS_ENVIRONMENT=live_mode`. If omitted, the SDK defaults to `test_mode`.
2. **Key ID Matching:** `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` must be identical live keys (`rzp_live_...`). Mismatch triggers an initialization error in `lib/payments.js`.
3. **Storage Persistence:** `SUPABASE_SERVICE_ROLE_KEY` must be a valid Supabase service key. Placeholder or mock keys silently degrade Supabase Storage to an ephemeral in-memory map.
4. **JWT Security:** `JWT_SECRET` must be at least 32 characters long. Insecure default or development secrets trigger a fatal process exit on startup.
