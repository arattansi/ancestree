import { AccountTypeGlyph } from "@/components/account-type-badge";
import { INVITED_AS } from "@/lib/account-types";

/**
 * What an invite lets someone do, beside the address it goes to: whoever
 * sends it, they join as a Leaf (Step 34), said in plain words since Step
 * 171 — the name can wait until a Root has someone to make a Branch.
 */
export function JoinsAsNote() {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <AccountTypeGlyph type={INVITED_AS} tinted className="mt-0.5" />
      <span>They can add their own side of the family.</span>
    </p>
  );
}
