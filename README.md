# Invoice Brecx

Invoicing app — create invoices for clients, track them from draft to paid,
and see what's outstanding at a glance.

A TypeScript monorepo (pnpm workspaces + Turborepo), same stack as Wholesale HQ:

- **`apps/api`** — Node 20 + Fastify 4, PostgreSQL via `pg`, cookie-based
  sessions, Zod validation, pino logging. Schema bootstraps itself on boot
  (idempotent `CREATE IF NOT EXISTS`).
- **`apps/web`** — React 18 SPA, Vite 5, react-router-dom 6, TanStack Query 5.
  Plain CSS: shared `src/styles/styles.css` (the Brecx design system).
- **`packages/shared`** — `@inv/shared`: Zod schemas, types and constants used
  by both apps.
- **`render.yaml`** — Render Blueprint (API web service + static web site).
- **Database** — PostgreSQL (Neon in production).

## Local development

```bash
# 1. Install
corepack enable
pnpm install

# 2. API env
cp apps/api/.env.example apps/api/.env
# Fill DATABASE_URL, APP_ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD

# 3. Run both dev servers
pnpm dev
#  → API  http://localhost:4000
#  → Web  http://localhost:5173  (Vite proxies /api to the API)
```

On first boot with an empty database the API creates the schema and seeds the
admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` — sign in with those.

## Encryption key

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Project layout

```
Invoice-Brecx/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── auth/        # sessions + fastify plugin
│   │       ├── lib/         # crypto, users
│   │       ├── routes/      # one file per resource (auth, me, clients, invoices)
│   │       ├── db.ts env.ts logger.ts
│   │       └── index.ts     # Fastify entrypoint
│   └── web/
│       └── src/
│           ├── components/  # AppLayout, Toast, Logo
│           ├── lib/         # api client, auth, format, invoices
│           ├── pages/       # one folder per route
│           └── styles/      # styles.css (shared Brecx design system)
├── packages/shared/         # @inv/shared (Zod schemas/types/constants)
├── render.yaml
├── turbo.json
└── pnpm-workspace.yaml
```

## What's included (starter)

- Email + password auth with signed HttpOnly session cookies (30 days),
  admin bootstrap from env, profile settings (name / password).
- Clients CRUD.
- Invoices: draft → sent → paid / overdue / void lifecycle, line items,
  tax rate, auto-numbering (`INV-00042`), totals snapshotted at write time.
- Dashboard with outstanding / overdue / paid stats.

## Next steps (not included yet)

- PDF rendering / email sending of invoices
- Automatic overdue marking (cron against `due_date`)
- Team members & roles UI (the API already has `requireAdmin`)
# inventory-brecx
