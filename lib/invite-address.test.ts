import { describe, expect, it } from "vitest";

import { isAnotherAddressRefusal, sentToAnotherAddress } from "@/lib/invite-address";

describe("isAnotherAddressRefusal (Step 51)", () => {
  it("reads redeem_invite's refusal of another address", () => {
    expect(
      isAnotherAddressRefusal(
        "INVITE_FOR_ANOTHER_ADDRESS: this invite was sent to another email address",
      ),
    ).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isAnotherAddressRefusal("invalid_or_expired_invite")).toBe(false);
    expect(isAnotherAddressRefusal("ONE_TREE_EACH: you have already founded a tree")).toBe(false);
    expect(isAnotherAddressRefusal(undefined)).toBe(false);
    expect(isAnotherAddressRefusal(null)).toBe(false);
  });
});

describe("sentToAnotherAddress (Step 51)", () => {
  it("lets the address it was sent to accept it", () => {
    expect(sentToAnotherAddress("mum@example.com", "mum@example.com")).toBe(false);
  });

  it("matches however the invite's address was written", () => {
    expect(sentToAnotherAddress(" Mum@Example.com ", "mum@example.com")).toBe(false);
  });

  it("is someone else's for any other address", () => {
    expect(sentToAnotherAddress("mum@example.com", "aalim@example.com")).toBe(true);
  });

  it("is someone else's for an account with no verified address", () => {
    expect(sentToAnotherAddress("mum@example.com", null)).toBe(true);
  });

  it("leaves a bare link to anyone", () => {
    expect(sentToAnotherAddress(null, "aalim@example.com")).toBe(false);
    expect(sentToAnotherAddress(null, null)).toBe(false);
  });
});
