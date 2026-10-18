"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "../../../lib/supabase/browser";
import { passwordInput, type ActionResult } from "../../../lib/validation";

type Mode = "password" | "signup" | "link" | "reset";
const email = z.email().max(254);

// Auth calls run in the browser so Supabase's per-IP rate limits count each
// visitor separately instead of the server's shared address.
async function submit(
  mode: Mode,
  form: FormData,
  origin: string,
): Promise<ActionResult & { signedIn?: boolean }> {
  const supabase = createClient();
  const callbackUrl = `${origin}/auth/callback`;
  if (mode === "reset") {
    const parsed = z.object({ email }).safeParse({ email: form.get("email") });
    if (!parsed.success) return { error: "Enter a valid email address." };
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: `${origin}/auth/reset` },
    );
    if (error)
      return {
        error: "The reset link could not be requested. Please try again shortly.",
      };
    return {
      success:
        "If there's an account for that email, a reset link is on its way. Open it in this browser to choose a new password.",
    };
  }
  if (mode === "link") {
    const parsed = z.object({ email }).safeParse({ email: form.get("email") });
    if (!parsed.success) return { error: "Enter a valid email address." };
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: callbackUrl, shouldCreateUser: true },
    });
    if (error)
      return {
        error:
          "The sign-in link could not be requested. Please try again shortly.",
      };
    return {
      success:
        "If email delivery is available, a sign-in link is on its way. Open it in this browser.",
    };
  }
  if (mode === "password") {
    const parsed = z
      .object({ email, password: z.string().min(1).max(72) })
      .safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) return { error: "Enter your email and password." };
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error?.code === "email_not_confirmed")
      return {
        error: "Confirm your email first using the link we sent, then sign in.",
      };
    if (error)
      return {
        error:
          "That email and password don't match. If you haven't set a password yet, sign in with an email link.",
      };
    return { signedIn: true };
  }
  const parsed = z
    .object({ email, password: passwordInput })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: callbackUrl },
  });
  if (error?.code === "weak_password")
    return { error: "Choose a stronger password." };
  if (error)
    return {
      error: "Your account could not be created. Please try again shortly.",
    };
  // With email confirmation off, Supabase signs the user in immediately.
  if (data.session) return { signedIn: true };
  return {
    success:
      "Check your email and open the confirmation link in this browser. After that, you can sign in with your password.",
  };
}

const labels: Record<Mode, { submit: string; pending: string }> = {
  password: { submit: "Sign in", pending: "Signing in…" },
  signup: { submit: "Create account", pending: "Creating account…" },
  link: { submit: "Email me a sign-in link", pending: "Requesting link…" },
  reset: { submit: "Email me a reset link", pending: "Requesting link…" },
};

export default function SignInForm({ origin }: { origin: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const [emailValue, setEmailValue] = useState("");
  const router = useRouter();
  const switchTo = (next: Mode) => {
    setMode(next);
    setState({});
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            const result = await submit(mode, form, origin);
            if (result.signedIn) {
              router.push("/");
              router.refresh();
            } else setState(result);
          } catch {
            setState({
              error: "The connection was interrupted. Please retry.",
            });
          }
        });
      }}
      className="stack"
    >
      <label>
        Email address
        <input
          type="email"
          name="email"
          autoComplete={mode === "signup" ? "email" : "username"}
          required
          maxLength={254}
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      {(mode === "password" || mode === "signup") && (
        <label>
          Password
          <input
            key={mode}
            type="password"
            name="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "signup" ? 8 : 1}
            maxLength={72}
          />
          {mode === "signup" && (
            <span className="helper">At least 8 characters.</span>
          )}
        </label>
      )}
      <button className="primary" disabled={pending}>
        {pending ? labels[mode].pending : labels[mode].submit}
      </button>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
      <div className="auth-switch">
        {mode !== "password" && (
          <button type="button" onClick={() => switchTo("password")}>
            Sign in with a password
          </button>
        )}
        {mode !== "signup" && (
          <button type="button" onClick={() => switchTo("signup")}>
            New here? Create an account
          </button>
        )}
        {mode !== "reset" && (
          <button type="button" onClick={() => switchTo("reset")}>
            Forgot your password?
          </button>
        )}
        {mode !== "link" && (
          <button type="button" onClick={() => switchTo("link")}>
            Sign in with an email link instead
          </button>
        )}
      </div>
    </form>
  );
}
