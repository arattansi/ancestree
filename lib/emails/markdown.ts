import type { Definition, PhrasingContent, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { escapeHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

const TEXT = "font-size:15px;line-height:1.6;";
const DARK = "color:#0a0a0a;";
const MUTED = "color:#737373;";
const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;";

/** What a block needs from the ones around it. */
type Context = {
  /** `[words][name]` links, by name. */
  definitions: Map<string, Definition>;
  /** Inside a quotation: the words greyed, as on a story. */
  quoted: boolean;
};

const parser = unified().use(remarkParse).use(remarkGfm);

/**
 * Markdown someone wrote, as email HTML (Step 159): the newsletter's note.
 * Bold, italics, strikethrough, links (an address on its own too), lists,
 * headings, quotations, a line across, code and tables, each styled inline,
 * as an inbox wants. Safe to send whatever was written: everything is
 * escaped, raw HTML stays the text it was, a picture is only its
 * description (an address someone chose would load from their server), and
 * a link goes only to a web or mail address; "/library" means ours. A
 * single line break stays one, as the plain notes before this were written.
 */
export function markdownEmailHtml(markdown: string): string {
  const tree = parser.parse(markdown) as Root;
  const definitions = new Map<string, Definition>();
  for (const node of tree.children) {
    if (node.type === "definition") definitions.set(node.identifier, node);
  }
  return blocks(tree.children, { definitions, quoted: false });
}

function blocks(nodes: readonly RootContent[], ctx: Context): string {
  return nodes
    .filter((n) => n.type !== "definition")
    .map((n, i) => block(n, i === 0 ? "margin:0;" : "margin:12px 0 0;", ctx))
    .join("");
}

function block(node: RootContent, margin: string, ctx: Context): string {
  const color = ctx.quoted ? MUTED : DARK;
  switch (node.type) {
    case "paragraph":
      return `<p style="${margin}${TEXT}${color}">${inline(node.children, ctx)}</p>`;
    case "heading": {
      const size = node.depth === 1 ? 18 : node.depth === 2 ? 16 : 15;
      return `<p style="${margin}font-size:${size}px;line-height:1.4;font-weight:600;${color}">${inline(node.children, ctx)}</p>`;
    }
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start =
        node.ordered && node.start != null && node.start !== 1
          ? ` start="${node.start}"`
          : "";
      const items = node.children.map((item, i) => {
        const gap = i === 0 ? "" : "margin-top:4px;";
        // A tight list's points are a line each, not paragraphs.
        const body = node.spread
          ? blocks(item.children, ctx)
          : item.children
              .map((c) =>
                c.type === "paragraph" ? inline(c.children, ctx) : block(c, "margin:4px 0 0;", ctx),
              )
              .join("");
        return `<li style="${gap}">${body}</li>`;
      });
      return `<${tag}${start} style="${margin}padding:0 0 0 24px;${TEXT}${color}">${items.join("")}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote style="${margin}padding:0 0 0 12px;border-left:2px solid #e5e5e5;">${blocks(node.children, { ...ctx, quoted: true })}</blockquote>`;
    case "thematicBreak":
      return `<div style="${margin}height:1px;background-color:#e5e5e5;line-height:1px;font-size:0;">&nbsp;</div>`;
    case "code":
      return `<pre style="${margin}padding:12px;border-radius:6px;background-color:#f5f5f5;${MONO}font-size:13px;line-height:1.5;white-space:pre-wrap;${DARK}">${escapeHtml(node.value)}</pre>`;
    case "html":
      return `<p style="${margin}${TEXT}${color}">${lines(node.value)}</p>`;
    case "table": {
      const rows = node.children.map(
        (row, r) =>
          `<tr>${row.children
            .map(
              (cell) =>
                `<td style="padding:4px 8px;border:1px solid #e5e5e5;font-size:14px;line-height:1.5;${r === 0 ? "font-weight:600;" : ""}${color}">${inline(cell.children, ctx)}</td>`,
            )
            .join("")}</tr>`,
      );
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${margin}border-collapse:collapse;">${rows.join("")}</table>`;
    }
    default:
      // A footnote, say: its words, so nothing written is lost.
      return "children" in node
        ? blocks(node.children as RootContent[], ctx)
        : "value" in node
          ? `<p style="${margin}${TEXT}${color}">${lines(node.value)}</p>`
          : "";
  }
}

function inline(nodes: readonly PhrasingContent[], ctx: Context): string {
  return nodes.map((n) => phrase(n, ctx)).join("");
}

function phrase(node: PhrasingContent, ctx: Context): string {
  switch (node.type) {
    case "text":
    case "html":
      return lines(node.value);
    case "strong":
      return `<strong style="font-weight:600;">${inline(node.children, ctx)}</strong>`;
    case "emphasis":
      return `<em>${inline(node.children, ctx)}</em>`;
    case "delete":
      return `<s>${inline(node.children, ctx)}</s>`;
    case "inlineCode":
      return `<code style="padding:1px 4px;border-radius:4px;background-color:#f5f5f5;${MONO}font-size:13px;">${escapeHtml(node.value)}</code>`;
    case "break":
      return "<br />";
    case "link":
      return linkTo(node.url, inline(node.children, ctx), ctx);
    case "linkReference": {
      const words = inline(node.children, ctx);
      const definition = ctx.definitions.get(node.identifier);
      return definition ? linkTo(definition.url, words, ctx) : words;
    }
    case "image":
    case "imageReference":
      return node.alt ? `<em>${escapeHtml(node.alt)}</em>` : "";
    default:
      return "";
  }
}

/** Escaped, each line break kept. */
function lines(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br />");
}

function linkTo(url: string, words: string, ctx: Context): string {
  const href = safeHref(url);
  if (!href) return words;
  const color = ctx.quoted ? MUTED : DARK;
  return `<a href="${escapeHtml(href)}" style="${color}text-decoration:underline;">${words}</a>`;
}

/**
 * Where a link may go: a web or mail address, "ancestree.space/…" with its
 * https:// left off, or a path on our own site. Anything else (javascript:,
 * data:, a bare word) is no link at all.
 */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return `${getSiteUrl()}${u}`;
  const withScheme = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u) ? `https://${u}` : u;
  try {
    const parsed = new URL(withScheme);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
