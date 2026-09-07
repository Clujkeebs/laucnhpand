"use client";

import { Shell } from "@/components/Shell";
import { BridgeWidget } from "@/components/BridgeWidget";
import { Note, Panel } from "@/components/ui";
import { useWallet } from "@/lib/wallet";

export default function BridgePage() {
  const { network } = useWallet();

  return (
    <Shell
      title="Bridge"
      standfirst="Move value between Solana and Ethereum through Wormhole. Bridged assets arrive as wrapped tokens on the destination chain."
    >
      <div className="max-w-3xl space-y-8">
        <Panel index="01" eyebrow="Wormhole" title="Transfer">
          <BridgeWidget network={network === "devnet" ? "Testnet" : "Mainnet"} />
        </Panel>

        <Note>
          Connect the wallet you want to bridge <em>from</em> inside the widget — this is the
          one place in the app that talks to an external wallet, because Wormhole needs to
          sign on both chains. Your in-app key is not used here; paste its address as the
          destination if you want the funds to land there.
        </Note>

        <Note tone="flag">
          Bridging is not a listing. Sending a token to Ethereum creates a wrapped version
          with no market and no buyers — it does not put your token on any exchange, and no
          exchange lists a token because it was bridged.
        </Note>
      </div>
    </Shell>
  );
}
