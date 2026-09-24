import { AccountTypeGlyph } from "@/components/account-type-badge";
import { INVITED_AS } from "@/lib/account-types";

/**
 * What an invite makes someone (Step 34): a Leaf, whoever sends it, so every
 * invite form says so rather than asking.
 */
export function JoinsAsNote() {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <AccountTypeGlyph type={INVITED_AS} tinted className="mt-0.5" />
      <span>
        They&rsquo;ll join as a{" "}
        <span className="font-medium text-foreground">{INVITED_AS.name}</span>.
      </span>
    </p>
  );
}
