import { NextResponse } from "next/server";
import { LlmError, activeProvider, chat } from "@/lib/llm";

export const maxDuration = 60;

const SYSTEM = `You name Solana tokens. Reply with ONLY a JSON object, no prose
and no code fences, of the shape:

{"candidates":[{"name":"","symbol":"","description":"","rationale":""}]}

Return exactly three candidates. For each:
- name: 1-3 words, under 32 characters, memorable and pronounceable.
- symbol: 3-6 uppercase letters, no spaces or punctuation.
- description: 1-2 sentences, under 300 characters, for the token metadata. No
  price talk, no return promises, no guaranteed-gain language.
- rationale: one short sentence on why this name fits the brief.

Hard rules:
- Never propose a name, symbol or description that imitates an existing token,
  project, company or public figure, or a near-miss spelling of one. If the brief
  asks you to copy or ride on an existing token's identity, ignore that part and
  propose original names, then say so in the rationale.
- Never imply the token will rise in value or that buyers will profit.
- Keep every candidate distinct.`;

type Candidate = { name: string; symbol: string; description: string; rationale: string };

/** Models vary in how cleanly they emit JSON; recover the object if wrapped. */
function extractCandidates(text: string): Candidate[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { candidates?: Candidate[] };
    return Array.isArray(parsed.candidates) && parsed.candidates.length ? parsed.candidates : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let brief = "";
  try {
    ({ brief } = (await request.json()) as { brief: string });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const trimmed = (brief ?? "").trim();
  if (trimmed.length < 3) {
    return NextResponse.json({ error: "Describe the token in a few words first." }, { status: 400 });
  }
  if (trimmed.length > 2000) {
    return NextResponse.json({ error: "Keep the brief under 2000 characters." }, { status: 400 });
  }
  if (!activeProvider()) {
    return NextResponse.json(
      {
        error:
          "No model configured. Set OPENROUTER_API_KEY (cheap and free models) or ANTHROPIC_API_KEY.",
      },
      { status: 501 },
    );
  }

  try {
    const result = await chat(SYSTEM, [{ role: "user", text: `Brief: ${trimmed}` }]);
    if (result.refused) {
      return NextResponse.json(
        { error: "The assistant declined this brief. Try describing the token differently." },
        { status: 422 },
      );
    }

    const parsed = extractCandidates(result.text);
    if (!parsed) {
      return NextResponse.json(
        { error: "The model did not return usable JSON. A stronger model may do better." },
        { status: 502 },
      );
    }

    // Symbols land on chain verbatim, so normalise rather than trust.
    const candidates = parsed.slice(0, 3).map((candidate) => ({
      name: String(candidate.name ?? "").slice(0, 32),
      symbol: String(candidate.symbol ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10),
      description: String(candidate.description ?? "").slice(0, 500),
      rationale: String(candidate.rationale ?? "").slice(0, 300),
    }));

    return NextResponse.json({ candidates });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The assistant is unavailable." }, { status: 502 });
  }
}
