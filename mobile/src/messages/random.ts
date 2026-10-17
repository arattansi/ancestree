import { getRandomValues, randomUUID } from "expo-crypto";

/*
 * Hermes has no Web Crypto, and the messaging keys (`@/lib/e2e/crypto`,
 * `@noble/*`) take their randomness from `crypto.getRandomValues`: give it
 * the phone's own, through expo-crypto (Step 179.1). Imported first, in the
 * root layout. A browser (the dev preview) keeps its own.
 */
const scope = globalThis as { crypto?: Partial<Crypto> };
if (typeof scope.crypto?.getRandomValues !== "function") {
  scope.crypto = Object.assign(scope.crypto ?? {}, {
    getRandomValues: getRandomValues as Crypto["getRandomValues"],
    randomUUID: randomUUID as Crypto["randomUUID"],
  });
}
