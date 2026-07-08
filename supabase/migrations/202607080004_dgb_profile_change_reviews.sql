-- Bank-style maker-checker review for member profile change requests.
-- Admin approval applies the requested profile fields and records the review in one database transaction.

create or replace function public.review_profile_change_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.profile_change_requests%rowtype;
  v_member public.members%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_review_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only finance admins can review profile change requests.';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'Profile change review decision must be approved or rejected.';
  end if;

  select * into v_request
  from public.profile_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Profile change request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This profile change request has already been reviewed.';
  end if;

  select * into v_member
  from public.members
  where id = v_request.member_id
  for update;

  if not found then
    raise exception 'Member for this profile change request was not found.';
  end if;

  if v_decision = 'approved' then
    update public.members
    set phone = coalesce(nullif(v_request.requested_changes->>'phone', ''), phone),
        next_of_kin_name = coalesce(nullif(v_request.requested_changes->>'next_of_kin_name', ''), next_of_kin_name),
        next_of_kin_phone = coalesce(nullif(v_request.requested_changes->>'next_of_kin_phone', ''), next_of_kin_phone)
    where id = v_request.member_id;
  end if;

  update public.profile_change_requests
  set status = v_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = coalesce(
        v_review_notes,
        case when v_decision = 'approved' then 'Approved from DGB admin control room.' else 'Rejected from DGB admin control room.' end
      )
  where id = p_request_id;

  if v_member.user_id is not null then
    insert into public.notifications (user_id, title, body)
    values (
      v_member.user_id,
      case when v_decision = 'approved' then 'Profile update approved' else 'Profile update declined' end,
      case
        when v_decision = 'approved' then 'Your requested DGB profile details were reviewed and applied.'
        else 'Your requested DGB profile change was reviewed and declined. Contact finance admin if anything looks incorrect.'
      end
    );
  end if;

  return p_request_id;
end;
$$;

grant execute on function public.review_profile_change_request(uuid, text, text) to authenticated;
