"use client";

import type { Report, CheckStatus } from "@/lib/report";
import { VERDICT_COPY } from "@/lib/report";
import { Stamp, type Tone } from "./ui";

const MARK: Record<CheckStatus, { glyph: string; tone: Tone }> = {
  pass: { glyph: "✓", tone: "verify" },
  flag: { glyph: "!", tone: "flag" },
  fail: { glyph: "✗", tone: "signal" },
  unknown: { glyph: "–", tone: "plain" },
};

const TONE_TEXT: Record<Tone, string> = {
  plain: "text-ink-faint",
  verify: "text-verify",
  flag: "text-flag",
  signal: "text-signal",
};

/**
 * The launch as an outside observer reads it. Shown live while composing an
 * issuance, and against any existing mint from the examine desk.
 */
export function ReportSheet({
  report,
  heading = "Issuance report",
  caption,
}: {
  report: Report;
  heading?: string;
  caption?: string;
}) {
  const tone: Tone =
    report.verdict === "clean" ? "verify" : report.verdict === "hostile" ? "signal" : "flag";
  const label =
    report.verdict === "clean" ? "Clean" : report.verdict === "hostile" ? "Hostile" : "Questionable";

  return (
    <div className="sheet">
      <div className="border-b border-rule px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{heading}</p>
            <p className="data mt-2 text-[40px] leading-none">
              {report.score}
              <span className="text-[15px] text-ink-faint">/100</span>
            </p>
          </div>
          <Stamp tone={tone}>{label}</Stamp>
        </div>
        <p className="annot mt-3">{caption ?? VERDICT_COPY[report.verdict]}</p>
      </div>

      <ul className="px-5 py-1">
        {report.checks.map((check) => {
          const mark = MARK[check.status];
          return (
            <li key={check.id} className="flex gap-3 border-b border-rule py-3 last:border-b-0">
              <span className={`data mt-px w-3 shrink-0 text-[13px] font-bold ${TONE_TEXT[mark.tone]}`}>
                {mark.glyph}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold leading-snug">{check.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{check.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
