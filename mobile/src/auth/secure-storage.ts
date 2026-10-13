import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the Supabase session lives: the iOS Keychain (Android Keystore),
 * through expo-secure-store. A session is bigger than SecureStore likes
 * one value to be (2 KB), so it is kept in chunks, with the count under the
 * key itself. In a browser (the dev preview only) it is localStorage.
 */
const CHUNK = 1800;

const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function removeChunks(key: string, from: number, to: number) {
  for (let i = from; i < to; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(key));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A half-written session is no session.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const before = Number(await SecureStore.getItemAsync(key)) || 0;
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      );
    }
    await SecureStore.setItemAsync(key, String(count));
    await removeChunks(key, count, before);
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(key)) || 0;
    await SecureStore.deleteItemAsync(key);
    await removeChunks(key, 0, count);
  },
};

const webStorage = {
  getItem: async (key: string) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

export const sessionStorage =
  Platform.OS === "web" ? webStorage : nativeStorage;
