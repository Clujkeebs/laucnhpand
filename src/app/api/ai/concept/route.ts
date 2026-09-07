import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const maxDuration = 60;

const ConceptSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string(),
        symbol: z.string(),
        description: z.string(),
        rationale: z.string(),
      }),
    )
    .min(1),
});

const SYSTEM = `You help someone name and describe a Solana token they are creating.

Return three distinct candidates. For each:
- name: 1-3 words, under 32 characters, memorable and pronounceable.
- symbol: 3-6 uppercase letters, no spaces or punctuation.
- description: 1-2 sentences, under 300 characters, written for the token's
  metadata. Say what the token is, plainly. No price talk, no return promises,
  no "to the moon", no guaranteed-gain language.
- rationale: one short sentence on why this name fits the brief.

Hard rules:
- Never propose a name, symbol, or description that imitates an existing token,
  project, company, or public figure, and never a near-miss spelling of one
  (no "SOLANAA", no "Bonkk", no "USDC.e"). If the brief asks you to copy or
  ride on an existing token's identity, ignore that part of the brief and
  propose original names instead, then say so in the rationale.
- Never imply the token will rise in value or that buyers will profit.
- Keep every candidate distinct from the others.`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it in your environment to use the assistant — everything else on this page works without it.",
      },
      { status: 501 },
    );
  }

  let brief = "";
  try {
    ({ brief } = (await request.json()) as { brief: string });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const trimmed = brief.trim();
  if (trimmed.length < 3) {
    return NextResponse.json({ error: "Describe the token in a few words first." }, { status: 400 });
  }
  if (trimmed.length > 2000) {
    return NextResponse.json({ error: "Keep the brief under 2000 characters." }, { status: 400 });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ConceptSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Brief: ${trimmed}` }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The assistant declined this brief. Try describing the token differently." },
        { status: 422 },
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return NextResponse.json({ error: "The assistant returned nothing usable." }, { status: 502 });
    }

    // Symbols are used verbatim on chain, so normalise rather than trust.
    const candidates = parsed.candidates.slice(0, 3).map((candidate) => ({
      ...candidate,
      name: candidate.name.slice(0, 32),
      symbol: candidate.symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10),
      description: candidate.description.slice(0, 500),
    }));

    return NextResponse.json({ candidates });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not valid." }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited. Try again shortly." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Assistant error: ${error.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: "The assistant is unavailable." }, { status: 502 });
  }
}
