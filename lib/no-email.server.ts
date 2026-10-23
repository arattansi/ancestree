import "server-only";

import { randomInt } from "node:crypto";

import { sendEmail } from "@/lib/email";
import { addEmailCodeEmail } from "@/lib/emails/add-email-code";
import { SIGN_IN_CODE_LENGTH } from "@/lib/sign-in-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Why a code to add an email wasn't sent (Step 202.4). */
export type AddEmailSendRefusal = "has_email" | "taken" | "too_soon" | "failed";

/** Why a code to add an email didn't add it. */
export type AddEmailConfirmRefusal = "wrong" | "expired" | "taken" | "failed";

/**
 * A member with no email asks to add one (Step 202.4): a fresh 6-digit code,
 * kept hashed (`begin_add_email`) and sent to that address by us, not
 * Supabase, whose email change would also want a yes from the address they
 * don't have. One a minute.
 */
export async function sendAddEmailCode(
  userId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: AddEmailSendRefusal }> {
  const code = String(randomInt(0, 10 ** SIGN_IN_CODE_LENGTH)).padStart(
    SIGN_IN_CODE_LENGTH,
    "0",
  );
  const { error } = await createAdminClient().rpc("begin_add_email", {
    p_user: userId,
    p_email: email,
    p_code: code,
  });
  if (error) {
    const message = error.message;
    return {
      ok: false,
      reason: message.includes("EMAIL_TAKEN")
        ? "taken"
        : message.includes("TOO_SOON")
          ? "too_soon"
          : message.includes("HAS_EMAIL")
            ? "has_email"
            : "failed",
    };
  }
  const sent = await sendEmail({ to: email, ...addEmailCodeEmail(code) });
  return sent.ok ? { ok: true } : { ok: false, reason: "failed" };
}

/**
 * The code entered (Step 202.4): when it's right, the address becomes the
 * account's, confirmed, and this browser's session is refreshed so it
 * carries the new one. They're an ordinary member from here: sign-in links
 * stop working for them, and the emails members get start.
 */
export async function confirmAddEmail(
  userId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: AddEmailConfirmRefusal }> {
  const admin = createAdminClient();
  const { data: email, error } = await admin.rpc("confirm_add_email", {
    p_user: userId,
    p_code: code,
  });
  if (error) {
    return { ok: false, reason: error.message.includes("CODE_EXPIRED") ? "expired" : "failed" };
  }
  if (!email) return { ok: false, reason: "wrong" };

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (updateError) {
    return { ok: false, reason: updateError.code === "email_exists" ? "taken" : "failed" };
  }
  const supabase = await createClient();
  await supabase.auth.refreshSession();
  return { ok: true };
}
