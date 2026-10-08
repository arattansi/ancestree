import { StoryMarkdown } from "@/components/story-markdown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A library post as it reads (Step 135): its cover photo, its title, its
 * date (or "Draft"), and its Markdown with the ancestree mark wherever it
 * was put. The post's page and the editor's live preview both draw it; the
 * preview puts marks in and takes them out (`onBodyChange`).
 */
export function PostArticle({
  title,
  dateLine,
  draft = false,
  coverUrl,
  body,
  onBodyChange,
  className,
}: {
  title: string;
  /** "7 Oct 2026", or for a draft when it was saved. */
  dateLine: string;
  draft?: boolean;
  coverUrl: string | null;
  body: string;
  /** The editor's preview: the text with a mark put in or taken out. */
  onBodyChange?: (body: string) => void;
  className?: string;
}) {
  return (
    <article className={cn("flex flex-col gap-6", className)}>
      {coverUrl ? (
        <div className="overflow-hidden rounded-xl border bg-muted">
          {/* The cover at whatever shape it was taken, no taller than the window's half. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            className="max-h-[50dvh] w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title || "Untitled"}</h1>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {draft ? <Badge variant="secondary">Draft</Badge> : null}
          <span>{dateLine}</span>
        </p>
      </div>
      <StoryMarkdown
        marks
        onMarksChange={onBodyChange}
        className="text-sm text-muted-foreground"
      >
        {body}
      </StoryMarkdown>
    </article>
  );
}
