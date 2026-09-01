"use client";

import * as React from "react";
import { toast } from "sonner";

import { PhotoCropEditor } from "@/components/photo-crop-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/image";
import { cropStyle, DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Pick a photo and position it inside the round thumbnail. Photos upload
 * uncropped and the framing is stored alongside them, so the same editor works
 * on a photo that was uploaded long ago — nothing is re-uploaded to re-frame.
 */
export function PhotoPicker({
  id,
  value,
  onChange,
  crop,
  onCropChange,
  currentUrl,
  label = "Photo",
  hint = "JPEG, PNG, or WebP. Resized on your device before upload.",
  disabled = false,
  onBusyChange,
}: {
  id: string;
  value: File | null;
  onChange: (file: File | null) => void;
  crop: CropTransform;
  onCropChange: (crop: CropTransform) => void;
  currentUrl?: string | null;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // The crop as it was when the editor opened, so Cancel can put it back.
  const cropOnOpen = React.useRef<CropTransform>(crop);

  React.useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const pickedUrl = React.useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );
  React.useEffect(() => {
    if (!pickedUrl) return;
    return () => URL.revokeObjectURL(pickedUrl);
  }, [pickedUrl]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } finally {
      setBusy(false);
    }
    // A fresh photo starts centred; the editor opens so the framing is
    // confirmed rather than guessed.
    cropOnOpen.current = DEFAULT_CROP;
    onCropChange(DEFAULT_CROP);
    setEditing(true);
  }

  const thumbUrl = pickedUrl ?? currentUrl ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-center gap-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt="Thumbnail preview"
              style={cropStyle(crop)}
              className="size-full"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-full items-center justify-center text-muted-foreground"
            >
              ?
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            id={id}
            type="file"
            accept={ACCEPT}
            onChange={handlePick}
            disabled={disabled || busy}
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
          <div className="flex gap-3">
            {thumbUrl && !editing ? (
              <button
                type="button"
                className="text-xs underline underline-offset-2"
                onClick={() => {
                  cropOnOpen.current = crop;
                  setEditing(true);
                }}
              >
                Reposition
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                className="text-xs text-destructive underline underline-offset-2"
                onClick={() => {
                  setEditing(false);
                  onChange(null);
                  onCropChange(cropOnOpen.current);
                }}
              >
                Remove selected photo
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {editing && thumbUrl ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <PhotoCropEditor
            url={thumbUrl}
            crop={crop}
            onCropChange={onCropChange}
            onUnreadable={() => {
              toast.error("That image couldn't be read. Try another file.");
              setEditing(false);
            }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => setEditing(false)}>
              Done
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onCropChange(cropOnOpen.current);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onCropChange(DEFAULT_CROP)}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
