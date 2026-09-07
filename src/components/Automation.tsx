"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { Button, Datum, Field, Note, Panel, Tag } from "./ui";
import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/solana";
import { generateTokenArt, svgToPngFile, type ArtStyle } from "@/lib/tokenart";
import { createFreeLaunch } from "@/lib/launchpad";
import { rememberLaunch } from "@/lib/history";
import {
  appendLog,
  canRun,
  clearLog,
  isDue,
  loadConfig,
  loadLog,
  saveConfig,
  usageToday,
  type RunRecord,
  type ScheduleConfig,
} from "@/lib/scheduler";

const TICK_MS = 30_000;

type Draft = {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  supply: string;
  art_style: ArtStyle;
};

/**
 * Unattended runs. Only operates while this tab is open, because the key that
 * signs lives here and nowhere else.
 */
export function Automation() {
  const { keypair, network, connection, publicKey, balanceSol, refreshBalance } = useWallet();

  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [log, setLog] = useState<RunRecord[]>([]);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setConfig(loadConfig());
    setLog(loadLog());
  }, []);

  const update = useCallback((patch: Partial<ScheduleConfig>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = { ...previous, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  const runOnce = useCallback(async () => {
    if (!config || !keypair || !publicKey || busy.current) return;

    const currentLog = loadLog();
    const gate = canRun(config, currentLog, network, balanceSol);
    if (!gate.ok) {
      setLog(appendLog({ at: new Date().toISOString(), status: "skipped", detail: gate.reason, network }));
      return;
    }

    busy.current = true;
    setRunning(true);
    const before = await connection.getBalance(keypair.publicKey).catch(() => null);

    try {
      const response = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `${config.brief}\n\nPropose exactly one token now by calling propose_launch. Do not ask me anything — this is an unattended run.`,
            },
          ],
        }),
      });
      const body = (await response.json()) as {
        pendingAction?: { input: Draft };
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Assistant failed.");
      if (!body.pendingAction) throw new Error("The assistant did not propose a token.");

      const draft = body.pendingAction.input;
      const svg = generateTokenArt({ seed: draft.name, style: draft.art_style, label: draft.name });
      const file = await svgToPngFile(svg, `${draft.name.toLowerCase().replace(/\W+/g, "-")}.png`);

      const form = new FormData();
      form.append("image", file);
      form.append("name", draft.name);
      form.append("symbol", draft.symbol);
      form.append("description", draft.description);
      const upload = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = (await upload.json()) as { metadataUri?: string; error?: string };
      if (!upload.ok || !uploaded.metadataUri) throw new Error(uploaded.error ?? "Upload failed.");

      const launch = await createFreeLaunch(network, keypair, {
        name: draft.name,
        symbol: draft.symbol,
        uri: uploaded.metadataUri,
        decimals: draft.decimals,
        initialBuySol: 0,
      });

      rememberLaunch({
        mint: launch.mint,
        name: draft.name,
        symbol: draft.symbol,
        decimals: draft.decimals,
        supply: draft.supply,
        network,
        createdAt: new Date().toISOString(),
      });

      const after = await connection.getBalance(keypair.publicKey).catch(() => null);
      const spentSol =
        before !== null && after !== null ? Math.max((before - after) / 1e9, 0) : undefined;

      setLog(
        appendLog({
          at: new Date().toISOString(),
          status: "launched",
          detail: `${draft.name} (${draft.symbol})`,
          network,
          mint: launch.mint,
          spentSol,
        }),
      );
      void refreshBalance();
    } catch (error) {
      setLog(
        appendLog({
          at: new Date().toISOString(),
          status: "failed",
          detail: error instanceof Error ? error.message : "Run failed.",
          network,
        }),
      );
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [config, keypair, publicKey, network, balanceSol, connection, refreshBalance]);

  // The tick only fires while this tab is open; there is no server-side cron.
  useEffect(() => {
    if (!config?.enabled || !keypair) return;
    const tick = () => {
      if (isDue(loadLog(), config.intervalMinutes)) void runOnce();
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [config?.enabled, config?.intervalMinutes, keypair, runOnce]);

  if (!config) return null;

  const usage = usageToday(log);
  const gate = canRun(config, log, network, balanceSol);

  return (
    <div className="space-y-11">
      <Panel
        index="01"
        eyebrow="Automation"
        title="Unattended runs"
        note="Runs only while this tab is open — the key that signs lives here."
        aside={config.enabled ? <Tag tone="verify">Armed</Tag> : <Tag>Off</Tag>}
      >
        <div className="space-y-6">
          <Field
            label="Standing brief"
            hint="What the assistant should make each time. It writes a fresh token per run."
          >
            <textarea
              rows={2}
              className="ctl"
              value={config.brief}
              onChange={(event) => update({ brief: event.target.value })}
              placeholder="A daily memecoin themed on whatever is absurd about software."
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Every (minutes)">
              <input
                className="ctl"
                inputMode="numeric"
                value={config.intervalMinutes}
                onChange={(event) =>
                  update({ intervalMinutes: Math.max(5, Number(event.target.value) || 5) })
                }
              />
            </Field>
            <Field label="Max runs / day">
              <input
                className="ctl"
                inputMode="numeric"
                value={config.maxRunsPerDay}
                onChange={(event) =>
                  update({ maxRunsPerDay: Math.max(1, Number(event.target.value) || 1) })
                }
              />
            </Field>
            <Field label="Max SOL / day">
              <input
                className="ctl"
                inputMode="decimal"
                value={config.maxSolPerDay}
                onChange={(event) =>
                  update({ maxSolPerDay: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </Field>
          </div>

          <label className="flex cursor-pointer gap-3.5">
            <input
              type="checkbox"
              checked={config.allowMainnet}
              onChange={(event) => update({ allowMainnet: event.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="block text-[14px] font-semibold">Allow live runs</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">
                Off, automation only touches the test network. On, it spends real SOL with no
                confirmation step.
              </span>
            </span>
          </label>

          <dl className="space-y-2 border-t border-rule pt-4">
            <Datum label="Today">
              {usage.runs} / {config.maxRunsPerDay} runs
            </Datum>
            <Datum label="Spent today">
              {usage.spentSol.toFixed(4)} / {config.maxSolPerDay} SOL
            </Datum>
            <Datum label="Status">{gate.ok ? "ready" : gate.reason}</Datum>
          </dl>

          <div className="flex flex-wrap gap-2.5">
            {config.enabled ? (
              <Button variant="warn" onClick={() => update({ enabled: false })}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button onClick={() => update({ enabled: true })} disabled={!config.brief.trim()}>
                <Play className="h-3.5 w-3.5" />
                Arm
              </Button>
            )}
            <Button variant="quiet" onClick={() => void runOnce()} disabled={running || !keypair}>
              {running ? "Running…" : "Run once now"}
            </Button>
          </div>

          {!keypair ? <Note tone="signal">Unlock the wallet — automation cannot run sealed.</Note> : null}

          <Note tone="flag">
            Each launch costs rent whether or not anyone ever trades it, and mass-produced
            tokens overwhelmingly do not get traded. Run daily for a month and the arithmetic
            is roughly 0.6 SOL out against fees that are only earned on volume you do not yet
            have. The caps above exist because this is the shape of spend that runs away.
          </Note>
        </div>
      </Panel>

      <Panel
        index="02"
        eyebrow="Audit"
        title="Run log"
        aside={
          log.length ? (
            <button
              type="button"
              onClick={() => {
                clearLog();
                setLog([]);
              }}
              className="eyebrow hover:text-signal"
            >
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3 w-3" />
                Clear
              </span>
            </button>
          ) : null
        }
      >
        {log.length === 0 ? (
          <p className="annot">Nothing has run yet.</p>
        ) : (
          <ul>
            {log.slice(0, 25).map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px]">{entry.detail}</p>
                  <p className="data mt-0.5 text-[10.5px] text-ink-faint">
                    {new Date(entry.at).toLocaleString()}
                    {entry.mint ? ` · ${shortAddress(entry.mint, 4)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  {entry.spentSol ? (
                    <span className="data text-[11px] text-ink-faint">
                      {entry.spentSol.toFixed(4)}
                    </span>
                  ) : null}
                  <Tag
                    tone={
                      entry.status === "launched"
                        ? "verify"
                        : entry.status === "failed"
                          ? "signal"
                          : "plain"
                    }
                  >
                    {entry.status}
                  </Tag>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
