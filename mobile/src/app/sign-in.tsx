import * as React from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { isAppReviewEmail } from "@/lib/app-review";
import { isEmailAddress } from "@/lib/email-address";
import {
  isWholeSignInCode,
  readSignInCode,
  sendCodeRefusal,
  SIGN_IN_CODE_LENGTH,
  signInCodeRefusal,
} from "@/lib/sign-in-code";
import { supabase } from "@/auth/supabase";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/**
 * Sign in as on the web (Step 53): an email, then the 8-digit code Supabase
 * sends to it, typed or filled in from Mail. Joining a tree stays on the
 * web for now; an address with no tree lands on the "not on a tree" screen.
 * App Review's one address asks for its password instead, since a reviewer
 * can't read the email (Step 176, `@/lib/app-review`).
 */
export default function SignIn() {
  const palette = usePalette();
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [reviewing, setReviewing] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState<"send" | "verify" | "resend" | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  async function send(address: string, again = false) {
    setBusy(again ? "resend" : "send");
    setError(null);
    const { error: refused } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(null);
    if (refused) {
      setError(sendCodeRefusal(refused.code));
      return;
    }
    setSentTo(address);
    setResent(again);
    setCode("");
  }

  async function verify(whole: string) {
    if (!sentTo || busy) return;
    setBusy("verify");
    setError(null);
    const { error: refused } = await supabase.auth.verifyOtp({
      type: "email",
      email: sentTo,
      token: whole,
    });
    // Signed in: the root layout swaps this screen for the tree.
    if (refused) {
      setBusy(null);
      setError(signInCodeRefusal(refused.code));
    }
  }

  async function signInForReview() {
    if (busy || !password) return;
    setBusy("verify");
    setError(null);
    const { error: refused } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (refused) {
      setBusy(null);
      setError(
        refused.code === "invalid_credentials"
          ? "That password isn’t right."
          : "Couldn’t sign in. Try again.",
      );
    }
  }

  function onEmail() {
    const address = email.trim().toLowerCase();
    if (!isEmailAddress(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (isAppReviewEmail(address)) {
      setReviewing(true);
      setError(null);
      return;
    }
    void send(address);
  }

  function onCode(typed: string) {
    const digits = readSignInCode(typed);
    setCode(digits);
    // It sends itself once whole, as the web's box does.
    if (isWholeSignInCode(digits)) void verify(digits);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image
              source={require("../../assets/splash-icon.png")}
              style={styles.mark}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Text style={[styles.wordmark, { color: palette.foreground }]}>
              ancestree
            </Text>
          </View>

          {reviewing ? (
            <View style={styles.form}>
              <Text style={[styles.title, { color: palette.foreground }]}>
                Sign in
              </Text>
              <TextField
                label="Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError(null);
                }}
                onSubmitEditing={() => void signInForReview()}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="go"
                editable={busy !== "verify"}
                error={error}
              />
              <Button
                label="sign in"
                busy={busy === "verify"}
                disabled={!password}
                onPress={() => void signInForReview()}
              />
              <View style={styles.links}>
                <Button
                  variant="link"
                  label="Use another email"
                  onPress={() => {
                    setReviewing(false);
                    setPassword("");
                    setError(null);
                  }}
                />
              </View>
            </View>
          ) : sentTo ? (
            <View style={styles.form}>
              <View accessibilityLiveRegion="polite">
                <Text style={[styles.title, { color: palette.foreground }]}>
                  Check your email
                </Text>
                <Text style={[styles.lead, { color: palette.mutedForeground }]}>
                  {resent ? "We sent a new code to " : "Enter the code we sent to "}
                  <Text style={{ color: palette.foreground, fontFamily: font.medium }}>
                    {sentTo}
                  </Text>
                  .
                </Text>
              </View>
              <TextField
                label="Code"
                value={code}
                onChangeText={onCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                editable={busy !== "verify"}
                placeholder={"0".repeat(SIGN_IN_CODE_LENGTH)}
                maxLength={SIGN_IN_CODE_LENGTH + 4}
                error={error}
                style={styles.code}
              />
              <Button
                label="sign in"
                busy={busy === "verify"}
                disabled={!isWholeSignInCode(code)}
                onPress={() => void verify(code)}
              />
              <View style={styles.links}>
                <Button
                  variant="link"
                  label={busy === "resend" ? "Sending…" : "Send a new code"}
                  disabled={!!busy}
                  onPress={() => void send(sentTo, true)}
                />
                <Button
                  variant="link"
                  label="Use another email"
                  onPress={() => {
                    setSentTo(null);
                    setCode("");
                    setError(null);
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={[styles.title, { color: palette.foreground }]}>
                Sign in
              </Text>
              <TextField
                label="Email address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                }}
                onSubmitEditing={onEmail}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                placeholder="you@example.com"
                error={error}
              />
              <Button
                label="email me a code"
                busy={busy === "send"}
                onPress={onEmail}
              />
            </View>
          )}
          <View style={styles.footer}>
            <Button
              variant="link"
              label="Privacy"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`${SITE}/privacy`)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: GUTTER + 8,
    paddingVertical: 32,
    gap: 40,
  },
  brand: { alignItems: "center", gap: 10 },
  mark: { width: 88, height: 88 },
  wordmark: { fontFamily: font.semibold, fontSize: 28, letterSpacing: -0.5 },
  form: { gap: 16 },
  title: { fontFamily: font.semibold, fontSize: 22 },
  lead: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, marginTop: 4 },
  code: {
    textAlign: "center",
    fontSize: 26,
    letterSpacing: 6,
    fontVariant: ["tabular-nums"],
  },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  footer: { alignItems: "center" },
});
