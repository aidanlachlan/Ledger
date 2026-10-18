"use client";
import { useRef, useState, useTransition } from "react";
import { setPassword } from "../actions";
import type { ActionResult } from "../../lib/validation";
export default function PasswordForm({ email }: { email: string }) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            const result = await setPassword({}, form);
            setState(result);
            if (result.success) formRef.current?.reset();
          } catch {
            setState({
              error: "The connection was interrupted. Please retry.",
            });
          }
        });
      }}
    >
      <fieldset disabled={pending} className="stack">
        <legend>Password</legend>
        <p className="helper">
          Set or change the password for {email}, so you can sign in without an
          email link.
        </p>
        {/* Lets password managers save the new password under this email. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <label>
          New password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
          <span className="helper">At least 8 characters.</span>
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </label>
      </fieldset>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="notice success">
          {state.success}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending ? "Saving password…" : "Save password"}
      </button>
    </form>
  );
}
