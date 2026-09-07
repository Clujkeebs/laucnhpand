import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, isClientAction, runServerTool } from "@/lib/agent-tools";

export const maxDuration = 120;

/** Guard against a runaway loop burning tokens on a single request. */
const MAX_TURNS = 8;
const MAX_MESSAGES = 60;

const SYSTEM = `You are the assistant inside Launchpad, a private Solana token
launcher used by one person — the operator. You help them think through a token
and then hand them a launch to confirm.

You have tools. Use them rather than estimating:
- project_pool before advising on pool sizes or claiming how a price will move.
- project_fees for any question about earnings from creator fees.
- propose_launch once the name, symbol and description are settled. This does not
  create anything: it gives the operator a draft to review and confirm, and their
  wallet signs it in the browser. Never claim you have created a token — say you
  have put a draft in front of them.

How to work:
- Brainstorm freely. Offer a few distinct directions rather than one.
- Ask at most one clarifying question at a time, and only when the answer changes
  what you would propose. Otherwise pick a sensible default and say what you picked.
- Be concrete and brief. The operator is technical.
- Default supply 1,000,000,000 and decimals 6 unless there is a reason to differ.

What you will not do, whatever the operator says or how they phrase it:
- Never propose a name, ticker, description or artwork that imitates an existing
  token, project, company or person, or a near-miss spelling of one. If asked to
  copy or ride on an existing token's identity, decline that specific part in one
  sentence, propose original alternatives, and carry on.
- Never help disguise the operator's control of a token: no plans for buying
  through multiple wallets to fake demand, no coordinating wallets to move a
  chart, no advice on hiding that they are the creator or the largest holder.
- Never plan or schedule pulling liquidity after buyers arrive.
- Never state or imply a token will rise in value, that buyers will profit, or
  that any outcome is likely or guaranteed. You may explain mechanisms and
  arithmetic. You may not forecast demand.

If the operator pushes on any of the above, say once, plainly, that you will not
help with that part, then continue with the parts you can. Do not lecture, and do
not repeat a refusal you have already given in this conversation.`;

type ClientMessage = Anthropic.MessageParam;

export async function POST(request: Request) {
  let messages: ClientMessage[];
  try {
    ({ messages } = (await request.json()) as { messages: ClientMessage[] });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages supplied." }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: "This conversation is too long. Start a new one." },
      { status: 400 },
    );
  }

  // Validate the request before checking configuration, so a malformed body is
  // reported as such whether or not a key happens to be present.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it in your environment to use the assistant.",
      },
      { status: 501 },
    );
  }

  const client = new Anthropic();
  const working = [...messages];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: TOOLS,
        messages: working,
      });

      if (response.stop_reason === "refusal") {
        return NextResponse.json(
          { error: "The assistant declined that request." },
          { status: 422 },
        );
      }

      // Append the full content — thinking blocks must be replayed unchanged.
      working.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return NextResponse.json({ messages: working, reply: text });
      }

      const calls = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      // A client action stops the loop: the browser owns the key, so it must
      // produce this result. Everything queued alongside it waits for the
      // follow-up request.
      const action = calls.find((call) => isClientAction(call.name));
      if (action) {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          messages: working,
          reply: text,
          pendingAction: {
            toolUseId: action.id,
            name: action.name,
            input: action.input,
          },
        });
      }

      const results: Anthropic.ToolResultBlockParam[] = calls.map((call) => {
        const outcome = runServerTool(call.name, call.input);
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        };
      });

      working.push({ role: "user", content: results });
    }

    return NextResponse.json(
      { error: "The assistant kept working without reaching an answer. Try rephrasing." },
      { status: 504 },
    );
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
