-- DGB live operations helpers
-- Adds private document storage plus server-side RPCs for admin-safe operations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-documents',
  'member-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dgb_member_documents_member_read" on storage.objects;
create policy "dgb_member_documents_member_read" on storage.objects for select using (
  bucket_id = 'member-documents'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

drop policy if exists "dgb_member_documents_member_insert" on storage.objects;
create policy "dgb_member_documents_member_insert" on storage.objects for insert with check (
  bucket_id = 'member-documents'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

drop policy if exists "dgb_member_documents_admin_update" on storage.objects;
create policy "dgb_member_documents_admin_update" on storage.objects for update using (
  bucket_id = 'member-documents' and public.is_admin()
) with check (
  bucket_id = 'member-documents' and public.is_admin()
);

drop policy if exists "dgb_member_documents_admin_delete" on storage.objects;
create policy "dgb_member_documents_admin_delete" on storage.objects for delete using (
  bucket_id = 'member-documents' and public.is_admin()
);

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
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can create members.';
  end if;

  if nullif(trim(p_member_number), '') is null or nullif(trim(p_full_name), '') is null or nullif(trim(p_email), '') is null then
    raise exception 'Member number, full name and email are required.';
  end if;

  v_account_number := coalesce(nullif(trim(p_account_number), ''), trim(p_member_number) || '-WALLET');

  insert into public.members (member_number, full_name, email, phone)
  values (trim(p_member_number), trim(p_full_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''))
  returning id into v_member_id;

  insert into public.accounts (member_id, account_number, name)
  values (v_member_id, v_account_number, 'DGB Wallet');

  return v_member_id;
end;
$$;

create or replace function public.capture_contribution(
  p_member_id uuid,
  p_account_id uuid,
  p_amount_cents integer,
  p_reference text,
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can capture contributions.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Contribution amount must be positive.';
  end if;

  if nullif(trim(p_reference), '') is null then
    raise exception 'Contribution reference is required.';
  end if;

  if not exists (
    select 1 from public.accounts a
    where a.id = p_account_id
      and a.member_id = p_member_id
      and a.status = 'active'
  ) then
    raise exception 'Active account does not belong to the selected member.';
  end if;

  insert into public.transactions (
    account_id,
    member_id,
    kind,
    direction,
    amount_cents,
    reference,
    memo,
    captured_by
  ) values (
    p_account_id,
    p_member_id,
    'contribution',
    'credit',
    p_amount_cents,
    trim(p_reference),
    nullif(trim(coalesce(p_memo, '')), ''),
    auth.uid()
  ) returning id into v_transaction_id;

  insert into public.contributions (transaction_id, member_id, contribution_date, payment_reference)
  values (v_transaction_id, p_member_id, current_date, trim(p_reference));

  return v_transaction_id;
end;
$$;

grant execute on function public.create_member_with_account(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.capture_contribution(uuid, uuid, integer, text, text) to authenticated;
