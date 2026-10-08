import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LogoMark } from "@/components/logo-mark";
import { isBlogMark, withBlogMarkAt, withoutBlogMarkAt } from "@/lib/blog";
import { cn } from "@/lib/utils";

/**
 * A story's text as Markdown (Step 99): headings, emphasis, lists, quotes,
 * links, code and tables. Safe to show whatever was written: it's drawn as
 * React elements (no raw HTML is let through, and a link's address is
 * checked), links open in a new tab and name no referrer, and a picture is
 * only its description, since an address someone else chose would load from
 * their server. A single line break stays a line break, as the plain text
 * stories before this were written.
 */
const components: Components = {
  h1: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h5: ({ children }) => <h5 className="font-semibold">{children}</h5>,
  h6: ({ children }) => <h5 className="font-semibold">{children}</h5>,
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="font-medium underline underline-offset-2"
    >
      {children}
    </a>
  ),
  img: ({ alt }) => (alt ? <span className="italic">{alt}</span> : null),
  code: ({ children, className }) => (
    <code
      className={cn(
        "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]",
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1">{children}</td>
  ),
};

/**
 * A library post's marks (Step 135; placed by hand since): each
 * top-level `<!-- ancestree -->` line, as an `hr` marked `data-mark`,
 * which the `hr` below draws as the logo. Anywhere else the comment stays
 * text, as raw HTML is in every story.
 */
type MdNode = { type: string; value?: string; position?: unknown; data?: unknown };
function remarkBlogMarks() {
  return (tree: { children: MdNode[] }) => {
    tree.children = tree.children.map((node) =>
      node.type === "html" && isBlogMark(node.value ?? "")
        ? {
            type: "thematicBreak",
            position: node.position,
            data: { hProperties: { dataMark: true } },
          }
        : node,
    );
  };
}

type HastNode = {
  properties?: Record<string, unknown>;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/** The ancestree mark, between two blocks; in the editor, with a button that takes it off. */
function BlockMark({ onRemove }: { onRemove?: () => void }) {
  return (
    <span data-mark className="group/mark relative flex justify-center py-1">
      <LogoMark className="size-5" />
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1/2 left-1/2 ml-5 -translate-y-1/2 rounded-full px-1.5 text-[10px] text-muted-foreground opacity-0 group-hover/mark:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          remove
        </button>
      ) : null}
    </span>
  );
}

/**
 * Where the editor's preview puts a mark: a button over the gap before a
 * block, shown only between two top-level blocks with no mark already
 * there (`[&>[data-mark-slot]…]` on the container), faint while the post is
 * hovered and full over its own gap. It takes no room of its own.
 */
function MarkSlot({ onAdd }: { onAdd: () => void }) {
  return (
    <span data-mark-slot className="relative -my-1.5 hidden h-0">
      <span className="group/slot absolute inset-x-0 -top-1.5 z-10 flex h-3 items-center justify-center">
        <button
          type="button"
          onClick={onAdd}
          aria-label="add the mark here"
          title="add the mark here"
          className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] leading-none text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/marks:opacity-50 group-hover/slot:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          +
          <LogoMark className="size-3" />
        </button>
      </span>
    </span>
  );
}

const MARKABLE_BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "table"] as const;

/** The components with an `hr` that draws the marks. */
function markComponents(onRemove?: (start: number, end: number) => void): Components {
  return {
    ...components,
    hr: ({ node }) => {
      const n = node as HastNode | undefined;
      if (!n?.properties?.dataMark) return <hr className="border-border" />;
      const start = n.position?.start.offset;
      const end = n.position?.end.offset;
      return (
        <BlockMark
          onRemove={
            onRemove && start !== undefined && end !== undefined
              ? () => onRemove(start, end)
              : undefined
          }
        />
      );
    },
  };
}

/** The same, each block preceded by a place to put a mark (the editor's preview). */
function editableComponents(body: string, onChange: (body: string) => void): Components {
  const marked = markComponents((start, end) => onChange(withoutBlogMarkAt(body, start, end)));
  return Object.fromEntries(
    Object.entries(marked).map(([tag, Component]) => {
      if (!(MARKABLE_BLOCKS as readonly string[]).includes(tag) || typeof Component !== "function") {
        return [tag, Component];
      }
      const WithSlot = (props: Record<string, unknown>) => {
        const offset = (props.node as HastNode | undefined)?.position?.start.offset;
        return (
          <>
            {offset !== undefined ? (
              <MarkSlot onAdd={() => onChange(withBlogMarkAt(body, offset))} />
            ) : null}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(Component as any)(props)}
          </>
        );
      };
      WithSlot.displayName = `WithSlot(${tag})`;
      return [tag, WithSlot];
    }),
  );
}

const MARKED = markComponents();

export function StoryMarkdown({
  children,
  className,
  marks = false,
  onMarksChange,
}: {
  children: string;
  className?: string;
  /** A library post: its `<!-- ancestree -->` lines drawn as the mark. */
  marks?: boolean;
  /**
   * The editor's preview: a button between the blocks puts the mark
   * there and one on each mark takes it off, handing back the new text.
   */
  onMarksChange?: (body: string) => void;
}) {
  const editable = marks && !!onMarksChange;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 leading-relaxed break-words",
        editable &&
          "group/marks [&>[data-mark-slot]:not(:first-child):not([data-mark]+*)]:block",
        className,
      )}
    >
      <Markdown
        remarkPlugins={marks ? [remarkGfm, remarkBlogMarks] : [remarkGfm]}
        components={
          editable ? editableComponents(children, onMarksChange) : marks ? MARKED : components
        }
      >
        {children}
      </Markdown>
    </div>
  );
}
