"use client";

import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { AgentChat } from "@/components/AgentChat";

export default function StudioPage() {
  return (
    <Shell
      title="Studio"
      standfirst="Think through a token with the assistant, then have it draft one. It can read the chain and do the arithmetic; it cannot sign — every launch stops with you."
    >
      <WalletGate>
        <AgentChat />
      </WalletGate>
    </Shell>
  );
}
