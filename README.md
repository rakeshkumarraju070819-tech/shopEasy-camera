# CamShield – Camera Privacy Awareness & Security Monitoring Platform

A MERN project with two completely separate interfaces:

| | Customer storefront | Admin security console |
|---|---|---|
| Routes | `/`, `/store`, `/product/:id`, `/cart` | `/admin/login`, `/admin/dashboard`, `/admin/visitors`, `/admin/visitors/:id`, `/admin/ip-intelligence`, `/admin/consent`, `/admin/events`, `/admin/settings` |
| Look | White / navy / blue shopping site ("ShopEasy") | Dark navy + charcoal console with red/blue accents |
| Access | Public | JWT-protected, admin only |

Customers see ONLY a normal e-commerce website (ShopEasy) and never see admin links or camera testing UI. Admin code is split into separate JavaScript chunks that customers never download.

## Separation of Customer Storefront and Admin Security Dashboard

1. **Customer Website**: Public shopping pages (`/`, `/store`, `/product/:id`, `/cart`) provide full e-commerce shopping experience (catalog, product details, search, filters, cart, deals) with zero camera testing, prompts, or permissions.
2. **Camera Separation**: Ordinary customer shopping pages do not trigger or display camera permission notifications or camera test previews.
3. **Admin Security Dashboard**: Protected under `/admin/*` routes, requiring administrator credentials. Displays visitor session information, IP intelligence, consent records, and security audit events. No customer camera footage is recorded or displayed.

**Consent and permission are separate fields.** `consentDecision` is what the visitor chose in our notification. `cameraPermission` is what the browser reported. `cameraActive` is whether the preview is open right now. The API refuses to record a permission result unless consent was accepted.

**No video is ever recorded, stored or transmitted.** The stream only feeds a `<video>` element in the visitor's tab, and the backend has no field, endpoint or storage for footage.

## What is collected (and disclosed in the notification)
Whichever option the visitor picks, the server stores: their choice, IP address, approximate location (country/city/ISP/ASN, estimated from the IP), browser, OS, device type, and session start/end times. A session is created only **after** the visitor has seen this disclosure and chosen. Retention is controlled by `RETENTION_DAYS` and from **Admin → Settings**.

## Real vs simulated data
- On localhost, IPs are private, so the API returns a clearly labelled **simulated** result (RFC 5737 documentation addresses such as `203.0.113.x`).
- With `SEED_SAMPLE_DATA=true` (development only) ten **fictional** sample visitors are added, marked "Simulated" in the console.
- Public IPs are looked up on the server with IPinfo (if `IPINFO_TOKEN` is set) or ipapi.co's free endpoint. API keys never reach the browser. Locations are estimates and are labelled that way.

## Requirements
- Node.js 18 or newer
- A MongoDB Atlas connection string (optional for local trials – see below)

## Installation

```bash
# 1. Install everything (root + server + client)
npm run install:all

# 2. Configure the server
cp server/.env.example server/.env
#    then edit server/.env:
#      JWT_SECRET      – a long random string
#      ADMIN_EMAIL / ADMIN_PASSWORD – your admin login
#      MONGODB_URI     – your MongoDB Atlas URI (leave blank for a temporary in-memory store)

# 3. Run both servers
npm run dev
```

Or run them separately:

```bash
npm run server   # API on http://localhost:5000
npm run client   # Storefront + console on http://localhost:5173
```

Open `http://localhost:5173` for the store and `http://localhost:5173/admin/login` for the console. In development, Vite proxies `/api` to the Express server.

### MongoDB Atlas
1. Create a free cluster, a database user, and allow your IP under *Network Access*.
2. Copy the connection string into `MONGODB_URI`, for example `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/camshield`.
3. Restart the API. The log shows `[db] Connected to MongoDB`.

Without `MONGODB_URI` (development only) the API uses a temporary in-memory store, and **Admin → Settings** shows a warning. Production refuses to fall back to memory.

## npm scripts

| Command | What it does |
|---|---|
| `npm run install:all` | Installs root, server and client dependencies |
| `npm run dev` | Runs API and client together |
| `npm run server` / `npm run client` | Runs one side only |
| `npm run build` | Production build of the client (`client/dist`) |
| `npm test` | Server API tests (`cd client && npm test` for the client tests) |

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/visitors/session` | – | Create a session (after disclosure + choice). Returns `visitorId` and a secret `sessionToken` |
| `POST /api/visitors/consent` | session token | Save `accepted` / `declined` |
| `PATCH /api/visitors/:id/status` | session token | Report `cameraPermission`, `cameraActive`, `sessionStatus` |
| `POST /api/auth/login` | – (rate-limited) | Admin login → JWT |
| `GET /api/admin/dashboard/stats` | admin JWT | Dashboard statistics |
| `GET /api/admin/visitors` / `:id` | admin JWT | Visitor list (filters: `q`, `consent`, `status`) / details |
| `GET /api/admin/events` · `GET /api/admin/settings` | admin JWT | Audit trail · configuration |
| `DELETE /api/admin/visitors/:id` · `POST /api/admin/retention/purge` | admin JWT | Retention controls |

A visitor can only change **their own** session: the visitor endpoints require the secret token issued at session creation (stored hashed on the server).

## Security notes
- Passwords are hashed with bcrypt; sessions use JWT (`JWT_EXPIRES_IN`, default 8h). The admin token is kept in `sessionStorage`.
- Helmet, CORS limited to `CLIENT_ORIGIN`, request-size limit, and rate limits (global, visitor routes, and a strict login limit).
- Set `TRUST_PROXY=1` behind a reverse proxy so the real visitor IP is used.
- **Browsers only allow camera access on HTTPS or `localhost`.** Deploy over HTTPS.
- Forgot-password is informational only: the single admin account comes from `.env`, so change `ADMIN_PASSWORD` and restart.

## Customising the store
Edit `client/src/data/products.js`. Product art is generated from `icon` and `hue`; add `image: "https://…"` to any product to use a real photo (the generated art is the fallback). Prices use `formatPrice()` in the same file, so changing the currency is a one-line edit.

## Project structure
```
camshield/
  client/src/   components/  pages/  services/  hooks/  context/  data/  __tests__/
  server/       config/  models/  controllers/  routes/  middleware/  utils/  tests/  server.js
```
