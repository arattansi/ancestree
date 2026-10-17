-- Step 183: the web that answered a mention through `decide_story_mention`
-- is gone (production deployed `9f1b88e`), and no phone build ever called
-- it, so the wrapper `20261017180000` kept goes. Someone's answer to a story
-- is `decide_story(p_story, p_approve, p_person)`.

drop function public.decide_story_mention(uuid, uuid, boolean);
