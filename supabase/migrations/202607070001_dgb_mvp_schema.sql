-- DGB — Dunne Group Bank MVP schema
-- Private internal fund-management platform with ledger-first balances and RLS.

create extension if not exists pgcrypto;

create type public.dgb_role as enum ('super_admin', 'finance_admin', 'viewer', 'member');
create type public.loan_interest_method as enum ('simple', 'reducing_balance');
create type public.loan_status as enum ('pending', 'approved', 'active', 'closed', 'rejected', 'overdue');
create type public.transaction_kind as enum ('contribution', 'withdrawal', 'loan_disbursement', 'repayment', 'fee', 'interest', 'penalty', 'reversal');
create type public.transaction_direction as enum ('credit', 'debit');

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type public.document_kind as enum ('id_document', 'proof_of_loan', 'settlement_letter', 'signed_agreement', 'proof_of_payment', 'statement', 'other');
  end if;
end;
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  role public.dgb_role not null default 'member',
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete restrict,
  member_number text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  id_passport_number text,
  next_of_kin_name text,
  next_of_kin_phone text,
  banking_details jsonb not null default '{}'::jsonb,
  employment_income_notes text,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  account_number text not null unique,
  name text not null default 'DGB Wallet',
  currency char(3) not null default 'ZAR',
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now()
);

create table public.loan_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  annual_interest_rate numeric(8,4) not null check (annual_interest_rate >= 0),
  interest_method public.loan_interest_method not null,
  max_term_months integer not null check (max_term_months > 0),
  admin_fee_cents integer not null default 0 check (admin_fee_cents >= 0),
  penalty_rate numeric(8,4) not null default 0 check (penalty_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.loan_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  loan_product_id uuid references public.loan_products(id) on delete restrict,
  requested_amount_cents integer not null check (requested_amount_cents > 0),
  requested_term_months integer not null check (requested_term_months > 0),
  purpose text not null,
  external_lender text,
  external_settlement_reference text,
  status public.loan_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text
);

create table public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  requested_changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  loan_request_id uuid references public.loan_requests(id) on delete restrict,
  loan_product_id uuid not null references public.loan_products(id) on delete restrict,
  principal_cents integer not null check (principal_cents > 0),
  annual_interest_rate numeric(8,4) not null check (annual_interest_rate >= 0),
  interest_method public.loan_interest_method not null,
  term_months integer not null check (term_months > 0),
  admin_fee_cents integer not null default 0 check (admin_fee_cents >= 0),
  external_settlement_details jsonb not null default '{}'::jsonb,
  status public.loan_status not null default 'active',
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  start_date date not null,
  created_at timestamptz not null default now()
);

create table public.repayment_schedules (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_cents integer not null default 0 check (principal_cents >= 0),
  interest_cents integer not null default 0 check (interest_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  penalty_cents integer not null default 0 check (penalty_cents >= 0),
  amount_due_cents integer generated always as (principal_cents + interest_cents + fee_cents + penalty_cents) stored,
  paid_cents integer not null default 0 check (paid_cents >= 0),
  status text not null default 'due' check (status in ('due', 'paid', 'part_paid', 'overdue', 'waived')),
  unique (loan_id, installment_number)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  schedule_id uuid references public.repayment_schedules(id) on delete restrict,
  kind public.transaction_kind not null,
  direction public.transaction_direction not null,
  amount_cents integer not null check (amount_cents > 0),
  reference text not null,
  memo text,
  reversal_of uuid references public.transactions(id) on delete restrict,
  captured_by uuid references public.users(id) on delete restrict,
  captured_at timestamptz not null default now()
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  contribution_date date not null,
  payment_reference text not null
);

create table public.repayments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  schedule_id uuid references public.repayment_schedules(id) on delete restrict,
  repayment_date date not null,
  payment_reference text not null
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  kind public.document_kind not null,
  storage_path text not null unique,
  file_name text not null,
  uploaded_by uuid references public.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete restrict,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create index members_user_id_idx on public.members(user_id);
create index accounts_member_id_idx on public.accounts(member_id);
create index loan_requests_member_id_idx on public.loan_requests(member_id);
create index profile_change_requests_member_id_idx on public.profile_change_requests(member_id);
create index loans_member_id_idx on public.loans(member_id);
create index repayment_schedules_loan_due_idx on public.repayment_schedules(loan_id, due_date, status);
create index transactions_member_id_idx on public.transactions(member_id);
create index transactions_account_id_idx on public.transactions(account_id);
create index transactions_loan_id_idx on public.transactions(loan_id);
create index documents_member_id_idx on public.documents(member_id);
create index documents_loan_id_idx on public.documents(loan_id);
create index notifications_user_unread_idx on public.notifications(user_id, read_at);

create or replace view public.member_account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.member_id,
  coalesce(sum(case when t.direction = 'credit' then t.amount_cents else -t.amount_cents end), 0)::bigint as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.member_id;

create or replace function public.current_user_role()
returns public.dgb_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'finance_admin'), false)
$$;

create or replace function public.prevent_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Financial transactions are immutable. Create a reversing transaction instead.';
end;
$$;

create trigger transactions_no_update before update on public.transactions
for each row execute function public.prevent_transaction_mutation();

create trigger transactions_no_delete before delete on public.transactions
for each row execute function public.prevent_transaction_mutation();

create or replace function public.prevent_financial_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Financial and member records are protected from deletion. Close, reverse, or deactivate the record instead.';
end;
$$;

create trigger members_no_delete before delete on public.members
for each row execute function public.prevent_financial_delete();

create trigger accounts_no_delete before delete on public.accounts
for each row execute function public.prevent_financial_delete();

create trigger loans_no_delete before delete on public.loans
for each row execute function public.prevent_financial_delete();

create trigger repayment_schedules_no_delete before delete on public.repayment_schedules
for each row execute function public.prevent_financial_delete();

create trigger profile_change_requests_no_delete before delete on public.profile_change_requests
for each row execute function public.prevent_financial_delete();

create trigger contributions_no_delete before delete on public.contributions
for each row execute function public.prevent_financial_delete();

create trigger repayments_no_delete before delete on public.repayments
for each row execute function public.prevent_financial_delete();

create trigger documents_no_delete before delete on public.documents
for each row execute function public.prevent_financial_delete();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  row_id uuid;
begin
  if TG_OP = 'DELETE' then
    payload := to_jsonb(old);
    if payload ? 'id' then
      row_id := (payload ->> 'id')::uuid;
    end if;

    insert into public.audit_logs (actor_id, action, entity_table, entity_id, before_data)
    values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, row_id, payload);
    return old;
  end if;

  payload := to_jsonb(new);
  if payload ? 'id' then
    row_id := (payload ->> 'id')::uuid;
  end if;

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, before_data, after_data)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, row_id, case when TG_OP = 'UPDATE' then to_jsonb(old) else null end, payload);

  return new;
end;
$$;

create trigger users_audit after insert or update or delete on public.users
for each row execute function public.write_audit_log();

create trigger members_audit after insert or update or delete on public.members
for each row execute function public.write_audit_log();

create trigger accounts_audit after insert or update or delete on public.accounts
for each row execute function public.write_audit_log();

create trigger loan_products_audit after insert or update or delete on public.loan_products
for each row execute function public.write_audit_log();

create trigger loan_requests_audit after insert or update or delete on public.loan_requests
for each row execute function public.write_audit_log();

create trigger profile_change_requests_audit after insert or update or delete on public.profile_change_requests
for each row execute function public.write_audit_log();

create trigger loans_audit after insert or update or delete on public.loans
for each row execute function public.write_audit_log();

create trigger repayment_schedules_audit after insert or update or delete on public.repayment_schedules
for each row execute function public.write_audit_log();

create trigger transactions_audit after insert on public.transactions
for each row execute function public.write_audit_log();

create trigger contributions_audit after insert or update or delete on public.contributions
for each row execute function public.write_audit_log();

create trigger repayments_audit after insert or update or delete on public.repayments
for each row execute function public.write_audit_log();

create trigger documents_audit after insert or update or delete on public.documents
for each row execute function public.write_audit_log();

create trigger notifications_audit after insert or update or delete on public.notifications
for each row execute function public.write_audit_log();

create trigger settings_audit after insert or update or delete on public.settings
for each row execute function public.write_audit_log();

alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.accounts enable row level security;
alter table public.loan_products enable row level security;
alter table public.loan_requests enable row level security;
alter table public.profile_change_requests enable row level security;
alter table public.loans enable row level security;
alter table public.repayment_schedules enable row level security;
alter table public.transactions enable row level security;
alter table public.contributions enable row level security;
alter table public.repayments enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

create policy "users_self_or_admin_read" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "admins_manage_users" on public.users for all using (public.is_admin()) with check (public.is_admin());

create policy "members_self_or_admin_read" on public.members for select using (user_id = auth.uid() or public.is_admin());
create policy "admins_manage_members" on public.members for all using (public.is_admin()) with check (public.is_admin());

create policy "accounts_self_or_admin_read" on public.accounts for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "admins_manage_accounts" on public.accounts for all using (public.is_admin()) with check (public.is_admin());

create policy "products_read_authenticated" on public.loan_products for select using (auth.uid() is not null);
create policy "admins_manage_products" on public.loan_products for all using (public.is_admin()) with check (public.is_admin());

create policy "loan_requests_member_or_admin_read" on public.loan_requests for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "members_create_own_pending_loan_requests" on public.loan_requests for insert with check (
  member_id in (select id from public.members where user_id = auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_notes is null
);
create policy "admins_manage_loan_requests" on public.loan_requests for all using (public.is_admin()) with check (public.is_admin());

create policy "profile_changes_member_or_admin_read" on public.profile_change_requests for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "members_create_own_pending_profile_changes" on public.profile_change_requests for insert with check (
  member_id in (select id from public.members where user_id = auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_notes is null
);
create policy "admins_manage_profile_changes" on public.profile_change_requests for all using (public.is_admin()) with check (public.is_admin());

create policy "loans_member_or_admin_read" on public.loans for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "admins_manage_loans" on public.loans for all using (public.is_admin()) with check (public.is_admin());

create policy "schedules_member_or_admin_read" on public.repayment_schedules for select using (public.is_admin() or loan_id in (select l.id from public.loans l join public.members m on m.id = l.member_id where m.user_id = auth.uid()));
create policy "admins_manage_schedules" on public.repayment_schedules for all using (public.is_admin()) with check (public.is_admin());

create policy "transactions_member_or_admin_read" on public.transactions for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "admins_insert_transactions" on public.transactions for insert with check (public.is_admin());

create policy "contributions_member_or_admin_read" on public.contributions for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "admins_manage_contributions" on public.contributions for all using (public.is_admin()) with check (public.is_admin());

create policy "repayments_member_or_admin_read" on public.repayments for select using (public.is_admin() or loan_id in (select l.id from public.loans l join public.members m on m.id = l.member_id where m.user_id = auth.uid()));
create policy "admins_manage_repayments" on public.repayments for all using (public.is_admin()) with check (public.is_admin());

create policy "documents_member_or_admin_read" on public.documents for select using (public.is_admin() or member_id in (select id from public.members where user_id = auth.uid()));
create policy "documents_member_upload_own" on public.documents for insert with check (
  public.is_admin()
  or (
    uploaded_by = auth.uid()
    and member_id in (select id from public.members where user_id = auth.uid())
    and (
      loan_id is null
      or loan_id in (select id from public.loans where loans.member_id = documents.member_id)
    )
  )
);
create policy "admins_manage_documents" on public.documents for all using (public.is_admin()) with check (public.is_admin());

create policy "notifications_self_or_admin_read" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "admins_manage_notifications" on public.notifications for all using (public.is_admin()) with check (public.is_admin());

create policy "audit_admin_read" on public.audit_logs for select using (public.is_admin() or public.current_user_role() = 'viewer');
create policy "audit_admin_insert" on public.audit_logs for insert with check (public.is_admin());

create policy "settings_admin_read" on public.settings for select using (public.is_admin() or public.current_user_role() = 'viewer');
create policy "settings_admin_manage" on public.settings for all using (public.is_admin()) with check (public.is_admin());

insert into public.loan_products (name, annual_interest_rate, interest_method, max_term_months, admin_fee_cents, penalty_rate)
values
  ('Settlement Assist', 12, 'reducing_balance', 24, 25000, 2),
  ('Short Bridge', 8, 'simple', 6, 0, 1.5),
  ('Family Relief', 6, 'reducing_balance', 36, 15000, 1)
on conflict (name) do nothing;
