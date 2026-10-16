"use client";

import * as React from "react";

import { FormError } from "@/components/form-error";
import { PhotoCropEditor } from "@/components/lazy-photo-crop-editor";
import { Button } from "@/components/ui/button";
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
 * The browser's own "Choose File · No file chosen" box is hidden: the round
 * thumbnail and a button beside it open the file dialog (Step 161).
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
  const chooseRef = React.useRef<HTMLButtonElement>(null);
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
  const unavailable = disabled || busy;
  const choose = () => fileInput.current?.click();
  const chooseButton = `${id}-choose`;
  const labelId = `${id}-label`;

  return (
    <div className="flex flex-col gap-3">
      <Label id={labelId}>{label}</Label>

      <div className="flex items-center gap-4">
        {/* For the pointer; the button beside it is the one in the tab
            order, so the picker isn't reached twice. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={choose}
          disabled={unavailable}
          className="relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border bg-muted transition-colors hover:border-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
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
        </button>
        <div className="flex flex-col items-start gap-1">
          <input
            ref={fileInput}
            id={id}
            type="file"
            accept={ACCEPT}
            onChange={handlePick}
            disabled={unavailable}
            hidden
          />
          <Button
            ref={chooseRef}
            id={chooseButton}
            type="button"
            variant="outline"
            size="sm"
            onClick={choose}
            disabled={unavailable}
            // "Photo, choose a photo": the field's name, then the button's.
            aria-labelledby={`${labelId} ${chooseButton}`}
            aria-describedby={problem ? problemId : undefined}
          >
            {busy ? "reading…" : thumbUrl ? "choose another" : "choose a photo"}
          </Button>
          {/* Spaced from the button on a touch screen, so the links' 44 px
              hit areas don't take its lower edge (Step 70); not there at
              all with nothing to offer. */}
          {(thumbUrl && !editing) || value ? (
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
                    returnFocus(() => chooseRef.current);
                  }}
                >
                  Remove selected photo
                </button>
              ) : null}
            </div>
          ) : null}
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
              returnFocus(() => chooseRef.current);
            }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={closeEditor}>
              done
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
              cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onCropChange(DEFAULT_CROP)}
            >
              reset
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
