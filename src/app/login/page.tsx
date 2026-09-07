"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Login failed.");
      }
      router.push(params.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-mint-900 p-2">
          <Lock className="h-5 w-5 text-mint-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Launchpad</h1>
          <p className="text-xs text-ink-400">Private. One user.</p>
        </div>
      </div>

      <label className="mb-2 block text-xs font-medium text-ink-300" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        className="field font-mono"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? <p className="mt-3 text-xs text-danger-500">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="mt-5 w-full rounded-lg bg-mint-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-mint-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
