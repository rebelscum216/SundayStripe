"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="Enter password"
          className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-0 transition focus:border-[#f45b52] focus:ring-1 focus:ring-[#f45b52]/40"
        />
      </div>

      {state?.error && (
        <p className="text-sm font-medium text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-[#f45b52] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#e04840] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in →"}
      </button>
    </form>
  );
}
