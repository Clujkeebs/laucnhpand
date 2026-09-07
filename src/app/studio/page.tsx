"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { AgentChat } from "@/components/AgentChat";
import { Automation } from "@/components/Automation";

type Tab = "chat" | "automation";

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <Shell
      title="Studio"
      standfirst="Think through a token with the assistant, or leave it running on a schedule. It can read the chain and do the arithmetic; it signs nothing without your key, which never leaves this browser."
    >
      <div className="mb-9 flex gap-6 border-b border-rule pb-4">
        {(["chat", "automation"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`eyebrow ${tab === option ? "text-ink underline underline-offset-4" : "hover:text-ink"}`}
          >
            {option === "chat" ? "Conversation" : "Automation"}
          </button>
        ))}
      </div>

      <WalletGate>
        {tab === "chat" ? <AgentChat /> : <div className="max-w-2xl"><Automation /></div>}
      </WalletGate>
    </Shell>
  );
}
