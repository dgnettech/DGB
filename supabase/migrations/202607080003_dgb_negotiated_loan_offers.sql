-- DGB negotiated loan-offer workflow
-- Members request amount + period only. Finance admins return a custom offer;
-- the loan is disbursed only after the member accepts the offered rate/terms.

alter table public.loans
  alter column loan_product_id drop not null;

alter table public.loan_requests
  add column if not exists offer_annual_interest_rate numeric(8,4) check (offer_annual_interest_rate >= 0),
  add column if not exists offer_interest_method public.loan_interest_method,
  add column if not exists offer_admin_fee_cents integer not null default 0 check (offer_admin_fee_cents >= 0),
  add column if not exists offer_start_date date,
  add column if not exists member_accepted_at timestamptz,
  add column if not exists member_decision_notes text;

create unique index if not exists loans_loan_request_id_unique_idx
on public.loans(loan_request_id)
where loan_request_id is not null;

-- Historical loans were created immediately at admin approval time. Mark their
-- source requests as already accepted/active so they do not show as pending
-- member offers after this workflow change.
update public.loan_requests lr
set offer_annual_interest_rate = coalesce(lr.offer_annual_interest_rate, l.annual_interest_rate),
    offer_interest_method = coalesce(lr.offer_interest_method, l.interest_method),
    offer_admin_fee_cents = coalesce(lr.offer_admin_fee_cents, l.admin_fee_cents, 0),
    offer_start_date = coalesce(lr.offer_start_date, l.start_date),
    member_accepted_at = coalesce(lr.member_accepted_at, l.created_at, lr.reviewed_at),
    status = case when lr.status = 'approved' then 'active'::public.loan_status else lr.status end
from public.loans l
where l.loan_request_id = lr.id;

-- Future member-created requests must remain plain requests only. The offer
-- fields are filled by finance admins through approve_loan_request().
drop policy if exists "members_create_own_pending_loan_requests" on public.loan_requests;
create policy "members_create_own_pending_loan_requests" on public.loan_requests for insert with check (
  member_id in (select id from public.members where user_id = auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_notes is null
  and loan_product_id is null
  and offer_annual_interest_rate is null
  and offer_interest_method is null
  and offer_start_date is null
  and offer_admin_fee_cents = 0
  and member_accepted_at is null
  and member_decision_notes is null
);

-- Remove the old 5-argument immediate-disbursement helper so every approval
-- route uses the negotiated offer flow below.
drop function if exists public.approve_loan_request(uuid, uuid, text, date, text);

create or replace function public.approve_loan_request(
  p_request_id uuid,
  p_account_id uuid,
  p_reference text default null,
  p_start_date date default current_date,
  p_notes text default null,
  p_annual_interest_rate numeric default null,
  p_interest_method public.loan_interest_method default 'reducing_balance',
  p_admin_fee_cents integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.loan_requests%rowtype;
  v_account public.accounts%rowtype;
  v_available_cash bigint;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can approve loan offers.';
  end if;

  select * into v_request
  from public.loan_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Loan request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending loan requests can receive an approval offer.';
  end if;

  if p_annual_interest_rate is null or p_annual_interest_rate < 0 then
    raise exception 'Annual interest rate must be zero or higher.';
  end if;

  if p_interest_method is null then
    raise exception 'Choose an interest method for this offer.';
  end if;

  if coalesce(p_admin_fee_cents, 0) < 0 then
    raise exception 'Admin fee cannot be negative.';
  end if;

  select * into v_account
  from public.accounts
  where id = p_account_id
    and member_id = v_request.member_id
    and status = 'active';

  if not found then
    raise exception 'Active member account not found for this loan request.';
  end if;

  select coalesce(sum(case when direction = 'credit' then amount_cents else -amount_cents end), 0)::bigint
  into v_available_cash
  from public.transactions;

  if v_available_cash < v_request.requested_amount_cents then
    raise exception 'Insufficient DGB pool cash. Available: % cents, requested: % cents.', v_available_cash, v_request.requested_amount_cents;
  end if;

  update public.loan_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = coalesce(nullif(trim(p_notes), ''), 'Finance admin approved a custom loan offer.'),
      offer_annual_interest_rate = p_annual_interest_rate,
      offer_interest_method = p_interest_method,
      offer_admin_fee_cents = coalesce(p_admin_fee_cents, 0),
      offer_start_date = coalesce(p_start_date, current_date),
      member_accepted_at = null,
      member_decision_notes = null
  where id = p_request_id;

  return p_request_id;
end;
$$;

grant execute on function public.approve_loan_request(uuid, uuid, text, date, text, numeric, public.loan_interest_method, integer) to authenticated;

create or replace function public.accept_loan_offer(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.loan_requests%rowtype;
  v_member public.members%rowtype;
  v_account public.accounts%rowtype;
  v_loan_id uuid;
  v_transaction_id uuid;
  v_monthly_rate numeric;
  v_simple_interest_total integer;
  v_base_principal integer;
  v_principal_remainder integer;
  v_base_interest integer;
  v_interest_remainder integer;
  v_remaining_principal integer;
  v_installment integer;
  v_principal integer;
  v_interest integer;
  v_fee integer;
  v_available_cash bigint;
  v_start_date date;
begin
  select * into v_request
  from public.loan_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Loan offer not found.';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'Only approved loan offers can be accepted.';
  end if;

  if v_request.offer_annual_interest_rate is null or v_request.offer_interest_method is null then
    raise exception 'This loan request does not have a complete finance-admin offer yet.';
  end if;

  select * into v_member
  from public.members
  where id = v_request.member_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Only the borrowing member can accept this loan offer.';
  end if;

  if exists (select 1 from public.loans where loan_request_id = p_request_id) then
    raise exception 'This loan offer has already been accepted.';
  end if;

  select * into v_account
  from public.accounts
  where member_id = v_request.member_id
    and status = 'active'
  order by created_at
  limit 1;

  if not found then
    raise exception 'Active member account not found for this loan offer.';
  end if;

  select coalesce(sum(case when direction = 'credit' then amount_cents else -amount_cents end), 0)::bigint
  into v_available_cash
  from public.transactions;

  if v_available_cash < v_request.requested_amount_cents then
    raise exception 'DGB pool cash changed since approval. Ask finance admin to review this offer again. Available: % cents, requested: % cents.', v_available_cash, v_request.requested_amount_cents;
  end if;

  v_start_date := coalesce(v_request.offer_start_date, current_date);

  insert into public.loans (
    member_id,
    loan_request_id,
    loan_product_id,
    principal_cents,
    annual_interest_rate,
    interest_method,
    term_months,
    admin_fee_cents,
    external_settlement_details,
    status,
    approved_by,
    approved_at,
    start_date
  ) values (
    v_request.member_id,
    v_request.id,
    v_request.loan_product_id,
    v_request.requested_amount_cents,
    v_request.offer_annual_interest_rate,
    v_request.offer_interest_method,
    v_request.requested_term_months,
    coalesce(v_request.offer_admin_fee_cents, 0),
    jsonb_build_object(
      'external_lender', v_request.external_lender,
      'external_settlement_reference', v_request.external_settlement_reference,
      'approval_notes', v_request.review_notes,
      'accepted_by', auth.uid(),
      'accepted_at', now(),
      'approved_annual_interest_rate', v_request.offer_annual_interest_rate,
      'approved_interest_method', v_request.offer_interest_method,
      'approved_admin_fee_cents', coalesce(v_request.offer_admin_fee_cents, 0)
    ),
    'active',
    v_request.reviewed_by,
    v_request.reviewed_at,
    v_start_date
  ) returning id into v_loan_id;

  insert into public.transactions (
    account_id,
    member_id,
    loan_id,
    kind,
    direction,
    amount_cents,
    reference,
    memo,
    captured_by
  ) values (
    v_account.id,
    v_request.member_id,
    v_loan_id,
    'loan_disbursement',
    'debit',
    v_request.requested_amount_cents,
    'DGB-LOAN-' || upper(substr(v_loan_id::text, 1, 8)),
    coalesce(nullif(trim(v_request.review_notes), ''), 'Member accepted DGB loan offer from pooled member funds'),
    coalesce(v_request.reviewed_by, auth.uid())
  ) returning id into v_transaction_id;

  v_monthly_rate := (v_request.offer_annual_interest_rate / 100) / 12;
  v_simple_interest_total := round(v_request.requested_amount_cents * (v_request.offer_annual_interest_rate / 100) * (v_request.requested_term_months::numeric / 12));
  v_base_principal := floor(v_request.requested_amount_cents::numeric / v_request.requested_term_months)::integer;
  v_principal_remainder := v_request.requested_amount_cents - (v_base_principal * v_request.requested_term_months);
  v_base_interest := floor(v_simple_interest_total::numeric / v_request.requested_term_months)::integer;
  v_interest_remainder := v_simple_interest_total - (v_base_interest * v_request.requested_term_months);
  v_remaining_principal := v_request.requested_amount_cents;

  for v_installment in 1..v_request.requested_term_months loop
    v_principal := v_base_principal + case when v_installment <= v_principal_remainder then 1 else 0 end;

    if v_installment = v_request.requested_term_months then
      v_principal := v_remaining_principal;
    end if;

    if v_request.offer_interest_method = 'simple' then
      v_interest := v_base_interest + case when v_installment <= v_interest_remainder then 1 else 0 end;
    else
      v_interest := round(v_remaining_principal * v_monthly_rate);
    end if;

    v_fee := case when v_installment = 1 then coalesce(v_request.offer_admin_fee_cents, 0) else 0 end;

    insert into public.repayment_schedules (
      loan_id,
      installment_number,
      due_date,
      principal_cents,
      interest_cents,
      fee_cents,
      penalty_cents,
      paid_cents,
      principal_paid_cents,
      interest_paid_cents,
      fee_paid_cents,
      penalty_paid_cents,
      status
    ) values (
      v_loan_id,
      v_installment,
      (v_start_date + (v_installment || ' months')::interval)::date,
      greatest(v_principal, 0),
      greatest(v_interest, 0),
      greatest(v_fee, 0),
      0,
      0,
      0,
      0,
      0,
      0,
      'due'
    );

    v_remaining_principal := greatest(0, v_remaining_principal - v_principal);
  end loop;

  update public.loan_requests
  set status = 'active',
      member_accepted_at = now(),
      member_decision_notes = 'Accepted by member'
  where id = p_request_id;

  return v_loan_id;
end;
$$;

grant execute on function public.accept_loan_offer(uuid) to authenticated;

create or replace function public.decline_loan_offer(
  p_request_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.loan_requests%rowtype;
begin
  select * into v_request
  from public.loan_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Loan offer not found.';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'Only approved loan offers can be declined.';
  end if;

  if not exists (
    select 1
    from public.members
    where id = v_request.member_id
      and user_id = auth.uid()
      and status = 'active'
  ) then
    raise exception 'Only the borrowing member can decline this loan offer.';
  end if;

  update public.loan_requests
  set status = 'rejected',
      member_decision_notes = coalesce(nullif(trim(p_notes), ''), 'Declined by member')
  where id = p_request_id;

  return p_request_id;
end;
$$;

grant execute on function public.decline_loan_offer(uuid, text) to authenticated;
