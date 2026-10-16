import { describe, expect, it } from "vitest";

import { daysLeft, daysSince, reminderStageDue } from "@/lib/invite-reminders";

const sent = "2026-10-01T16:00:00Z";
const at = (iso: string) => new Date(iso);

describe("daysSince", () => {
  it("counts whole days, as the database's interval does", () => {
    expect(daysSince(sent, at("2026-10-06T15:59:59Z"))).toBe(4);
    expect(daysSince(sent, at("2026-10-06T16:00:00Z"))).toBe(5);
  });
});

describe("reminderStageDue", () => {
  it("is nothing before day 5", () => {
    expect(reminderStageDue(sent, [], at("2026-10-05T16:00:00Z"))).toBeNull();
  });

  it("is day 5's on day 5, once", () => {
    expect(reminderStageDue(sent, [], at("2026-10-06T16:00:00Z"))).toBe(1);
    expect(reminderStageDue(sent, [1], at("2026-10-07T16:00:00Z"))).toBeNull();
    expect(reminderStageDue(sent, [1], at("2026-10-25T16:00:00Z"))).toBeNull();
  });

  it("is day 25's on day 25, once", () => {
    expect(reminderStageDue(sent, [1], at("2026-10-26T16:00:00Z"))).toBe(2);
    expect(reminderStageDue(sent, [1, 2], at("2026-10-27T16:00:00Z"))).toBeNull();
  });

  it("passes over a missed day 5 once day 25's is due", () => {
    expect(reminderStageDue(sent, [], at("2026-10-28T16:00:00Z"))).toBe(2);
  });

  it("never goes back to day 5 after day 25's", () => {
    expect(reminderStageDue(sent, [2], at("2026-10-28T16:00:00Z"))).toBeNull();
  });
});

describe("daysLeft", () => {
  it("counts a part day as one", () => {
    expect(daysLeft("2026-10-31T16:00:00Z", at("2026-10-26T16:00:00Z"))).toBe(5);
    expect(daysLeft("2026-10-31T16:00:00Z", at("2026-10-26T17:00:00Z"))).toBe(5);
    expect(daysLeft("2026-10-31T16:00:00Z", at("2026-10-31T15:00:00Z"))).toBe(1);
  });
});
