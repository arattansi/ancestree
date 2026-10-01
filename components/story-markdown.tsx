import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export function StoryMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 leading-relaxed break-words", className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
