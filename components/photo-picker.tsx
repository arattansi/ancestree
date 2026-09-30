"use client";

import * as React from "react";

import { FormError } from "@/components/form-error";
import { PhotoCropEditor } from "@/components/lazy-photo-crop-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstFocusable, useFocusReturn } from "@/components/use-focus-return";
import { usePickedUrl } from "@/components/use-photo-draft";
import { compressImage } from "@/lib/image";
import { cropStyle, DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";

const ACCEPT = "image/jpeg,image/png,image/webp";
const UNREADABLE = "That image couldn't be read. Try another file.";

/**
 * Pick a photo and position it inside the round thumbnail. Photos upload
 * uncropped and the framing is stored alongside them, so the same editor works
 * on a photo that was uploaded long ago — nothing is re-uploaded to re-frame.
 * No line on file types or resizing (Step 58): the file dialog offers only
 * what's accepted, and anything else is refused in a line under the picker.
 */
export function PhotoPicker({
  id,
  value,
  onChange,
  crop,
  onCropChange,
  currentUrl,
  label = "Photo",
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
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Why the file just picked wasn't taken: by the picker, where a toast
  // would fade before it's read (Step 70). The next pick clears it.
  const [problem, setProblem] = React.useState<string | null>(null);
  // The crop as it was when the editor opened, so Cancel can put it back.
  const cropOnOpen = React.useRef<CropTransform>(crop);
  // The editor and the buttons that open and close it take each other's
  // place, so focus is handed on rather than dropped to the page.
  const returnFocus = useFocusReturn();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const repositionButton = React.useRef<HTMLButtonElement>(null);
  const editor = React.useRef<HTMLDivElement>(null);
  const problemId = `${id}-problem`;

  React.useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  // The editor opens after a pick or a Reposition: here by then.
  React.useEffect(() => {
    if (!disabled) void PhotoCropEditor.preload().catch(() => {});
  }, [disabled]);

  const pickedUrl = usePickedUrl(value);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProblem(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setProblem("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setBusy(true);
    const small = await compressImage(file);
    setBusy(false);
    // Only a photo the browser redrew goes up: the file as picked would
    // carry its camera's details, where it was taken included (Step 91).
    if (!small) {
      setProblem(UNREADABLE);
      return;
    }
    onChange(small);
    // A fresh photo starts centred; the editor opens so the framing is
    // confirmed rather than guessed.
    cropOnOpen.current = DEFAULT_CROP;
    onCropChange(DEFAULT_CROP);
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    returnFocus(() => repositionButton.current);
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
            ref={fileInput}
            id={id}
            type="file"
            accept={ACCEPT}
            onChange={handlePick}
            disabled={disabled || busy}
            aria-describedby={problem ? problemId : undefined}
          />
          {/* Spaced from the file box on a touch screen, so the links' 44 px
              hit areas don't take its lower edge (Step 70). */}
          <div className="flex gap-3 pointer-coarse:mt-3">
            {thumbUrl && !editing ? (
              <button
                ref={repositionButton}
                type="button"
                className="relative tap-target text-xs underline underline-offset-2"
                onClick={() => {
                  cropOnOpen.current = crop;
                  setEditing(true);
                  returnFocus(() => firstFocusable(editor.current));
                }}
              >
                Reposition
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                className="relative tap-target text-xs text-destructive underline underline-offset-2"
                onClick={() => {
                  setEditing(false);
                  setProblem(null);
                  onChange(null);
                  onCropChange(cropOnOpen.current);
                  returnFocus(() => fileInput.current);
                }}
              >
                Remove selected photo
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <FormError id={problemId}>{problem}</FormError>

      {editing && thumbUrl ? (
        <div
          ref={editor}
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-4"
        >
          <PhotoCropEditor
            url={thumbUrl}
            crop={crop}
            onCropChange={onCropChange}
            onUnreadable={() => {
              setProblem(UNREADABLE);
              setEditing(false);
              returnFocus(() => fileInput.current);
            }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={closeEditor}>
              Done
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onCropChange(cropOnOpen.current);
                closeEditor();
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
