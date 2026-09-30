-- Step 88.3: a recording's uploader may read it, so they can remove it
-- again when the story it was for is refused. Storage finds a file before
-- it deletes it, so `storage_stories_delete` on its own let nobody remove
-- one that no story took.
--
-- Additive, before the deploy that discards such uploads.
alter policy storage_stories_select on storage.objects
  using (
    bucket_id = 'stories'
    and (
      owner_id = (select auth.uid())::text
      or exists (select 1 from public.stories s where s.audio_path = objects.name)
    )
  );
