"use client";
import { useState, useTransition } from "react";
import { signIn, signInWithPassword, signUp } from "../../actions";
import type { ActionResult } from "../../../lib/validation";

type Mode = "password" | "signup" | "link";
const modes: Record<
  Mode,
  {
    action: (previous: ActionResult, form: FormData) => Promise<ActionResult>;
    submit: string;
    pending: string;
  }
> = {
  password: {
    action: signInWithPassword,
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    action: signUp,
    submit: "Create account",
    pending: "Creating account…",
  },
  link: {
    action: signIn,
    submit: "Email me a sign-in link",
    pending: "Requesting link…",
  },
};

export default function SignInForm() {
  const [mode, setMode] = useState<Mode>("password");
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
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
            // A successful password sign-in redirects and never resolves here.
            setState(await modes[mode].action({}, form));
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      {mode !== "link" && (
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
        {pending ? modes[mode].pending : modes[mode].submit}
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
        {mode !== "link" && (
          <button type="button" onClick={() => switchTo("link")}>
            Forgot your password? Email me a link
          </button>
        )}
      </div>
    </form>
  );
}
