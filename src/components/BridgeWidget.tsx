"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { config as WormholeConfig } from "@wormhole-foundation/wormhole-connect";
import { useTheme } from "@/lib/theme";

// Connect is browser-only and large, so it is loaded on demand rather than
// bundled into every page.
const WormholeConnect = dynamic(() => import("@wormhole-foundation/wormhole-connect"), {
  ssr: false,
  loading: () => <p className="annot">Loading the bridge…</p>,
});

export function BridgeWidget({ network }: { network: "Mainnet" | "Testnet" }) {
  const { theme } = useTheme();

  // Wormhole names testnets separately from their mainnets, so the chain list
  // and the default destination both have to follow the selected network.
  const config = useMemo<WormholeConfig.WormholeConnectConfig>(() => {
    const isTestnet = network === "Testnet";
    const ethereum = isTestnet ? "Sepolia" : "Ethereum";

    return {
      network,
      chains: isTestnet
        ? ["Solana", "Sepolia", "BaseSepolia", "ArbitrumSepolia"]
        : ["Solana", "Ethereum", "Base", "Arbitrum"],
      ui: {
        title: "",
        defaultInputs: {
          source: { chain: "Solana" },
          destination: { chain: ethereum },
        },
        showHamburgerMenu: false,
      },
    };
  }, [network]);

  return (
    <div className="sheet p-1">
      <WormholeConnect
        key={`${network}-${theme}`}
        config={config}
        theme={{ mode: theme === "dark" ? "dark" : "light" }}
      />
    </div>
  );
}
