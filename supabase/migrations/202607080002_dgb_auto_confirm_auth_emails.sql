-- Auto-confirm DGB Auth email/password signups.
-- DGB is a private/admin-mediated family finance app, so member access is
-- controlled by public.users roles and members.user_id linking rather than
-- by Supabase email-click confirmation.

create or replace function public.auto_confirm_dgb_auth_email()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;

  -- Prevent a stale confirmation token from leaving the account in an
  -- email-confirmation pending state after the row is inserted/updated.
  new.confirmation_token := '';

  return new;
end;
$$;

drop trigger if exists dgb_auto_confirm_auth_email on auth.users;
create trigger dgb_auto_confirm_auth_email
before insert or update of email on auth.users
for each row execute function public.auto_confirm_dgb_auth_email();

-- Clean up any existing accounts that were created before this safeguard.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    confirmation_token = '',
    updated_at = now()
where email is not null
  and email_confirmed_at is null;
