"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Rocket, ShieldCheck } from "lucide-react";
import { Button, Copyable, Datum, ExternalRef, Note, Panel, Spinner, Tag } from "./ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import { generateTokenArt, svgToPngFile, type ArtStyle } from "@/lib/tokenart";
import { launchToken } from "@/lib/token";
import { createFreeLaunch } from "@/lib/launchpad";
import { rememberLaunch } from "@/lib/history";

/** Mirrors Anthropic's MessageParam without importing the SDK into the browser. */
type Message = { role: "user" | "assistant"; content: unknown };

type Proposal = {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  supply: string;
  art_style: ArtStyle;
  rationale: string;
};

type PendingAction = { toolUseId: string; name: string; input: Proposal };

type Bubble = { role: "you" | "assistant"; text: string };

export function AgentChat() {
  const router = useRouter();
  const { keypair, network, refreshBalance } = useWallet();

  const [messages, setMessages] = useState<Message[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [done, setDone] = useState<{ mint: string; signature: string; kind: string } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, pending, busy]);

  async function send(next: Message[], echo?: string) {
    setBusy(true);
    setError(null);
    if (echo) setBubbles((b) => [...b, { role: "you", text: echo }]);

    try {
      const response = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = (await response.json()) as {
        messages?: Message[];
        reply?: string;
        pendingAction?: PendingAction;
        error?: string;
      };
      if (!response.ok || !body.messages) throw new Error(body.error ?? "Request failed.");

      setMessages(body.messages);
      if (body.reply) setBubbles((b) => [...b, { role: "assistant", text: body.reply! }]);
      setPending(body.pendingAction ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send([...messages, { role: "user", content: text }], text);
  }

  /** Hands the outcome back to the assistant so the conversation continues. */
  async function reportBack(summary: string) {
    if (!pending) return;
    await send([
      ...messages,
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: pending.toolUseId, content: summary }],
      },
    ]);
  }

  async function confirm(kind: "curve" | "standard") {
    if (!pending || !keypair) return;
    const draft = pending.input;
    setLaunching(kind);
    setError(null);

    try {
      const svg = generateTokenArt({
        seed: draft.name,
        style: draft.art_style,
        label: draft.name,
      });
      const file = await svgToPngFile(
        svg,
        `${draft.name.toLowerCase().replace(/\W+/g, "-")}.png`,
      );

      const form = new FormData();
      form.append("image", file);
      form.append("name", draft.name);
      form.append("symbol", draft.symbol);
      form.append("description", draft.description);
      const upload = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = (await upload.json()) as { metadataUri?: string; error?: string };
      if (!upload.ok || !uploaded.metadataUri) throw new Error(uploaded.error ?? "Upload failed.");

      let mint: string;
      let signature: string;

      if (kind === "curve") {
        const launch = await createFreeLaunch(network, keypair, {
          name: draft.name,
          symbol: draft.symbol,
          uri: uploaded.metadataUri,
          decimals: draft.decimals,
          initialBuySol: 0,
        });
        mint = launch.mint;
        signature = launch.signature;
      } else {
        const launch = await launchToken(network, keypair, {
          name: draft.name,
          symbol: draft.symbol,
          decimals: draft.decimals,
          supply: draft.supply,
          uri: uploaded.metadataUri,
          revokeMintAuthority: true,
          revokeFreezeAuthority: true,
        });
        mint = launch.mint;
        signature = launch.createSignature;
      }

      rememberLaunch({
        mint,
        name: draft.name,
        symbol: draft.symbol,
        decimals: draft.decimals,
        supply: draft.supply,
        network,
        createdAt: new Date().toISOString(),
      });

      setDone({ mint, signature, kind });
      setPending(null);
      void refreshBalance();
      router.refresh();
      await reportBack(
        `The operator confirmed and the token was created on ${network}. Mint address ${mint}. It now appears on their ledger.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Launch failed.";
      setError(message);
      await reportBack(`The operator tried to confirm but it failed: ${message}`);
    } finally {
      setLaunching(null);
    }
  }

  async function decline() {
    setPending(null);
    await reportBack("The operator declined this draft. Ask what to change.");
  }

  return (
    <div className="grid max-w-6xl gap-11 lg:grid-cols-[1.25fr_1fr]">
      <div className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-6">
          {bubbles.length === 0 ? (
            <div className="space-y-4">
              <p className="annot">
                Think out loud with it. When something is worth making, ask it to propose the
                launch — it drafts one and you confirm it here.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Brainstorm three token ideas for a chess streaming community",
                  "What pool size would make a 1 SOL buy move the price under 5%?",
                  "How much volume do I need to earn 1 SOL in creator fees at 0.1%?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="border border-rule px-2.5 py-1.5 text-left text-[12px] text-ink-soft transition hover:border-ink hover:text-ink"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {bubbles.map((bubble, index) => (
            <div key={index} className={bubble.role === "you" ? "border-l-2 border-ink pl-3.5" : ""}>
              <p className="eyebrow mb-1.5">{bubble.role === "you" ? "You" : "Assistant"}</p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{bubble.text}</p>
            </div>
          ))}

          {busy ? (
            <p className="eyebrow flex items-center gap-2">
              <Spinner /> Thinking
            </p>
          ) : null}

          {error ? <Note tone="signal">{error}</Note> : null}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="mt-8 flex items-end gap-3 border-t-[1.5px] border-[color:var(--rule-hard)] pt-5">
          <textarea
            rows={2}
            className="ctl"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) submit(event);
            }}
            placeholder="Ask, argue, or tell it to propose a launch…"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            <CornerDownLeft className="h-3.5 w-3.5" />
            Send
          </Button>
        </form>
      </div>

      <div className="space-y-8 lg:sticky lg:top-12 lg:self-start">
        {pending ? (
          <ProposalCard
            draft={pending.input}
            launching={launching}
            onConfirm={confirm}
            onDecline={() => void decline()}
            hasKey={Boolean(keypair)}
          />
        ) : done ? (
          <Panel index="—" eyebrow="Created" title="It exists">
            <dl className="space-y-2">
              <Datum label="Route">{done.kind === "curve" ? "bonding curve" : "standard mint"}</Datum>
              <Datum label="Network">{network === "devnet" ? "test" : "live"}</Datum>
            </dl>
            <div className="mt-5 space-y-3">
              <Copyable value={done.mint} />
              <div className="flex flex-wrap gap-5">
                <ExternalRef href={explorerUrl("token", done.mint, network)}>Token</ExternalRef>
                <ExternalRef href={explorerUrl("tx", done.signature, network)}>
                  Transaction
                </ExternalRef>
              </div>
            </div>
            <div className="mt-6">
              <Note>It is on your ledger now. Keep talking to refine the next one.</Note>
            </div>
          </Panel>
        ) : (
          <Panel index="—" eyebrow="Standing rule" title="It cannot spend">
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-ink-soft">
                The assistant can read, calculate and draft. It cannot sign anything. Your key is
                decrypted only in this browser, so every transaction stops here for you to
                confirm — there is no path where it moves value on its own.
              </p>
              <div className="flex flex-wrap gap-2">
                <Tag tone="verify">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3" />
                    Confirm required
                  </span>
                </Tag>
                <Tag>Read-only tools</Tag>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ProposalCard({
  draft,
  launching,
  onConfirm,
  onDecline,
  hasKey,
}: {
  draft: Proposal;
  launching: string | null;
  onConfirm: (kind: "curve" | "standard") => void;
  onDecline: () => void;
  hasKey: boolean;
}) {
  const preview = useMemo(() => {
    const svg = generateTokenArt({ seed: draft.name, style: draft.art_style, label: draft.name });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [draft.name, draft.art_style]);

  return (
    <Panel index="—" eyebrow="Proposal" title="Confirm to create">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="" width={72} height={72} className="shrink-0 border border-rule" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {draft.name}{" "}
            <span className="data text-[11px] font-normal text-ink-faint">{draft.symbol}</span>
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{draft.description}</p>
        </div>
      </div>

      <dl className="mt-5 space-y-2">
        <Datum label="Supply">{Number(draft.supply).toLocaleString()}</Datum>
        <Datum label="Decimals">{draft.decimals}</Datum>
        <Datum label="Artwork">{draft.art_style}</Datum>
      </dl>

      <p className="annot mt-4">{draft.rationale}</p>

      {!hasKey ? (
        <div className="mt-5">
          <Note tone="signal">Unlock your wallet before confirming.</Note>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Button onClick={() => onConfirm("curve")} disabled={Boolean(launching) || !hasKey}>
          {launching === "curve" ? <Spinner /> : <Rocket className="h-3.5 w-3.5" />}
          Launch on a curve
        </Button>
        <Button
          variant="quiet"
          onClick={() => onConfirm("standard")}
          disabled={Boolean(launching) || !hasKey}
        >
          {launching === "standard" ? <Spinner /> : null}
          Standard mint
        </Button>
        <Button variant="quiet" onClick={onDecline} disabled={Boolean(launching)}>
          Decline
        </Button>
      </div>

      <div className="mt-5">
        <Note>
          Nothing has been created yet. Confirming signs with your key and spends real rent on
          the live network.
        </Note>
      </div>
    </Panel>
  );
}
