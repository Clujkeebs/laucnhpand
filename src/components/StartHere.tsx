"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Panel } from "./ui";
import { useWallet } from "@/lib/wallet";
import { listLaunches } from "@/lib/history";

type Step = {
  title: string;
  detail: string;
  done: boolean;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
};

/**
 * The front door. The app has a lot of desks; this answers "what do I do now"
 * with one numbered path, and marks off the steps you have already done.
 */
export function StartHere() {
  const { keystore, keypair, network, balanceSol, setNetwork } = useWallet();
  const [launches, setLaunches] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setLaunches(listLaunches().length);
    try {
      setDismissed(localStorage.getItem("launchpad.starthere.done") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const onTestnet = network === "devnet";
  const funded = (balanceSol ?? 0) > 0.03;

  const steps: Step[] = [
    {
      title: "Make a wallet",
      detail: "Created here in your browser. Nobody else ever holds the key — not even this app's server.",
      done: Boolean(keystore),
      action: { label: "Create wallet", href: "/wallet" },
    },
    {
      title: "Stay on the test network",
      detail: "Everything is free here and none of it is real money. Practise until nothing surprises you.",
      done: onTestnet,
      action: { label: "Switch to test", onClick: () => setNetwork("devnet") },
    },
    {
      title: "Get free test SOL",
      detail: "The faucet gives you 1 SOL. It is worthless play money — that is the point.",
      done: funded,
      action: { label: "Open the faucet", href: "/wallet" },
    },
    {
      title: "Make your first coin",
      detail: "The curve desk is the cheapest way: no pool to fund, so you only pay account rent.",
      done: launches > 0,
      action: { label: "Make a coin", href: "/free" },
    },
    {
      title: "Look at it the way a buyer would",
      detail: "Every coin gets a public page showing what it really is. That page is what you would share.",
      done: false,
      action: { label: "Check any coin", href: "/inspect" },
    },
  ];

  const current = steps.findIndex((step) => !step.done);

  return (
    <Panel
      index="→"
      eyebrow="Start here"
      title="What to do first"
      note="Work down this list. It costs nothing until the very last step."
      aside={
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem("launchpad.starthere.done", "1");
            } catch {
              // Private mode; hiding it for this session is fine.
            }
            setDismissed(true);
          }}
          className="eyebrow hover:text-ink"
        >
          Hide
        </button>
      }
    >
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const isCurrent = index === current;
          return (
            <li
              key={step.title}
              className={`flex gap-3.5 border-b border-rule py-3.5 last:border-b-0 ${
                step.done ? "opacity-55" : ""
              }`}
            >
              <span
                className={`data mt-px w-4 shrink-0 text-[12px] font-bold ${
                  step.done ? "text-verify" : isCurrent ? "text-signal" : "text-ink-faint"
                }`}
              >
                {step.done ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] ${isCurrent ? "font-semibold" : "font-medium"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{step.detail}</p>

                {isCurrent && step.action ? (
                  <div className="mt-3">
                    {"href" in step.action ? (
                      <Link href={step.action.href}>
                        <Button>{step.action.label}</Button>
                      </Link>
                    ) : (
                      <Button onClick={step.action.onClick}>{step.action.label}</Button>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {keystore && !keypair ? (
        <p className="annot mt-5">
          Your wallet is sealed. Unlock it on any page that needs to sign — the key is only
          held in memory while you are using it.
        </p>
      ) : null}
    </Panel>
  );
}
