# Matajer People Hub — Frontend

Responsive React frontend for the Matajer Employee Management Platform. It is connected to the sibling Express/PostgreSQL backend: authentication, dashboards, directory search, compensation, leave balances, requests, documents, notifications, and audit data all come from the API.

## Demo accounts

All seeded accounts use `Passw0rd!23`.

| Role | Email | Scope |
|---|---|---|
| Admin | `admin@matajer.demo` | All legal entities and management actions |
| Scoped HR | `hr.ksa@matajer.demo` | Saudi entity only |
| Manager | `manager@matajer.demo` | Direct reports; no compensation access |
| Employee | `employee@matajer.demo` | Self-service data only |

The login page includes one-click fillers for the main admin and employee demos.

## Run the full stack locally

Requirements: Node 20+ and Docker.

Start the backend first from `../Employee Management Platform BackEnd`:

```bash
npm install
cp .env.example .env
npm run db:up
npx prisma migrate deploy
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000`.

Then start this frontend:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` or `http://127.0.0.1:5173`. Vite proxies `/api` to port 4000 by default, so no frontend environment variable is required for local development.

For a production build:

```bash
npm run build
npm run preview
```

For a split deployment, set `VITE_API_URL` to the absolute API base URL, including `/api/v1`, and add the frontend origin to the backend `CORS_ORIGINS` allowlist. `VITE_PROXY_TARGET` can override the local proxy target.

## Product surface

### Admin and HR

- Live organization dashboard, alerts, legal-entity breakdowns, and audit activity
- Server-side employee search, filters, sorting, and pagination
- Employee creation, editing, status changes, and employment timelines
- Permission-gated compensation history and salary changes
- Authorized employee leave balances and document records
- Unified leave, document, and profile-change approval inbox
- Database-backed notification inbox with read state and deep links

### Employee

- Self-only profile, compensation, employment, and legal-employer views
- Entity-specific leave types, balances, holiday calendar, and live working-day preview
- Leave requests with backend validation and immediate pending-balance holds
- Document and profile-change requests with request history
- Account password changes with session revocation

## Architecture

The frontend is a Vite + React single-page application.

```text
src/
├── api/
│   ├── client.js       token storage, refresh rotation, API error handling
│   └── endpoints.js    endpoint functions
├── components/ui.jsx   shared modal, form, status, and loading primitives
├── pages/              admin and employee feature screens
├── App.jsx             authentication, role shell, notifications, security
└── styles.css          responsive design system and component styles
```

Access and refresh tokens are stored locally so a browser refresh preserves the session. Refresh calls are single-flight because the backend rotates refresh tokens; an unrecoverable 401 clears the session and returns to login. Authorization and sensitive-field filtering are enforced by the backend, not by hidden frontend controls.

## Backend-backed workflows

- Login, automatic token refresh, logout, forced password change, and account security
- Admin and employee dashboards
- Employee directory and detailed employee records
- Compensation history behind the HR/self permission gate
- Leave preview, submission, balance hold, approval, rejection, and cancellation
- Document requests and issued employment records
- Profile-change requests that apply approved values to the employee record
- Notifications with unread count, individual read state, and mark-all-read
- Legal entities, alerts, and immutable audit history

The seeded database contains 3 legal entities, 18 employee records, 40 requests, salary histories, leave policies and balances, documents, notifications, and audit entries. The active directory excludes the offboarded record by default, so it initially shows 17 people.

## Verification

The production frontend build passes with `npm run build`, and 34 unit tests cover the adapters, the HTTP client and the formatters. The backend passes TypeScript checking and its 118-test integration suite against a separate test database.

UI behaviour is covered by the committed Playwright acceptance suite in [`e2e/`](../e2e) — 38 cases against the real frontend, the real API and a real PostgreSQL database, at 1440×900 and 390×844:

```bash
cd e2e && npm install && npx playwright install chromium && npm test
```

That suite covers:

- Admin and employee login and role-specific navigation
- Live dashboard and server-side directory search
- Employee compensation, leave-balance, and document panels
- Request approval writing through to PostgreSQL
- Employee leave preview, submission, and balance hold
- Notification read state and navigation to the request inbox
- Password validation without mutating the seeded demo password
- Desktop and mobile layouts

See the backend [`README.md`](../Employee%20Management%20Platform%20BackEnd/README.md) for the data model, permission matrix, API reference, test coverage, and deployment instructions.

## Known limitations

- Seeded document URLs use `.demo` placeholders; there is no object-storage upload yet.
- Approved document requests create a document record but do not render a real PDF.
- Public holidays are illustrative seeded dates.
- Notifications are in-app only; there is no email or Slack delivery.

## AI usage and cost log

The project-wide log is [`AI-USAGE-LOG.md`](../AI-USAGE-LOG.md) at the repository root — that is the single source of truth for tools used and spend.
