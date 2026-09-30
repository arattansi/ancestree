import { lazyComponent } from "@/components/lazy-component";

/**
 * The cropper, fetched when a photo might be framed rather than with the
 * page (Step 87.4, audit C1). Whatever shows it calls `preload()` first,
 * so the editor opens drawn, with focus where it always went.
 */
export const PhotoCropEditor = lazyComponent(() =>
  import("@/components/photo-crop-editor").then((m) => m.PhotoCropEditor),
);
