import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchMintStatus } from "@/lib/token";
import { fetchTopHolders } from "@/lib/portfolio";
import { reportObservedToken, VERDICT_COPY } from "@/lib/report";
import { generateTokenArt } from "@/lib/tokenart";
import { explorerUrl, shortAddress } from "@/lib/solana";
import { isValidMint } from "@/lib/pool";

export const revalidate = 60;

type Params = { params: Promise<{ mint: string }> };

/** Distinguishes "no such token" from "we could not reach the chain". */
class ChainUnreachable extends Error {}

async function load(mint: string) {
  const status = await fetchMintStatus("mainnet-beta", mint).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (/not a token mint/i.test(message)) throw error;
    throw new ChainUnreachable(message || "Could not reach the network.");
  });
  const holders = await fetchTopHolders("mainnet-beta", mint).catch(() => null);
  const report = reportObservedToken({
    mintAuthority: status.mintAuthority,
    freezeAuthority: status.freezeAuthority,
    hasMetadata: Boolean(status.name),
    topTenShare: holders
      ? holders.rows.slice(0, 10).reduce((sum, row) => sum + row.share, 0)
      : null,
    largestShare: holders?.rows[0]?.share ?? null,
  });
  return { status, report };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mint } = await params;
  if (!isValidMint(mint)) return { title: "Token" };

  try {
    const { status, report } = await load(mint);
    const name = status.name || "Unnamed token";
    const title = status.symbol ? `${name} · ${status.symbol}` : name;
    const description = `${report.score}/100 on the open checks — ${VERDICT_COPY[report.verdict]}`;
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: "Token" };
  }
}

/**
 * The public face of a token. Deliberately outside the auth gate — this is the
 * page you send people, and it leads with the checks a buyer would run anyway
 * rather than with a pitch.
 */
export default async function TokenPage({ params }: Params) {
  const { mint } = await params;
  if (!isValidMint(mint)) notFound();

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(mint);
  } catch (error) {
    if (error instanceof ChainUnreachable) return <Unavailable mint={mint} />;
    notFound();
  }

  const { status, report } = data;
  const supply = Number(status.supply) / 10 ** status.decimals;
  const art = generateTokenArt({
    seed: status.name || mint,
    style: "seal",
    label: status.name || status.symbol || "?",
  });
  const tone =
    report.verdict === "clean" ? "verify" : report.verdict === "hostile" ? "signal" : "flag";

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <header className="mb-9 flex items-start gap-5 border-b-[1.5px] border-[color:var(--rule-hard)] pb-7">
        <span
          className="h-20 w-20 shrink-0 border border-rule"
          dangerouslySetInnerHTML={{ __html: art }}
        />
        <div className="min-w-0">
          <h1 className="display text-[clamp(30px,5vw,44px)]">{status.name || "Unnamed token"}</h1>
          <p className="data mt-1 text-[12px] text-ink-faint">
            {status.symbol ? `${status.symbol} · ` : ""}
            {shortAddress(mint, 6)}
          </p>
        </div>
      </header>

      <section className="mb-9">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="eyebrow">Open checks</p>
            <p className="data mt-2 text-[44px] leading-none">
              {report.score}
              <span className="text-[15px] text-ink-faint">/100</span>
            </p>
          </div>
          <span className={`stamp text-${tone}`}>{report.verdict}</span>
        </div>
        <p className="annot mt-3">{VERDICT_COPY[report.verdict]}</p>
      </section>

      <ul className="mb-9">
        {report.checks.map((check) => (
          <li key={check.id} className="flex gap-3 border-b border-rule py-3">
            <span
              className={`data mt-px w-3 shrink-0 text-[13px] font-bold ${
                check.status === "pass"
                  ? "text-verify"
                  : check.status === "fail"
                    ? "text-signal"
                    : check.status === "flag"
                      ? "text-flag"
                      : "text-ink-faint"
              }`}
            >
              {check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : check.status === "flag" ? "!" : "–"}
            </span>
            <div>
              <p className="text-[12.5px] font-semibold leading-snug">{check.label}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mb-9 space-y-2">
        <div className="datum">
          <dt>Supply</dt>
          <span className="leader" aria-hidden />
          <dd>{supply.toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd>
        </div>
        <div className="datum">
          <dt>Decimals</dt>
          <span className="leader" aria-hidden />
          <dd>{status.decimals}</dd>
        </div>
        <div className="datum">
          <dt>Mint authority</dt>
          <span className="leader" aria-hidden />
          <dd>{status.mintAuthority ? "active" : "revoked"}</dd>
        </div>
        <div className="datum">
          <dt>Freeze authority</dt>
          <span className="leader" aria-hidden />
          <dd>{status.freezeAuthority ? "active" : "revoked"}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-5">
        <a
          className="eyebrow hover:text-ink"
          href={explorerUrl("token", mint, "mainnet-beta")}
          target="_blank"
          rel="noreferrer"
        >
          Solscan ↗
        </a>
        <a
          className="eyebrow hover:text-ink"
          href={`https://jup.ag/swap/SOL-${mint}`}
          target="_blank"
          rel="noreferrer"
        >
          Trade on Jupiter ↗
        </a>
      </div>

      <p className="annot mt-10 border-t border-rule pt-6">
        These figures are read live from the chain, not supplied by the issuer. They describe
        what the token is — not whether it is worth buying. Nothing here is a recommendation.
      </p>
    </main>
  );
}

/**
 * An RPC outage is not the same as a token that does not exist, and saying
 * "not found" for one would be a lie about someone's token.
 */
function Unavailable({ mint }: { mint: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="display mb-4 text-[clamp(30px,5vw,44px)]">Chain unreachable</h1>
      <p className="annot mb-6 max-w-[52ch]">
        This page reads everything live from Solana and the network could not be reached just
        now. That says nothing about the token — try again shortly.
      </p>
      <a
        className="eyebrow hover:text-ink"
        href={explorerUrl("token", mint, "mainnet-beta")}
        target="_blank"
        rel="noreferrer"
      >
        Check it on Solscan ↗
      </a>
    </main>
  );
}
