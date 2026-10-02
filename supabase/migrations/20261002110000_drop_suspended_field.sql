-- Step 103.4 follow-up, after the deploy: `getProfile` takes the Data
-- API's refusal of a suspended account (`public.refuse_suspended`,
-- 20261002100000) as the sign to sign it out, so the computed field it
-- read before (20261002090000) goes.

drop function public.suspended(public.profiles);
