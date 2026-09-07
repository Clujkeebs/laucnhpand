/**
 * Tools the assistant can call.
 *
 * Two kinds. Read-only and pure tools run on the server inside the agent loop.
 * Anything that spends money or signs a transaction is a *client action*: the
 * loop stops, the proposal is handed to the browser, and nothing happens until
 * you confirm it there. The model never holds a key and never moves value on
 * its own — the key only exists in your browser, decrypted for the session.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { priceCurve, summarize } from "./amm";
import { feesFromVolume, volumeForTarget } from "./fees";

/** Tools whose results the browser must produce, because they need your key. */
export const CLIENT_ACTIONS = ["propose_launch"] as const;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];

export function isClientAction(name: string): name is ClientAction {
  return (CLIENT_ACTIONS as readonly string[]).includes(name);
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "project_pool",
    description:
      "Model what a liquidity pool would do: the opening price, the fully diluted valuation, how far a 1 SOL buy moves the price, and how much SOL it takes to double it. Use this whenever the user asks how a launch would behave, or before recommending pool amounts.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        token_amount: { type: "number", description: "Tokens placed in the pool." },
        sol_amount: { type: "number", description: "SOL paired against them." },
        total_supply: { type: "number", description: "Total token supply." },
      },
      required: ["token_amount", "sol_amount", "total_supply"],
      additionalProperties: false,
    },
  },
  {
    name: "project_fees",
    description:
      "Work out creator fee earnings on a bonding-curve launch. Given a creator fee rate, returns what a volume figure pays and what volume a target payout needs. Use this for any question about how much a launch could earn.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        creator_fee_rate: {
          type: "number",
          description: "Creator's share of volume as a fraction, e.g. 0.001 for 0.1%.",
        },
        volume_sol: { type: "number", description: "Trading volume to evaluate, in SOL." },
        target_sol: { type: "number", description: "Target earnings, in SOL." },
      },
      required: ["creator_fee_rate", "volume_sol", "target_sol"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_launch",
    description:
      "Propose a token for the user to launch. This does NOT create anything — it hands the user a draft they must review and confirm in the app, where their wallet signs it. Call this only once the name, symbol and description are settled. Artwork is generated automatically from the name.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Token name, 1-32 characters." },
        symbol: { type: "string", description: "Ticker, 3-10 uppercase letters." },
        description: { type: "string", description: "One or two sentences for the metadata." },
        decimals: { type: "integer", enum: [0, 2, 4, 5, 6, 8, 9] },
        supply: { type: "string", description: "Total supply as a whole number, e.g. \"1000000000\"." },
        art_style: { type: "string", enum: ["seal", "prism", "orbit", "strata"] },
        rationale: { type: "string", description: "One sentence on why this is the right shape." },
      },
      required: [
        "name",
        "symbol",
        "description",
        "decimals",
        "supply",
        "art_style",
        "rationale",
      ],
      additionalProperties: false,
    },
  },
];

type ToolResult = { content: string; isError?: boolean };

/** Executes the server-side tools. Pure arithmetic — no chain access, no keys. */
export function runServerTool(name: string, input: unknown): ToolResult {
  try {
    if (name === "project_pool") {
      const { token_amount, sol_amount, total_supply } = input as {
        token_amount: number;
        sol_amount: number;
        total_supply: number;
      };
      if (!(token_amount > 0) || !(sol_amount > 0)) {
        return { content: "Both pool sides must be greater than zero.", isError: true };
      }

      const pool = { tokenReserve: token_amount, solReserve: sol_amount };
      const supply = total_supply > 0 ? total_supply : token_amount;
      const stats = summarize(pool, supply);
      const curve = priceCurve(pool, supply, 4);

      return {
        content: JSON.stringify({
          opening_price_sol: stats.openPrice,
          opening_fdv_sol: stats.openFdvSol,
          price_move_on_1_sol_buy: `${(stats.impactOneSol * 100).toFixed(2)}%`,
          sol_to_double_price: stats.solToDouble,
          share_of_supply_in_pool: `${(stats.supplyInPool * 100).toFixed(1)}%`,
          curve_samples: curve.map((point) => ({
            sol_bought: Number(point.solIn.toFixed(4)),
            price_multiple: Number(point.multiple.toFixed(3)),
          })),
        }),
      };
    }

    if (name === "project_fees") {
      const { creator_fee_rate, volume_sol, target_sol } = input as {
        creator_fee_rate: number;
        volume_sol: number;
        target_sol: number;
      };
      const rates = { tradeFeeRate: creator_fee_rate, creatorFeeRate: creator_fee_rate };
      const needed = volumeForTarget(target_sol, rates);

      return {
        content: JSON.stringify({
          fees_from_volume_sol: feesFromVolume(volume_sol, rates),
          volume_needed_for_target_sol: Number.isFinite(needed) ? needed : null,
          note: "Fees are a fixed cut of volume. No volume means no fees.",
        }),
      };
    }

    return { content: `Unknown tool: ${name}`, isError: true };
  } catch (error) {
    return {
      content: error instanceof Error ? error.message : "Tool failed.",
      isError: true,
    };
  }
}
