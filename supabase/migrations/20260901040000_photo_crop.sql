-- Photos are stored uncropped; how they are framed inside the round thumbnail
-- lives here, so a photo can be re-framed at any time without re-uploading.
-- `zoom` is 1 at the largest square that fits; `focus_x`/`focus_y` follow the
-- CSS object-position convention (0 = left/top edge, 1 = right/bottom).
alter table public.people
  add column if not exists photo_crop jsonb;

alter table public.people
  drop constraint if exists people_photo_crop_shape;

alter table public.people
  add constraint people_photo_crop_shape check (
    photo_crop is null
    or (
      jsonb_typeof(photo_crop -> 'zoom') = 'number'
      and jsonb_typeof(photo_crop -> 'focus_x') = 'number'
      and jsonb_typeof(photo_crop -> 'focus_y') = 'number'
      and (photo_crop ->> 'zoom')::numeric between 1 and 4
      and (photo_crop ->> 'focus_x')::numeric between 0 and 1
      and (photo_crop ->> 'focus_y')::numeric between 0 and 1
    )
  );

comment on column public.people.photo_crop is
  'Thumbnail framing for photo_path: {"zoom","focus_x","focus_y"}. Null means the default centred crop.';
