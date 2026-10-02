-- Step 99.7, after its deploy: the app saves a story's text, credits and
-- date together with `edit_story` (20261001250000), so Step 99.6's
-- `set_story_details` has no callers left. Applied once the code that
-- stopped calling it is live.

drop function public.set_story_details(uuid, uuid, uuid[], uuid[], date, text);
