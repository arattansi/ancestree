-- Step 148.3: whether adding some people would go, without adding them, for
-- the phone's scribe to say so before the member saves.
--
-- The scribe lists relatives a story names who aren't on the tree yet; the
-- member ticks those to add, and each is added with one line to the person
-- named, through `add_people_with_connections`, as the web's "Add a
-- relative" adds them. That call may refuse (no blood tie, Step 55; not on a
-- Leaf's own line, Step 34; under 18, Step 98) or ask first ("is X 18 or
-- older?", Step 98's follow-up). The web asks once the member presses save,
-- on the form they're still on. On the phone the story is saved by then, so
-- the scribe asks here as soon as a relative is ticked, and the card says it
-- while the member can still answer or untick it.
--
-- One new function; nothing else changes. It makes the very same call as the
-- member (security invoker) inside a block that always ends in an error, so
-- everything the call wrote, its triggers' notices included, is undone; what
-- comes back is whether it went, or what the database said instead, in the
-- shape PostgREST gives an error. It never adds the member's own entry.

create or replace function public.check_add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_suggestions jsonb default '[]'::jsonb,
  p_tree uuid default null,
  p_adult_existing uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message text;
  v_details text;
  v_code text;
begin
  begin
    perform public.add_people_with_connections(
      p_people, p_edges, null, p_suggestions, p_tree, p_adult_existing
    );
    raise exception using errcode = 'CK000';
  exception
    when sqlstate 'CK000' then
      return jsonb_build_object('ok', true);
    when others then
      get stacked diagnostics
        v_message = message_text,
        v_details = pg_exception_detail,
        v_code = returned_sqlstate;
      return jsonb_build_object(
        'ok', false,
        'message', v_message,
        'details', nullif(v_details, ''),
        'code', v_code
      );
  end;
end;
$$;

revoke all on function public.check_add_people_with_connections(jsonb, jsonb, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.check_add_people_with_connections(jsonb, jsonb, jsonb, uuid, uuid[]) to authenticated, service_role;
