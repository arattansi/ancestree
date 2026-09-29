/**
 * Links that open a chat app with a message typed out and nothing sent: the
 * member picks the chat (a family group, say) and presses send themselves.
 * The family link (Step 52) and Upcoming's Share (Step 89) use them.
 */

/** Opens WhatsApp (the app, or WhatsApp Web) with `text` ready to send. */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Opens Messages with `text` ready to send: iMessage on an iPhone or a Mac,
 * the phone's messages app on Android. `sms:?&body=` is the form both iOS
 * and Android read.
 */
export function messagesHref(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

/**
 * Whether this device has a Messages app an `sms:` link opens: Apple's and
 * Android's. A Windows or Linux browser would do nothing with it.
 */
export function hasMessagesApp(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Macintosh|Android/.test(userAgent);
}
