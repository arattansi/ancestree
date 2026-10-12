-- Step 144: the weekly newsletter carries a note from the beta reviewers at
-- its top when they write one, and, once, every story so far.
--
-- Both go with the next scheduled send and are cleared once it has gone
-- (`sendScheduledNewsletters`, with the service role): "next send only"
-- (Aalim, 2026-10-12). `all_stories` starts on, for the first newsletter
-- anyone receives (Aalim: "only this first that i'm going to send
-- tomorrow"); after it, each issue tells only its own week's stories.
--
-- Additive only: two columns on the one-row table and a function to set
-- them, the schedule's own left as it is.

alter table public.newsletter_schedule
  add column note text
    check (note is null or (char_length(note) between 1 and 2000)),
  add column all_stories boolean not null default false;

grant select (note, all_stories) on table public.newsletter_schedule to authenticated;

update public.newsletter_schedule set all_stories = true where id;

create or replace function public.set_newsletter_note(
  p_note text,
  p_all_stories boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'Only beta reviewers write the newsletter''s note'
      using errcode = '42501';
  end if;
  if p_all_stories is null then
    raise exception 'Whether every story goes' using errcode = '22023';
  end if;

  update public.newsletter_schedule
  set note = nullif(btrim(p_note), ''),
      all_stories = p_all_stories,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id;
end;
$$;

revoke all on function public.set_newsletter_note(text, boolean) from public, anon;
grant execute on function public.set_newsletter_note(text, boolean) to authenticated;
