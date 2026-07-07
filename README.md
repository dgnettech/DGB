# DGB — Dunne Group Bank

Private internal banking and loan-management platform for **DGB — Dunne Group Bank**. DGB is designed for a family-and-friends financial pool where members contribute into a shared fund, high-interest debts can be settled, and lower-interest internal repayment plans are administered transparently.

> DGB is not a public bank. Before real-money use, get advice on legal structure, credit-provider registration, written member agreements, POPIA compliance, accounting records, tax treatment and banking controls.

## MVP scope

This repository currently includes the Phase 1/2 foundation:

- Modern private-banking style dashboard UI.
- Admin portal overview for member accounts, fund totals, loans, arrears, documents and audit trail.
- Member portal preview for balances, repayment schedules, loan actions, statements and notifications.
- Ledger-first financial model: balances are calculated from transactions, not manually typed.
- Simple-interest and reducing-balance repayment schedule calculations.
- Supabase PostgreSQL schema migration with RLS policies, immutable transaction protection, deletion guards, audit triggers and seed loan products.

## Routes

- `/` — DGB MVP dashboard
- `/login` — Supabase Auth login for admins and members
- `/register` — first-admin bootstrap and member login registration
- `/admin` — live admin portal for member/wallet creation, contributions, loan requests and ledger review
- `/member` — live member portal for balances, loan requests, schedules, documents and profile-change requests
- `/robots.txt` — blocks search indexing
- `/sitemap.xml` — private-app placeholder sitemap

## Tech stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase PostgreSQL/Auth/Storage-ready schema
- Supabase Row Level Security
- Vercel-ready deployment

## Local setup

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

Create `.env.local` from `.env.example` and set the public Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Use `SUPABASE_SECRET_KEY` only for server-side maintenance/bootstrap work. Never expose it as `NEXT_PUBLIC_*` and never commit real secret values.

## Validation and build

```bash
npm run lint
npm run typecheck
npm run build
```

## Supabase setup

Create a Supabase project and apply:

```text
supabase/migrations/202607070001_dgb_mvp_schema.sql
supabase/migrations/202607070002_dgb_live_operations.sql
supabase/migrations/202607070003_dgb_bootstrap_loans.sql
```

The migration creates the MVP tables:

- `users`
- `members`
- `accounts`
- `loan_products`
- `loan_requests`
- `profile_change_requests`
- `loans`
- `repayment_schedules`
- `transactions`
- `contributions`
- `repayments`
- `documents`
- `notifications`
- `audit_logs`
- `settings`

Additional live-operation helpers:

- Private Supabase Storage bucket: `member-documents`
- RPC: `create_member_with_account(...)`
- RPC: `capture_contribution(...)`
- Auth trigger: first registered user becomes `super_admin`; later users default to `member`
- RPC: `bootstrap_status()`
- RPC: `link_member_to_user(...)`
- RPC: `set_user_role(...)`
- RPC: `approve_loan_request(...)`
- RPC: `capture_repayment(...)`

Security foundations included:

- Supabase Auth user mapping through `public.users`.
- Roles: `super_admin`, `finance_admin`, `viewer`, `member`.
- RLS policies so members can only see their own data.
- Admin-only financial posting.
- Member loan requests forced to `pending` on insert.
- Member profile change requests captured for admin approval before sensitive details are updated.
- Member document uploads limited to their own member/loan records.
- Transaction rows protected from update/delete; corrections must be reversing entries.
- Deletion guards on member and financial records.
- Audit triggers for inserts/updates/deletes across operational tables.
- RLS-safe `member_account_balances` view.

## Next build phase

The live Supabase Auth shell, first-admin bootstrap, admin dashboard, member dashboard, document upload path, member linking, contribution capture, loan approval and repayment capture are now in place. The next implementation pass should add:

1. Signed document download links, PDF statements and agreements.
2. Email notifications for approvals, repayment reminders and overdue alerts.
3. CSV/XLSX exports and backup tooling.
4. Reversal workflow for correcting posted ledger entries.

## Compliance reminder

The dashboard intentionally includes a non-blocking compliance section. It should remain visible until the owner has confirmed the correct legal, accounting, tax, POPIA and credit-provider controls for the intended real-money use case.
