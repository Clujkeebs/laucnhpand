/**
 * Grades a token on the things anyone evaluating it can check for themselves.
 *
 * None of this predicts whether a token will sell. It reports what a buyer,
 * a scanner, or an exchange listing reviewer sees when they look — which is
 * the part you control.
 */

export type CheckStatus = "pass" | "flag" | "fail" | "unknown";

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** How much this moves the score. Fatal items are what get a token ignored. */
  weight: number;
};

export type Verdict = "clean" | "questionable" | "hostile";

export type Report = {
  checks: Check[];
  score: number;
  verdict: Verdict;
};

const WEIGHTS = { fatal: 30, major: 15, minor: 7 } as const;

function score(checks: Check[]): Report {
  const graded = checks.filter((check) => check.status !== "unknown");
  const total = graded.reduce((sum, check) => sum + check.weight, 0);
  if (total === 0) return { checks, score: 0, verdict: "questionable" };

  const earned = graded.reduce((sum, check) => {
    if (check.status === "pass") return sum + check.weight;
    if (check.status === "flag") return sum + check.weight * 0.4;
    return sum;
  }, 0);

  const value = Math.round((earned / total) * 100);
  const hasFatal = graded.some((check) => check.status === "fail" && check.weight === WEIGHTS.fatal);

  return {
    checks,
    score: value,
    verdict: hasFatal ? "hostile" : value >= 80 ? "clean" : "questionable",
  };
}

export type PlannedLaunch = {
  name: string;
  symbol: string;
  description: string;
  hasImage: boolean;
  links: string[];
  supply: string;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
};

export function reportPlannedLaunch(plan: PlannedLaunch): Report {
  const supplyDigits = plan.supply.replace(/[^\d]/g, "").length;

  return score([
    {
      id: "mint-authority",
      label: "Mint authority",
      weight: WEIGHTS.fatal,
      status: plan.revokeMint ? "pass" : "fail",
      detail: plan.revokeMint
        ? "Will be revoked at launch. Supply is fixed and provably so."
        : "Kept. You can mint unlimited new supply, and every scanner will report that you can.",
    },
    {
      id: "freeze-authority",
      label: "Freeze authority",
      weight: WEIGHTS.fatal,
      status: plan.revokeFreeze ? "pass" : "fail",
      detail: plan.revokeFreeze
        ? "Will be revoked at launch. No holder can be blocked from selling."
        : "Kept. You could freeze any holder's account. This is the standard honeypot signature.",
    },
    {
      id: "metadata",
      label: "Name, symbol, image",
      weight: WEIGHTS.major,
      status: plan.name.trim() && plan.symbol.trim() && plan.hasImage ? "pass" : "fail",
      detail:
        plan.name.trim() && plan.symbol.trim() && plan.hasImage
          ? "Complete. Wallets and explorers will render it properly."
          : "Incomplete. Without an image the token shows as a blank placeholder everywhere.",
    },
    {
      id: "description",
      label: "Description",
      weight: WEIGHTS.minor,
      status: plan.description.trim().length >= 40 ? "pass" : "flag",
      detail:
        plan.description.trim().length >= 40
          ? "Present."
          : "Thin or missing. This is the first thing shown under the token's name.",
    },
    {
      id: "links",
      label: "Public presence",
      weight: WEIGHTS.major,
      status: plan.links.length >= 2 ? "pass" : plan.links.length === 1 ? "flag" : "fail",
      detail:
        plan.links.length >= 2
          ? `${plan.links.length} links attached.`
          : plan.links.length === 1
            ? "One link. A token with a single dead-end link reads as disposable."
            : "None. An anonymous token with no site and no account has nothing for anyone to evaluate.",
    },
    {
      id: "supply",
      label: "Supply shape",
      weight: WEIGHTS.minor,
      status: supplyDigits === 0 ? "unknown" : supplyDigits > 15 ? "flag" : "pass",
      detail:
        supplyDigits > 15
          ? "Very large. Combined with high decimals this makes prices unreadable in most UIs."
          : "Reasonable.",
    },
  ]);
}

export type ObservedToken = {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  hasMetadata: boolean;
  /** Combined share held by the top ten accounts, 0–1. Null if unavailable. */
  topTenShare: number | null;
  /** Share held by the single largest account, 0–1. Null if unavailable. */
  largestShare: number | null;
};

export function reportObservedToken(token: ObservedToken): Report {
  return score([
    {
      id: "mint-authority",
      label: "Mint authority",
      weight: WEIGHTS.fatal,
      status: token.mintAuthority === null ? "pass" : "fail",
      detail:
        token.mintAuthority === null
          ? "Revoked. The supply you see is the supply that exists."
          : "Active. Whoever holds it can mint unlimited new supply at any moment.",
    },
    {
      id: "freeze-authority",
      label: "Freeze authority",
      weight: WEIGHTS.fatal,
      status: token.freezeAuthority === null ? "pass" : "fail",
      detail:
        token.freezeAuthority === null
          ? "Revoked. No account can be frozen."
          : "Active. Holder accounts can be frozen, which would stop them selling.",
    },
    {
      id: "metadata",
      label: "On-chain metadata",
      weight: WEIGHTS.minor,
      status: token.hasMetadata ? "pass" : "flag",
      detail: token.hasMetadata
        ? "Present."
        : "Absent. The token has no name, symbol or image attached on chain.",
    },
    {
      id: "concentration",
      label: "Top-10 concentration",
      weight: WEIGHTS.major,
      status:
        token.topTenShare === null
          ? "unknown"
          : token.topTenShare > 0.8
            ? "fail"
            : token.topTenShare > 0.5
              ? "flag"
              : "pass",
      detail:
        token.topTenShare === null
          ? "Could not be read."
          : `Top ten accounts hold ${(token.topTenShare * 100).toFixed(1)}% of supply.${
              token.topTenShare > 0.5
                ? " A handful of wallets can move the price at will — note that pool accounts appear here too."
                : ""
            }`,
    },
    {
      id: "single-holder",
      label: "Largest single holder",
      weight: WEIGHTS.major,
      status:
        token.largestShare === null
          ? "unknown"
          : token.largestShare > 0.5
            ? "fail"
            : token.largestShare > 0.25
              ? "flag"
              : "pass",
      detail:
        token.largestShare === null
          ? "Could not be read."
          : `One account holds ${(token.largestShare * 100).toFixed(1)}% of supply.`,
    },
  ]);
}

export const VERDICT_COPY: Record<Verdict, string> = {
  clean: "Nothing here will scare off a buyer who checks.",
  questionable: "A careful buyer will find things to ask about.",
  hostile: "This reads as a token built to take money.",
};
