import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Every button is lower-case (Step 102, docs/design-system.md "Buttons:
 * lower-case"): its words, what it says while it works, a dialog's confirm
 * and cancel, a toast's action and an email's call to action. Names keep
 * their capitals, so a person's or a tree's comes in as `{name}` and other
 * products' are listed below. Section headings that open and close are
 * titles, and cards and pickers that are buttons show names and details:
 * those files are left out.
 */

const ROOT = path.resolve(__dirname, "..");

/**
 * Words that keep their capitals: other products' names, and what sits
 * inside a button without being its words.
 */
const NAMES = [
  "WhatsApp",
  "JSON",
  "Markdown",
  " · Your entry", // the caption on a person's photo, which opens it
  "Someone on the tree", // stands in for a person's name
  "Visiting", // a badge in the tree switcher
];

/** Files whose buttons hold titles or entries, not a button's own words. */
const NOT_BUTTON_WORDS = new Set([
  "components/tree/getting-started.tsx", // the list's title opens it
  "components/tree/folded-details.tsx", // a card's details
  "components/tree/person-picker.tsx", // a picked person's details
  "components/tree/person-companions.tsx", // a companion's name and years
]);

/** Elements whose words are a button's, and wrappers that put theirs in one. */
const BUTTONS =
  /^(button|Button|[A-Z]\w*Button|TreeTarget|ToggleLink|\w*NavLink|\w*\.?Close|DropdownMenuTrigger|RequestInviteDialog|RequestAccessDialog|BetaWaitlistDialog)$/;
const LABEL_PROPS = new Set(["confirmLabel", "pendingLabel", "cancelLabel", "submitLabel", "yesLabel"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function hasCapital(text: string): boolean {
  const stripped = NAMES.reduce((t, name) => t.split(name).join(""), text);
  return /[A-Z]/.test(stripped);
}

/** "file:line  words" for each button's words with a capital in them. */
function capitalised(file: string): string[] {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    if (hasCapital(text)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push(`${file}:${line}  ${text.trim()}`);
    }
  };
  const isScreenReaderOnly = (node: ts.Node) =>
    ts.isJsxElement(node.parent) &&
    /sr-only/.test(node.parent.openingElement.attributes.getText());

  // The words inside a button: its text, and strings it shows.
  const words = (node: ts.Node) => {
    ts.forEachChild(node, function visit(child) {
      if (ts.isJsxAttributes(child)) return;
      if (ts.isJsxText(child)) {
        if (!isScreenReaderOnly(child)) report(child, child.getText());
        return;
      }
      if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
        if (!ts.isCallExpression(child.parent)) report(child, child.text);
        return;
      }
      if (ts.isTemplateExpression(child)) {
        report(child, [child.head.text, ...child.templateSpans.map((s) => s.literal.text)].join(" "));
        return;
      }
      ts.forEachChild(child, visit);
    });
  };

  const labelText = (init: ts.Node | undefined): ts.StringLiteral | null => {
    if (!init) return null;
    if (ts.isStringLiteral(init)) return init;
    if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
      return init.expression;
    }
    return null;
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const rendersButton = opening.attributes.properties.some(
        (a) =>
          ts.isJsxAttribute(a) &&
          ((a.name.getText() === "render" && /<(Button|button)\b/.test(a.initializer?.getText() ?? "")) ||
            (a.name.getText() === "className" && /buttonVariants\(/.test(a.initializer?.getText() ?? ""))),
      );
      if (BUTTONS.test(opening.tagName.getText()) || rendersButton) words(node);
    }
    // confirmLabel="Delete", pendingLabel="Saving…", <JoinTreeButton label="…">
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText();
      const tag = (node.parent.parent as ts.JsxOpeningLikeElement).tagName.getText();
      const literal = labelText(node.initializer);
      if (literal && (LABEL_PROPS.has(name) || (name === "label" && BUTTONS.test(tag)))) {
        report(literal, literal.text);
      }
    }
    // { confirmLabel: "Delete" }, a toast's { action: { label: "Undo" } },
    // an email's { cta: { label: "…" } }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const parentKey =
        ts.isObjectLiteralExpression(node.parent) &&
        ts.isPropertyAssignment(node.parent.parent) &&
        ts.isIdentifier(node.parent.parent.name)
          ? node.parent.parent.name.text
          : null;
      if (LABEL_PROPS.has(name) || (name === "label" && (parentKey === "action" || parentKey === "cta"))) {
        const init = node.initializer;
        const literals = ts.isConditionalExpression(init)
          ? [init.whenTrue, init.whenFalse]
          : [init];
        for (const l of literals) {
          if (ts.isStringLiteral(l) || ts.isNoSubstitutionTemplateLiteral(l)) report(l, l.text);
        }
      }
    }
    // A default: function Form({ submitLabel = "email me a code" })
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      LABEL_PROPS.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      report(node.initializer, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("buttons are lower-case (Step 102)", () => {
  it("has no capital letter in any button's own words", () => {
    const files = ["app", "components", "lib"]
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => !NOT_BUTTON_WORDS.has(file));
    expect(files.flatMap(capitalised)).toEqual([]);
  });

  it("catches a capital, and lets names through", () => {
    const dir = fs.mkdtempSync(path.join(ROOT, "lib", ".button-case-"));
    const file = path.join(dir, "probe.tsx");
    try {
      fs.writeFileSync(
        file,
        [
          `<Button>Save</Button>;`,
          `<Button>share on WhatsApp</Button>;`,
          `<Button>open {treeName}</Button>;`,
          `<ConfirmButton confirm={{ confirmLabel: "Delete" }}>delete</ConfirmButton>;`,
          `toast("Saved.", { action: { label: "Undo" } });`,
          `send({ cta: { label: "Open My Family Tree", url } });`,
          `<button><span className="sr-only">Close</span></button>;`,
          `function Form({ submitLabel = "Email me a code" }) {}`,
        ].join("\n"),
      );
      const found = capitalised(path.relative(ROOT, file)).map((f) => f.split("  ")[1]);
      expect(found).toEqual(["Save", "Delete", "Undo", "Open My Family Tree", "Email me a code"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
