-- Step 99.6, after its deploy: the app saves a story's credits and date
-- together with `set_story_details` (20261001230000), so the credits-only
-- `set_story_credits` (Step 99.5) has no callers left. Applied once the code
-- that stopped calling it is live.

drop function public.set_story_credits(uuid, uuid, uuid[], uuid[]);
