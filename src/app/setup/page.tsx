import { Logo } from "@/components/Logo";
import { providerLabel } from "@/lib/llm";

/**
 * Must render per-request. Prerendered, this page would report the environment
 * as it stood at build time — which is exactly the state it exists to correct,
 * and it would tell you a variable is set when it is not.
 */
export const dynamic = "force-dynamic";

const present = (name: string) => Boolean(process.env[name]);

function Row({ name, set, note }: { name: string; set: boolean; note: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-rule py-2.5 last:border-b-0">
      <span
        className={`data w-3 shrink-0 text-[13px] font-bold ${set ? "text-verify" : "text-signal"}`}
      >
        {set ? "✓" : "✗"}
      </span>
      <div className="min-w-0">
        <p className="data text-[12.5px]">{name}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{note}</p>
      </div>
      <span className="eyebrow ml-auto shrink-0">{set ? "set" : "missing"}</span>
    </div>
  );
}

/**
 * Shown when the deployment has no secrets configured. Reports which specific
 * variables are missing — a generic "add your env vars" is useless when you
 * have set one of two and cannot tell which took.
 */
export default function SetupPage() {
  const hasPassword = present("APP_PASSWORD");
  const hasSecret = present("AUTH_SECRET");
  const ready = hasPassword && hasSecret;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <div className="mb-10 flex items-center gap-3">
        <Logo size={30} />
        <span className="display text-[30px] leading-none">Launchpad</span>
      </div>

      <h1 className="display mb-4 text-[clamp(32px,5vw,50px)]">
        {ready ? "Configured" : hasPassword || hasSecret ? "Almost there" : "Two secrets to set"}
      </h1>
      <p className="annot mb-10 max-w-[54ch]">
        {ready ? (
          <>
            Both required values are present, so you can{" "}
            <a className="link" href="/login">
              sign in
            </a>
            . This page stays available as a live view of what the running deployment can see.
          </>
        ) : (
          <>
            The app is deployed and built. It will not log anyone in until both of these exist.
            Add them under Settings → Environment Variables — no rebuild needed, they are read
            per request.
          </>
        )}
      </p>

      <section className="panel mb-10">
        <p className="eyebrow mb-4">Required</p>
        <Row
          name="APP_PASSWORD"
          set={hasPassword}
          note="The password that gets you in. Choose a long one."
        />
        <Row
          name="AUTH_SECRET"
          set={hasSecret}
          note="Signs the session cookie. Generate with: openssl rand -hex 32"
        />
      </section>

      <section className="panel mb-10">
        <p className="eyebrow mb-4">Optional</p>
        <Row
          name="OPENROUTER_API_KEY / ANTHROPIC_API_KEY"
          set={providerLabel() !== "not configured"}
          note={
            providerLabel() === "not configured"
              ? "The naming assistant, studio agent and automation stay disabled. Everything else works."
              : `Assistant active: ${providerLabel()}`
          }
        />
        <Row
          name="NEXT_PUBLIC_MAINNET_RPC"
          set={present("NEXT_PUBLIC_MAINNET_RPC")}
          note="Public endpoints rate-limit and will drop a launch partway. Accepts a comma-separated list."
        />
        <Row
          name="PINATA_JWT"
          set={present("PINATA_JWT")}
          note="Pins token image and metadata to IPFS. Without it, paste a metadata URI you host."
        />
      </section>

      <p className="annot">
        This screen disappears on its own once both required values are present.
      </p>
    </main>
  );
}
