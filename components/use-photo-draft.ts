"use client";

import * as React from "react";

import { DEFAULT_CROP, sameCrop, type CropTransform } from "@/lib/image-crop";

/**
 * A photo being picked and framed in a form (Step 77.4, audit R2): the file,
 * its framing, and whether the picker is still reading it. `picker` spreads
 * into `<PhotoPicker>`. `saved` is the framing the entry has now, for a
 * photo it already has.
 */
export function usePhotoDraft(saved: CropTransform = DEFAULT_CROP) {
  const [file, setFile] = React.useState<File | null>(null);
  const [crop, setCrop] = React.useState<CropTransform>(saved);
  const [busy, setBusy] = React.useState(false);
  return {
    file,
    crop,
    /** The picker is still reading the file: nothing may be saved yet. */
    busy,
    /** No new file, but the photo already there framed anew. */
    reframed: file === null && !sameCrop(crop, saved),
    picker: {
      value: file,
      onChange: setFile,
      crop,
      onCropChange: setCrop,
      onBusyChange: setBusy,
    },
    /** Start again: no file, framed as `next`, or as saved. */
    reset(next: CropTransform = saved) {
      setFile(null);
      setCrop(next);
    },
    /** The file is the entry's now: kept as picked, it would go again. */
    clearFile() {
      setFile(null);
    },
  };
}

/** A picked file's own address for an `<img>`, let go once it's replaced. */
export function usePickedUrl(file: File | null): string | null {
  const url = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
