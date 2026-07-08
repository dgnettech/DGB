-- DGB lending pool interest distribution
-- Adds per-loan approval rate overrides, product/rate admin helper,
-- and proportional interest distribution to positive-balance member accounts.

alter table public.repayment_schedules
  add column if not exists principal_paid_cents integer not null default 0 check (principal_paid_cents >= 0),
  add column if not exists interest_paid_cents integer not null default 0 check (interest_paid_cents >= 0),
  add column if not exists fee_paid_cents integer not null default 0 check (fee_paid_cents >= 0),
  add column if not exists penalty_paid_cents integer not null default 0 check (penalty_paid_cents >= 0);

with allocated as (
  select
    id,
    least(paid_cents, principal_cents) as principal_paid,
    least(greatest(paid_cents - principal_cents, 0), interest_cents) as interest_paid,
    least(greatest(paid_cents - principal_cents - interest_cents, 0), fee_cents) as fee_paid,
    least(greatest(paid_cents - principal_cents - interest_cents - fee_cents, 0), penalty_cents) as penalty_paid
  from public.repayment_schedules
  where paid_cents > 0
    and principal_paid_cents = 0
    and interest_paid_cents = 0
    and fee_paid_cents = 0
    and penalty_paid_cents = 0
)
update public.repayment_schedules rs
set principal_paid_cents = allocated.principal_paid,
    interest_paid_cents = allocated.interest_paid,
    fee_paid_cents = allocated.fee_paid,
    penalty_paid_cents = allocated.penalty_paid
from allocated
where rs.id = allocated.id;

create or replace view public.member_interest_earnings
with (security_invoker = true) as
select
  a.id as account_id,
  a.member_id,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'interest' and t.direction = 'credit'), 0)::bigint as interest_earned_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.member_id;

create or replace function public.upsert_loan_product(
  p_name text,
  p_annual_interest_rate numeric,
  p_interest_method public.loan_interest_method,
  p_max_term_months integer,
  p_admin_fee_cents integer default 0,
  p_penalty_rate numeric default 0,
  p_active boolean default true,
  p_product_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can manage loan products.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Loan product name is required.';
  end if;

  if p_annual_interest_rate is null or p_annual_interest_rate < 0 then
    raise exception 'Annual interest rate must be zero or higher.';
  end if;

  if p_max_term_months is null or p_max_term_months <= 0 then
    raise exception 'Maximum term must be positive.';
  end if;

  if coalesce(p_admin_fee_cents, 0) < 0 then
    raise exception 'Admin fee cannot be negative.';
  end if;

  if coalesce(p_penalty_rate, 0) < 0 then
    raise exception 'Penalty rate cannot be negative.';
  end if;

  if p_product_id is null then
    insert into public.loan_products (
      name,
      annual_interest_rate,
      interest_method,
      max_term_months,
      admin_fee_cents,
      penalty_rate,
      active
    ) values (
      trim(p_name),
      p_annual_interest_rate,
      p_interest_method,
      p_max_term_months,
      coalesce(p_admin_fee_cents, 0),
      coalesce(p_penalty_rate, 0),
      coalesce(p_active, true)
    )
    on conflict (name) do update set
      annual_interest_rate = excluded.annual_interest_rate,
      interest_method = excluded.interest_method,
      max_term_months = excluded.max_term_months,
      admin_fee_cents = excluded.admin_fee_cents,
      penalty_rate = excluded.penalty_rate,
      active = excluded.active
    returning id into v_product_id;
  else
    update public.loan_products
    set name = trim(p_name),
        annual_interest_rate = p_annual_interest_rate,
        interest_method = p_interest_method,
        max_term_months = p_max_term_months,
        admin_fee_cents = coalesce(p_admin_fee_cents, 0),
        penalty_rate = coalesce(p_penalty_rate, 0),
        active = coalesce(p_active, true)
    where id = p_product_id
    returning id into v_product_id;

    if v_product_id is null then
      raise exception 'Loan product not found.';
    end if;
  end if;

  return v_product_id;
end;
$$;

grant execute on function public.upsert_loan_product(text, numeric, public.loan_interest_method, integer, integer, numeric, boolean, uuid) to authenticated;

create or replace function public.distribute_loan_interest(
  p_loan_id uuid,
  p_schedule_id uuid,
  p_borrower_member_id uuid,
  p_interest_cents integer,
  p_reference text,
  p_memo text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_weight bigint;
  v_allocated integer := 0;
  v_amount integer;
  v_transaction_id uuid;
  v_row record;
begin
  if p_interest_cents is null or p_interest_cents <= 0 then
    return 0;
  end if;

  select coalesce(sum(greatest(b.balance_cents, 0)), 0)::bigint into v_total_weight
  from public.member_account_balances b
  join public.accounts a on a.id = b.account_id
  join public.members m on m.id = b.member_id
  where a.status = 'active'
    and m.status = 'active'
    and b.member_id <> p_borrower_member_id
    and b.balance_cents > 0;

  if v_total_weight <= 0 then
    raise exception 'No positive-balance funding members are available for interest distribution.';
  end if;

  for v_row in
    with eligible as (
      select
        b.account_id,
        b.member_id,
        b.balance_cents::bigint as balance_cents,
        floor((p_interest_cents::numeric * b.balance_cents::numeric) / v_total_weight::numeric)::integer as base_allocation,
        row_number() over (order by b.balance_cents desc, b.member_id) as remainder_rank
      from public.member_account_balances b
      join public.accounts a on a.id = b.account_id
      join public.members m on m.id = b.member_id
      where a.status = 'active'
        and m.status = 'active'
        and b.member_id <> p_borrower_member_id
        and b.balance_cents > 0
    ), totals as (
      select coalesce(sum(base_allocation), 0)::integer as base_total from eligible
    )
    select eligible.*, (p_interest_cents - totals.base_total) as remainder_cents
    from eligible, totals
    order by eligible.remainder_rank
  loop
    v_amount := v_row.base_allocation + case when v_row.remainder_rank <= v_row.remainder_cents then 1 else 0 end;

    if v_amount > 0 then
      insert into public.transactions (
        account_id,
        member_id,
        loan_id,
        schedule_id,
        kind,
        direction,
        amount_cents,
        reference,
        memo,
        captured_by
      ) values (
        v_row.account_id,
        v_row.member_id,
        p_loan_id,
        p_schedule_id,
        'interest',
        'credit',
        v_amount,
        trim(p_reference),
        coalesce(nullif(trim(p_memo), ''), 'Proportional interest distribution from DGB lending pool'),
        auth.uid()
      ) returning id into v_transaction_id;

      insert into public.repayments (transaction_id, loan_id, schedule_id, repayment_date, payment_reference)
      values (v_transaction_id, p_loan_id, p_schedule_id, current_date, trim(p_reference));

      v_allocated := v_allocated + v_amount;
    end if;
  end loop;

  if v_allocated <> p_interest_cents then
    raise exception 'Interest distribution imbalance: expected %, allocated % cents.', p_interest_cents, v_allocated;
  end if;

  return v_allocated;
end;
$$;

-- Internal helper only. It is called by capture_repayment, not directly by browsers.
revoke all on function public.distribute_loan_interest(uuid, uuid, uuid, integer, text, text) from public;

create or replace function public.approve_loan_request(
  p_request_id uuid,
  p_account_id uuid,
  p_reference text,
  p_start_date date default current_date,
  p_notes text default null,
  p_annual_interest_rate numeric default null,
  p_interest_method public.loan_interest_method default null,
  p_admin_fee_cents integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.loan_requests%rowtype;
  v_product public.loan_products%rowtype;
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
  v_annual_interest_rate numeric;
  v_interest_method public.loan_interest_method;
  v_admin_fee_cents integer;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can approve loans.';
  end if;

  if nullif(trim(p_reference), '') is null then
    raise exception 'Loan disbursement reference is required.';
  end if;

  select * into v_request
  from public.loan_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Loan request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending loan requests can be approved.';
  end if;

  select * into v_product
  from public.loan_products
  where id = v_request.loan_product_id
    and active = true;

  if not found then
    raise exception 'Active loan product not found.';
  end if;

  if v_request.requested_term_months > v_product.max_term_months then
    raise exception 'Requested term exceeds product maximum.';
  end if;

  v_annual_interest_rate := coalesce(p_annual_interest_rate, v_product.annual_interest_rate);
  v_interest_method := coalesce(p_interest_method, v_product.interest_method);
  v_admin_fee_cents := coalesce(p_admin_fee_cents, v_product.admin_fee_cents, 0);

  if v_annual_interest_rate < 0 then
    raise exception 'Annual interest rate must be zero or higher.';
  end if;

  if v_admin_fee_cents < 0 then
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
    v_product.id,
    v_request.requested_amount_cents,
    v_annual_interest_rate,
    v_interest_method,
    v_request.requested_term_months,
    v_admin_fee_cents,
    jsonb_build_object(
      'external_lender', v_request.external_lender,
      'external_settlement_reference', v_request.external_settlement_reference,
      'approval_notes', p_notes,
      'approved_annual_interest_rate', v_annual_interest_rate,
      'approved_interest_method', v_interest_method,
      'approved_admin_fee_cents', v_admin_fee_cents
    ),
    'active',
    auth.uid(),
    now(),
    p_start_date
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
    p_account_id,
    v_request.member_id,
    v_loan_id,
    'loan_disbursement',
    'debit',
    v_request.requested_amount_cents,
    trim(p_reference),
    coalesce(nullif(trim(p_notes), ''), 'Approved DGB loan disbursement from pooled member funds'),
    auth.uid()
  ) returning id into v_transaction_id;

  v_monthly_rate := (v_annual_interest_rate / 100) / 12;
  v_simple_interest_total := round(v_request.requested_amount_cents * (v_annual_interest_rate / 100) * (v_request.requested_term_months::numeric / 12));
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

    if v_interest_method = 'simple' then
      v_interest := v_base_interest + case when v_installment <= v_interest_remainder then 1 else 0 end;
    else
      v_interest := round(v_remaining_principal * v_monthly_rate);
    end if;

    v_fee := case when v_installment = 1 then v_admin_fee_cents else 0 end;

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
      (p_start_date + (v_installment || ' months')::interval)::date,
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
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = coalesce(nullif(trim(p_notes), ''), 'Approved')
  where id = p_request_id;

  return v_loan_id;
end;
$$;

grant execute on function public.approve_loan_request(uuid, uuid, text, date, text, numeric, public.loan_interest_method, integer) to authenticated;

create or replace function public.capture_repayment(
  p_loan_id uuid,
  p_account_id uuid,
  p_amount_cents integer,
  p_reference text,
  p_memo text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans%rowtype;
  v_account public.accounts%rowtype;
  v_remaining integer;
  v_schedule_remaining integer;
  v_schedule_payment integer;
  v_schedule_working integer;
  v_due integer;
  v_pay integer;
  v_principal_pay integer;
  v_interest_pay integer;
  v_fee_pay integer;
  v_penalty_pay integer;
  v_paid_total integer := 0;
  v_distributed_interest integer;
  v_schedule record;
  v_transaction_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can capture repayments.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Repayment amount must be positive.';
  end if;

  if nullif(trim(p_reference), '') is null then
    raise exception 'Repayment reference is required.';
  end if;

  select * into v_loan
  from public.loans
  where id = p_loan_id
  for update;

  if not found then
    raise exception 'Loan not found.';
  end if;

  if v_loan.status not in ('active', 'overdue', 'approved') then
    raise exception 'Repayments can only be captured against open loans.';
  end if;

  select * into v_account
  from public.accounts
  where id = p_account_id
    and member_id = v_loan.member_id
    and status = 'active';

  if not found then
    raise exception 'Active member account not found for this loan.';
  end if;

  v_remaining := p_amount_cents;

  for v_schedule in
    select *
    from public.repayment_schedules
    where loan_id = p_loan_id
      and paid_cents < amount_due_cents
    order by installment_number
    for update
  loop
    exit when v_remaining <= 0;

    v_schedule_remaining := v_schedule.amount_due_cents - v_schedule.paid_cents;
    v_schedule_payment := least(v_remaining, v_schedule_remaining);
    v_schedule_working := v_schedule_payment;

    v_fee_pay := 0;
    v_penalty_pay := 0;
    v_interest_pay := 0;
    v_principal_pay := 0;

    v_due := greatest(v_schedule.fee_cents - v_schedule.fee_paid_cents, 0);
    v_pay := least(v_schedule_working, v_due);
    v_fee_pay := v_pay;
    v_schedule_working := v_schedule_working - v_pay;

    v_due := greatest(v_schedule.penalty_cents - v_schedule.penalty_paid_cents, 0);
    v_pay := least(v_schedule_working, v_due);
    v_penalty_pay := v_pay;
    v_schedule_working := v_schedule_working - v_pay;

    v_due := greatest(v_schedule.interest_cents - v_schedule.interest_paid_cents, 0);
    v_pay := least(v_schedule_working, v_due);
    v_interest_pay := v_pay;
    v_schedule_working := v_schedule_working - v_pay;

    v_due := greatest(v_schedule.principal_cents - v_schedule.principal_paid_cents, 0);
    v_pay := least(v_schedule_working, v_due);
    v_principal_pay := v_pay;
    v_schedule_working := v_schedule_working - v_pay;

    if v_schedule_working <> 0 then
      raise exception 'Repayment allocation error on schedule %.', v_schedule.id;
    end if;

    if v_fee_pay > 0 then
      insert into public.transactions (
        account_id, member_id, loan_id, schedule_id, kind, direction, amount_cents, reference, memo, captured_by
      ) values (
        p_account_id, v_loan.member_id, p_loan_id, v_schedule.id, 'fee', 'credit', v_fee_pay, trim(p_reference), nullif(trim(coalesce(p_memo, '')), ''), auth.uid()
      ) returning id into v_transaction_id;

      insert into public.repayments (transaction_id, loan_id, schedule_id, repayment_date, payment_reference)
      values (v_transaction_id, p_loan_id, v_schedule.id, current_date, trim(p_reference));
    end if;

    if v_penalty_pay > 0 then
      insert into public.transactions (
        account_id, member_id, loan_id, schedule_id, kind, direction, amount_cents, reference, memo, captured_by
      ) values (
        p_account_id, v_loan.member_id, p_loan_id, v_schedule.id, 'penalty', 'credit', v_penalty_pay, trim(p_reference), nullif(trim(coalesce(p_memo, '')), ''), auth.uid()
      ) returning id into v_transaction_id;

      insert into public.repayments (transaction_id, loan_id, schedule_id, repayment_date, payment_reference)
      values (v_transaction_id, p_loan_id, v_schedule.id, current_date, trim(p_reference));
    end if;

    if v_interest_pay > 0 then
      v_distributed_interest := public.distribute_loan_interest(
        p_loan_id,
        v_schedule.id,
        v_loan.member_id,
        v_interest_pay,
        trim(p_reference),
        coalesce(nullif(trim(p_memo), ''), 'Interest earned from pooled DGB loan')
      );

      if v_distributed_interest <> v_interest_pay then
        raise exception 'Interest distribution mismatch for schedule %.', v_schedule.id;
      end if;
    end if;

    if v_principal_pay > 0 then
      insert into public.transactions (
        account_id, member_id, loan_id, schedule_id, kind, direction, amount_cents, reference, memo, captured_by
      ) values (
        p_account_id, v_loan.member_id, p_loan_id, v_schedule.id, 'repayment', 'credit', v_principal_pay, trim(p_reference), nullif(trim(coalesce(p_memo, '')), ''), auth.uid()
      ) returning id into v_transaction_id;

      insert into public.repayments (transaction_id, loan_id, schedule_id, repayment_date, payment_reference)
      values (v_transaction_id, p_loan_id, v_schedule.id, current_date, trim(p_reference));
    end if;

    update public.repayment_schedules
    set paid_cents = paid_cents + v_schedule_payment,
        principal_paid_cents = principal_paid_cents + v_principal_pay,
        interest_paid_cents = interest_paid_cents + v_interest_pay,
        fee_paid_cents = fee_paid_cents + v_fee_pay,
        penalty_paid_cents = penalty_paid_cents + v_penalty_pay,
        status = case when paid_cents + v_schedule_payment >= amount_due_cents then 'paid' else 'part_paid' end
    where id = v_schedule.id;

    v_remaining := v_remaining - v_schedule_payment;
    v_paid_total := v_paid_total + v_schedule_payment;
  end loop;

  if v_remaining > 0 then
    raise exception 'Repayment exceeds outstanding loan balance by % cents.', v_remaining;
  end if;

  if not exists (select 1 from public.repayment_schedules where loan_id = p_loan_id and paid_cents < amount_due_cents) then
    update public.loans set status = 'closed' where id = p_loan_id;
  elsif exists (select 1 from public.repayment_schedules where loan_id = p_loan_id and due_date < current_date and paid_cents < amount_due_cents) then
    update public.loans set status = 'overdue' where id = p_loan_id;
  else
    update public.loans set status = 'active' where id = p_loan_id;
  end if;

  return v_paid_total;
end;
$$;

grant execute on function public.capture_repayment(uuid, uuid, integer, text, text) to authenticated;
