"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <form onSubmit={submit} className="w-full max-w-[380px]">
      <p className="eyebrow mb-3">Solana · Issuance desk</p>
      <h1 className="display mb-1 text-[56px]">Launchpad</h1>
      <p className="annot mb-10">One key, one operator, one door.</p>

      <div className="border-t-[1.5px] border-[color:var(--rule-hard)] pt-6">
        <label className="eyebrow mb-2 block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="ctl"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? <p className="mt-3 text-[12px] text-signal">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="btn mt-7 w-full"
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
