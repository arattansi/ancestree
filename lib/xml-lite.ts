/**
 * Just enough XML to read a photo's XMP packet (Step 88.6), in the browser
 * and in tests alike, where there's no DOMParser: elements, their
 * attributes and text, each name resolved to its namespace. No DTDs, no
 * entities beyond XML's own, and nothing ever fetched. Whatever it can't
 * make sense of it skips, and it never throws: a photo's metadata is only
 * ever a hint.
 */

export type XmlAttr = { ns: string; name: string; value: string };

export type XmlElement = {
  /** The namespace URI, or "" for none. */
  ns: string;
  /** The local name, without its prefix. */
  name: string;
  attrs: XmlAttr[];
  children: XmlElement[];
  /** The text directly inside it, joined. */
  text: string;
};

export const XML_NS = "http://www.w3.org/XML/1998/namespace";

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function decode(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X"
          ? parseInt(ref.slice(2), 16)
          : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

function split(qname: string): [prefix: string, local: string] {
  const at = qname.indexOf(":");
  return at < 0 ? ["", qname] : [qname.slice(0, at), qname.slice(at + 1)];
}

type Open = { el: XmlElement; qname: string; scope: Map<string, string> };

/**
 * The document's elements, under a nameless root. Unclosed elements close
 * at the end; a stray closing tag closes back to its opener, or is skipped.
 */
export function parseXml(source: string): XmlElement {
  const root: XmlElement = { ns: "", name: "", attrs: [], children: [], text: "" };
  const stack: Open[] = [
    { el: root, qname: "", scope: new Map([["xml", XML_NS]]) },
  ];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(source)) !== null) {
    const top = stack[stack.length - 1];
    const [, cdata, closing, opening, attrText, selfClosing, text] = m;
    if (text !== undefined) {
      top.el.text += decode(text);
    } else if (cdata !== undefined) {
      top.el.text += cdata;
    } else if (closing !== undefined) {
      let at = stack.length - 1;
      while (at > 0 && stack[at].qname !== closing) at--;
      if (at > 0) stack.length = at;
    } else if (opening !== undefined) {
      const scope = new Map(top.scope);
      const raw: [string, string][] = [];
      ATTR.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = ATTR.exec(attrText ?? "")) !== null) {
        const value = decode(a[2] ?? a[3] ?? "");
        if (a[1] === "xmlns") scope.set("", value);
        else if (a[1].startsWith("xmlns:")) scope.set(a[1].slice(6), value);
        else raw.push([a[1], value]);
      }
      const [prefix, local] = split(opening);
      const el: XmlElement = {
        ns: scope.get(prefix) ?? "",
        name: local,
        attrs: raw.map(([qname, value]) => {
          const [p, n] = split(qname);
          // An attribute without a prefix is in no namespace at all.
          return { ns: p ? (scope.get(p) ?? "") : "", name: n, value };
        }),
        children: [],
        text: "",
      };
      top.el.children.push(el);
      if (!selfClosing) stack.push({ el, qname: opening, scope });
    }
  }
  return root;
}

/** Every element under `el` (not `el` itself), in document order. */
export function* descendants(el: XmlElement): Generator<XmlElement> {
  for (const child of el.children) {
    yield child;
    yield* descendants(child);
  }
}
