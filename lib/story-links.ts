/**
 * A story's public link (Step 88.4): `/shared/story/<token>`, which opens
 * the story read-only for anyone who has it. Tokens are 144 random bits,
 * URL-safe base64 (`story_links.token`); nothing else is looked up.
 */
const TOKEN = /^[A-Za-z0-9_-]{24}$/;

/** Could this be a story link's token? Anything else isn't asked about. */
export function isStoryToken(token: string): boolean {
  return TOKEN.test(token);
}

/** The public page a token opens. */
export function storyLinkPath(token: string): string {
  return `/shared/story/${token}`;
}
