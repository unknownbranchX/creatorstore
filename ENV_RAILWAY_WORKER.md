# CreatorStore — Railway Auto-DM Worker Environment Configuration Manifest
**Target Service:** Auto-DM Worker (`worker`)  
**Command:** `npm run worker` (runs `node scripts/auto-dm-worker.js`)  
**Runtime:** Node.js 20+

This manifest specifies the environment variables required for the **CreatorStore Auto-DM Background Worker** on Railway. The worker polls the PostgreSQL `AutoDmQueueJob` table, verifies creator plan entitlements, enforces rolling-window rate limits, and dispatches direct messages to Meta Graph API using the creator's stored user OAuth access token.

---

## 1. Environment Variable Inventory for Auto-DM Worker

| Variable Name | Required | Secret | Provider / Source | Production Value Format | Railway Scope | Shared With |
|---|:---:|:---:|---|---|:---:|---|
| `NODE_ENV` | **Required** | No | Node.js / Railway | `production` | Runtime | Web, Cron |
| `DATABASE_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | Runtime | Web, Cron |
| `DIRECT_URL` | **Required** | **Secret** | Supabase PostgreSQL | `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` | Runtime | Web, Cron |
| `WORKER_ID` | Optional | No | Railway Deployment | `worker-auto-dm-01` (defaults to `worker-${pid}-${timestamp}`) | Runtime | None |
| `AUTO_DM_POLL_INTERVAL_MS` | Optional | No | Worker Configuration | `1500` (polling interval when queue empty; default: `1500`) | Runtime | None |
| `AUTO_DM_BATCH_SIZE` | Optional | No | Worker Configuration | `5` (jobs claimed per transaction; default: `5`) | Runtime | None |
| `AUTO_DM_SIMULATION_MODE` | **Required** | No | Safety Mode | `false` (**CRITICAL**: Must be false or omitted in production) | Runtime | None |
| `AUTO_DM_PROCESS_ALL` | Optional | No | Safety Mode | `false` (defaults to `false`) | Runtime | None |
| `META_API_VERSION` | Optional | No | Meta Graph API | `v21.0` (defaults to `v21.0`) | Runtime | Web |

---

## 2. Least Privilege Verification

The Auto-DM Worker operates under strict **Least Privilege** isolation:
- **No Meta App Credentials Required:** The worker does **not** read `META_INSTAGRAM_APP_SECRET`, `META_INSTAGRAM_APP_ID`, or `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. OAuth handshakes and webhook verification are handled exclusively by the Web service. Dispatches to `https://graph.instagram.com/v21.0/{ig_user_id}/messages` use the creator's OAuth access token retrieved from the encrypted database.
- **No Payment Credentials Required:** Zero access to Razorpay or Dodo Payments keys.
- **No Authentication Secrets Required:** Zero access to `JWT_SECRET` or Supabase service keys.
- **Direct Database Access:** Only requires `DATABASE_URL` and `DIRECT_URL` to claim jobs via PostgreSQL `FOR UPDATE SKIP LOCKED`.

---

## 3. Production Safety Directives

1. **Simulation Guard:** `AUTO_DM_SIMULATION_MODE` must be `false` (or unset). `RealMetaApiClient` in `lib/meta-api-client.js` throws a fatal safety violation if a simulated job (`sim_*`) is ever directed to the live Meta API.
2. **Clean Shutdown:** The worker listens for `SIGTERM` and `SIGINT`, waiting up to 15 seconds for in-flight DM dispatches to finalize before exiting cleanly during Railway deploys.
