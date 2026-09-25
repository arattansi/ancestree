import { describe, expect, it } from "vitest";

import {
  isWholeSignInCode,
  readSignInCode,
  sendCodeRefusal,
  SIGN_IN_CODE_LENGTH,
  signInCodeRefusal,
} from "@/lib/sign-in-code";

const WHOLE = "12345678".slice(0, SIGN_IN_CODE_LENGTH);

describe("readSignInCode", () => {
  it("keeps a typed code as it is", () => {
    expect(readSignInCode(WHOLE)).toBe(WHOLE);
  });

  it("drops the spaces, dashes and words a paste brings", () => {
    expect(readSignInCode(`${WHOLE.slice(0, 4)} ${WHOLE.slice(4)}`)).toBe(WHOLE);
    expect(readSignInCode(`${WHOLE.slice(0, 4)}-${WHOLE.slice(4)}`)).toBe(WHOLE);
    expect(readSignInCode(` Your code: ${WHOLE}\n`)).toBe(WHOLE);
  });

  it("stops at the code's length", () => {
    expect(readSignInCode(`${WHOLE}999`)).toBe(WHOLE);
  });

  it("gives nothing for nothing", () => {
    expect(readSignInCode("")).toBe("");
    expect(readSignInCode("code")).toBe("");
  });
});

describe("isWholeSignInCode", () => {
  it("wants every digit", () => {
    expect(isWholeSignInCode(WHOLE)).toBe(true);
    expect(isWholeSignInCode(WHOLE.slice(1))).toBe(false);
    expect(isWholeSignInCode("")).toBe(false);
  });

  it("wants digits only", () => {
    expect(isWholeSignInCode(`${WHOLE.slice(1)}a`)).toBe(false);
    expect(isWholeSignInCode(` ${WHOLE.slice(1)}`)).toBe(false);
  });
});

describe("refusals", () => {
  it("says a wrong code and a stale one the same way", () => {
    expect(signInCodeRefusal("otp_expired")).toBe("That code is wrong or has expired.");
    expect(signInCodeRefusal(undefined)).toBe("That code is wrong or has expired.");
  });

  it("asks for a pause when there were too many tries", () => {
    expect(signInCodeRefusal("over_request_rate_limit")).toMatch(/Too many tries/);
  });

  it("asks for a minute between codes", () => {
    expect(sendCodeRefusal("over_email_send_rate_limit")).toMatch(/Wait a minute/);
    expect(sendCodeRefusal(undefined)).toBe("Could not send the code. Try again shortly.");
  });
});
