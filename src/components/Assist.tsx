"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Button, Field, Note, Spinner } from "./ui";
import { ART_STYLES, generateTokenArt, svgToPngFile, type ArtStyle } from "@/lib/tokenart";

export type Candidate = {
  name: string;
  symbol: string;
  description: string;
  rationale: string;
};

/**
 * Names, symbols and descriptions from Claude. Optional — the launch form works
 * without it, and without an API key this panel just explains that.
 */
export function ConceptAssist({
  onApply,
}: {
  onApply: (candidate: Candidate) => void;
}) {
  const [brief, setBrief] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/concept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const body = (await response.json()) as { candidates?: Candidate[]; error?: string };
      if (!response.ok || !body.candidates) throw new Error(body.error ?? "Request failed.");
      setCandidates(body.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Brief" hint="What is the token for? A sentence is enough.">
        <textarea
          rows={2}
          className="ctl"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="A token for a community of chess streamers."
        />
      </Field>

      <Button
        type="button"
        variant="quiet"
        onClick={() => void generate()}
        disabled={busy || brief.trim().length < 3}
      >
        {busy ? <Spinner /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Thinking…" : "Suggest names"}
      </Button>

      {error ? <Note tone="signal">{error}</Note> : null}

      {candidates ? (
        <ul className="space-y-3">
          {candidates.map((candidate) => (
            <li key={`${candidate.name}-${candidate.symbol}`} className="border-t border-rule pt-3">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[14px] font-semibold">
                  {candidate.name}{" "}
                  <span className="data text-[11px] font-normal text-ink-faint">
                    {candidate.symbol}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onApply(candidate)}
                  className="eyebrow shrink-0 hover:text-ink"
                >
                  Use
                </button>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                {candidate.description}
              </p>
              <p className="annot mt-1 text-[13px]">{candidate.rationale}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Procedural coin artwork. Deterministic from the seed, so the same name always
 * gives the same mark — and it costs nothing and needs no key.
 */
export function ArtAssist({
  seed,
  label,
  onApply,
}: {
  seed: string;
  label: string;
  onApply: (file: File, preview: string) => void;
}) {
  const [mode, setMode] = useState<"generated" | "drawn">("drawn");
  const [subject, setSubject] = useState("");
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [style, setStyle] = useState<ArtStyle>("seal");
  const [variant, setVariant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSeed = `${seed || "untitled"}#${variant}`;
  const svg = useMemo(
    () => generateTokenArt({ seed: effectiveSeed, style, label: label || seed }),
    [effectiveSeed, style, label, seed],
  );

  const dataUri = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    [svg],
  );

  const apply = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await svgToPngFile(svg, `${(seed || "token").toLowerCase().replace(/\W+/g, "-")}.png`);
      onApply(file, dataUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not render the artwork.");
    } finally {
      setBusy(false);
    }
  }, [svg, seed, onApply, dataUri]);

  async function generate() {
    setAiBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const body = (await response.json()) as { dataUri?: string; provider?: string; error?: string };
      if (!response.ok || !body.dataUri) throw new Error(body.error ?? "Generation failed.");
      setAiImage(body.dataUri);
      setAiProvider(body.provider ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setAiBusy(false);
    }
  }

  async function applyGenerated() {
    if (!aiImage) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await (await fetch(aiImage)).blob();
      const name = `${(seed || "token").toLowerCase().replace(/\W+/g, "-")}.png`;
      onApply(new File([blob], name, { type: "image/png" }), aiImage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-5">
        {(["generated", "drawn"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`eyebrow ${mode === option ? "text-ink underline underline-offset-4" : "hover:text-ink"}`}
          >
            {option === "generated" ? "AI image" : "Generated mark"}
          </button>
        ))}
      </div>

      {mode === "generated" ? (
        <div className="space-y-4">
          <Field label="Describe the image" hint="Plain description. It is drawn as a square coin mark.">
            <input
              className="ctl"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="an astronaut frog holding a torch"
            />
          </Field>

          {aiImage ? (
            <div className="flex items-start gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiImage} alt="Generated artwork" width={96} height={96} className="shrink-0 border border-rule" />
              <p className="annot">{aiProvider}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            <Button type="button" variant="quiet" onClick={() => void generate()} disabled={aiBusy || subject.trim().length < 2}>
              {aiBusy ? <Spinner /> : <ImageIcon className="h-3.5 w-3.5" />}
              {aiBusy ? "Drawing…" : aiImage ? "Try again" : "Generate image"}
            </Button>
            {aiImage ? (
              <Button type="button" onClick={() => void applyGenerated()} disabled={busy}>
                {busy ? <Spinner /> : <Wand2 className="h-3.5 w-3.5" />}
                Use this image
              </Button>
            ) : null}
          </div>

          {error ? <Note tone="signal">{error}</Note> : null}
        </div>
      ) : (
      <div className="space-y-4">
      <div className="flex items-start gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt="Generated token artwork"
          width={96}
          height={96}
          className="shrink-0 border border-rule"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-2">Style</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ART_STYLES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStyle(option)}
                className={`eyebrow ${
                  style === option ? "text-ink underline underline-offset-4" : "hover:text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="annot mt-3 text-[13px]">
            Generated from the name, so the same name always makes the same mark.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button type="button" variant="quiet" onClick={() => setVariant((v) => v + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Vary
        </Button>
        <Button type="button" onClick={() => void apply()} disabled={busy}>
          {busy ? <Spinner /> : <Wand2 className="h-3.5 w-3.5" />}
          Use this artwork
        </Button>
      </div>

      {error ? <Note tone="signal">{error}</Note> : null}
      </div>
      )}
    </div>
  );
}
