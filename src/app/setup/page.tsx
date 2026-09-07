import { Logo } from "@/components/Logo";

/**
 * Shown when the deployment has no secrets configured. Without this a fresh
 * deploy just 500s on the first request with nothing to act on.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-10 flex items-center gap-3">
        <Logo size={30} />
        <span className="display text-[30px] leading-none">Launchpad</span>
      </div>

      <h1 className="display mb-4 text-[clamp(34px,5vw,52px)]">Two secrets to set</h1>
      <p className="annot mb-10 max-w-[52ch]">
        The app is deployed and built, but it will not authenticate anyone until these exist.
        Add them to the project&apos;s environment variables and redeploy.
      </p>

      <div className="panel mb-9">
        <p className="eyebrow mb-3">1 · APP_PASSWORD</p>
        <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
          The password that gets you in. Choose anything long; it is the only door.
        </p>
      </div>

      <div className="panel mb-9">
        <p className="eyebrow mb-3">2 · AUTH_SECRET</p>
        <p className="mb-3 text-[13.5px] leading-relaxed text-ink-soft">
          Signs the session cookie. Generate a random one — never reuse a password here:
        </p>
        <pre className="sheet data overflow-x-auto p-3 text-[12px]">openssl rand -hex 32</pre>
      </div>

      <div className="panel">
        <p className="eyebrow mb-3">Optional</p>
        <dl className="space-y-2">
          <div className="datum">
            <dt>NEXT_PUBLIC_MAINNET_RPC</dt>
            <span className="leader" aria-hidden />
            <dd>needed before live use</dd>
          </div>
          <div className="datum">
            <dt>ANTHROPIC_API_KEY</dt>
            <span className="leader" aria-hidden />
            <dd>the assistant</dd>
          </div>
          <div className="datum">
            <dt>PINATA_JWT</dt>
            <span className="leader" aria-hidden />
            <dd>image + metadata upload</dd>
          </div>
        </dl>
      </div>

      <p className="annot mt-10">
        This screen disappears on its own once both required values are present.
      </p>
    </main>
  );
}
