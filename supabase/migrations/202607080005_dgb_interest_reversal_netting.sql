-- Keep member interest totals aligned with immutable reversal entries.
-- Interest credits that have been reversed must not continue to appear as earned interest.

create or replace view public.member_interest_earnings
with (security_invoker = true) as
select
  a.id as account_id,
  a.member_id,
  coalesce(
    sum(t.amount_cents) filter (
      where t.kind = 'interest'
        and t.direction = 'credit'
        and not exists (
          select 1
          from public.transactions reversal
          where reversal.reversal_of = t.id
        )
    ),
    0
  )::bigint as interest_earned_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.member_id;
