/**
 * The days a member used ancestree (Step 56), for the beta reviewers'
 * dashboard. The proxy calls `note_active_day()` for a signed-in member,
 * but only on the first of their requests each day to reach a server:
 * `NotedToday` remembers who that server has noted since midnight UTC,
 * which is how the database counts days.
 */

/** The UTC day a moment falls on, `YYYY-MM-DD`, as `private.utc_day` has it. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Who one server has noted today. Starts afresh with each new day. */
export class NotedToday {
  private day = "";
  private readonly users = new Set<string>();

  /** True the first time a member is seen on `today`, and holds them to it. */
  claim(userId: string, today: string): boolean {
    if (today !== this.day) {
      this.day = today;
      this.users.clear();
    }
    if (this.users.has(userId)) return false;
    this.users.add(userId);
    return true;
  }

  /** Lets them be claimed again: signed in, but not a member yet. */
  release(userId: string): void {
    this.users.delete(userId);
  }
}
