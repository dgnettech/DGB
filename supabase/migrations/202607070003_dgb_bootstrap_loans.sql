-- DGB bootstrap and live loan operations
-- Makes the deployed app usable without service-role keys in the browser.

create or replace function public.bootstrap_status()
returns table (
  has_users boolean,
  auth_user_count integer,
  public_user_count integer,
  member_count integer
)
language sql
security definer
set search_path = public, auth
as $$
  select
    exists(select 1 from public.users) as has_users,
    (select count(*)::integer from auth.users) as auth_user_count,
    (select count(*)::integer from public.users) as public_user_count,
    (select count(*)::integer from public.members) as member_count;
$$;

grant execute on function public.bootstrap_status() to anon, authenticated;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_full_name text;
  v_role public.dgb_role;
begin
  v_email := lower(trim(coalesce(new.email, '')));
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'DGB User'
  );

  if TG_OP = 'INSERT' then
    if not exists (select 1 from public.users) then
      v_role := 'super_admin';
    else
      v_role := 'member';
    end if;

    insert into public.users (id, email, full_name, role)
    values (new.id, v_email, v_full_name, v_role)
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      updated_at = now();
  else
    update public.users
    set email = v_email,
        full_name = v_full_name,
        updated_at = now()
    where id = new.id;
  end if;

  update public.members
  set user_id = new.id,
      updated_at = now()
  where user_id is null
    and lower(email) = v_email;

  return new;
end;
$$;

drop trigger if exists dgb_auth_user_profile_sync on auth.users;
create trigger dgb_auth_user_profile_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_profile();

with ordered_auth_users as (
  select
    au.id,
    lower(trim(au.email)) as email,
    coalesce(
      nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(lower(trim(au.email)), '@', 1), ''),
      'DGB User'
    ) as full_name,
    row_number() over (order by au.created_at, au.id) as row_num
  from auth.users au
  where au.email is not null
), existing_count as (
  select count(*)::integer as user_count from public.users
)
insert into public.users (id, email, full_name, role)
select
  ordered_auth_users.id,
  ordered_auth_users.email,
  ordered_auth_users.full_name,
  case
    when existing_count.user_count = 0 and ordered_auth_users.row_num = 1 then 'super_admin'::public.dgb_role
    else 'member'::public.dgb_role
  end
from ordered_auth_users, existing_count
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  updated_at = now();

update public.members m
set user_id = u.id,
    updated_at = now()
from public.users u
where m.user_id is null
  and lower(m.email) = lower(u.email);

create or replace function public.link_member_to_user(
  p_member_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can link members to login users.';
  end if;

  select id into v_user_id
  from public.users
  where lower(email) = lower(trim(p_user_email));

  if v_user_id is null then
    raise exception 'No DGB login user exists for email %.', p_user_email;
  end if;

  update public.members
  set user_id = v_user_id,
      updated_at = now()
  where id = p_member_id;

  if not found then
    raise exception 'Member not found.';
  end if;

  return v_user_id;
end;
$$;

grant execute on function public.link_member_to_user(uuid, text) to authenticated;

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role public.dgb_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'Only super admins can change DGB user roles.';
  end if;

  update public.users
  set role = p_role,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'DGB user not found.';
  end if;
end;
$$;

grant execute on function public.set_user_role(uuid, public.dgb_role) to authenticated;

create or replace function public.create_member_with_account(
  p_member_number text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_account_number text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_account_number text;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can create members.';
  end if;

  if nullif(trim(p_member_number), '') is null or nullif(trim(p_full_name), '') is null or nullif(trim(p_email), '') is null then
    raise exception 'Member number, full name and email are required.';
  end if;

  v_account_number := coalesce(nullif(trim(p_account_number), ''), trim(p_member_number) || '-WALLET');

  select id into v_user_id
  from public.users
  where lower(email) = lower(trim(p_email));

  insert into public.members (member_number, full_name, email, phone, user_id)
  values (trim(p_member_number), trim(p_full_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''), v_user_id)
  returning id into v_member_id;

  insert into public.accounts (member_id, account_number, name)
  values (v_member_id, v_account_number, 'DGB Wallet');

  return v_member_id;
end;
$$;

grant execute on function public.create_member_with_account(text, text, text, text, text, uuid) to authenticated;

create or replace function public.approve_loan_request(
  p_request_id uuid,
  p_account_id uuid,
  p_reference text,
  p_start_date date default current_date,
  p_notes text default null
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

  select * into v_account
  from public.accounts
  where id = p_account_id
    and member_id = v_request.member_id
    and status = 'active';

  if not found then
    raise exception 'Active member account not found for this loan request.';
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
    v_product.annual_interest_rate,
    v_product.interest_method,
    v_request.requested_term_months,
    v_product.admin_fee_cents,
    jsonb_build_object(
      'external_lender', v_request.external_lender,
      'external_settlement_reference', v_request.external_settlement_reference,
      'approval_notes', p_notes
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
    coalesce(nullif(trim(p_notes), ''), 'Approved DGB loan disbursement'),
    auth.uid()
  ) returning id into v_transaction_id;

  v_monthly_rate := (v_product.annual_interest_rate / 100) / 12;
  v_simple_interest_total := round(v_request.requested_amount_cents * (v_product.annual_interest_rate / 100) * (v_request.requested_term_months::numeric / 12));
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

    if v_product.interest_method = 'simple' then
      v_interest := v_base_interest + case when v_installment <= v_interest_remainder then 1 else 0 end;
    else
      v_interest := round(v_remaining_principal * v_monthly_rate);
    end if;

    v_fee := case when v_installment = 1 then v_product.admin_fee_cents else 0 end;

    insert into public.repayment_schedules (
      loan_id,
      installment_number,
      due_date,
      principal_cents,
      interest_cents,
      fee_cents,
      penalty_cents,
      paid_cents,
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

grant execute on function public.approve_loan_request(uuid, uuid, text, date, text) to authenticated;

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
  v_due integer;
  v_pay integer;
  v_paid_total integer := 0;
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
    v_due := v_schedule.amount_due_cents - v_schedule.paid_cents;
    v_pay := least(v_remaining, v_due);

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
      p_account_id,
      v_loan.member_id,
      p_loan_id,
      v_schedule.id,
      'repayment',
      'credit',
      v_pay,
      trim(p_reference),
      nullif(trim(coalesce(p_memo, '')), ''),
      auth.uid()
    ) returning id into v_transaction_id;

    insert into public.repayments (transaction_id, loan_id, schedule_id, repayment_date, payment_reference)
    values (v_transaction_id, p_loan_id, v_schedule.id, current_date, trim(p_reference));

    update public.repayment_schedules
    set paid_cents = paid_cents + v_pay,
        status = case when paid_cents + v_pay >= amount_due_cents then 'paid' else 'part_paid' end
    where id = v_schedule.id;

    v_remaining := v_remaining - v_pay;
    v_paid_total := v_paid_total + v_pay;
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
