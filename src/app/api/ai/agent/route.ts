import { NextResponse } from "next/server";
import { TOOLS, isClientAction, runServerTool } from "@/lib/agent-tools";
import { LlmError, activeProvider, chat, providerLabel, type ChatTurn } from "@/lib/llm";

export const maxDuration = 120;

/** Guard against a runaway loop burning tokens on a single request. */
const MAX_TURNS = 8;
const MAX_HISTORY = 60;

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

const TOOL_SPECS = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description ?? "",
  parameters: tool.input_schema as Record<string, unknown>,
}));

export async function POST(request: Request) {
  let turns: ChatTurn[];
  try {
    ({ turns } = (await request.json()) as { turns: ChatTurn[] });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!Array.isArray(turns) || turns.length === 0) {
    return NextResponse.json({ error: "No messages supplied." }, { status: 400 });
  }
  if (turns.length > MAX_HISTORY) {
    return NextResponse.json(
      { error: "This conversation is too long. Start a new one." },
      { status: 400 },
    );
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

  const working = [...turns];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const result = await chat(SYSTEM, working, TOOL_SPECS);

      if (result.refused) {
        return NextResponse.json(
          { error: "The assistant declined that request." },
          { status: 422 },
        );
      }

      working.push({
        role: "assistant",
        text: result.text,
        toolCalls: result.toolCalls.length ? result.toolCalls : undefined,
      });

      if (result.toolCalls.length === 0) {
        return NextResponse.json({ turns: working, reply: result.text, provider: providerLabel() });
      }

      // A client action stops the loop: the browser owns the key, so only it can
      // produce this result.
      const action = result.toolCalls.find((call) => isClientAction(call.name));
      if (action) {
        return NextResponse.json({
          turns: working,
          reply: result.text,
          provider: providerLabel(),
          pendingAction: { toolUseId: action.id, name: action.name, input: action.input },
        });
      }

      for (const call of result.toolCalls) {
        const outcome = runServerTool(call.name, call.input);
        working.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: outcome.content,
        });
      }
    }

    return NextResponse.json(
      { error: "The assistant kept working without reaching an answer. Try rephrasing." },
      { status: 504 },
    );
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The assistant is unavailable." }, { status: 502 });
  }
}
