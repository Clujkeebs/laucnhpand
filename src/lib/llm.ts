/**
 * Model provider adapter.
 *
 * Anthropic is the default and stays first-class. OpenRouter is supported as an
 * alternative because it fronts cheap and free models — set OPENROUTER_API_KEY
 * and it takes over. Its API is OpenAI-shaped, so the two are normalised here
 * into one small surface: give it messages and tools, get back text or tool
 * calls.
 */

import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openrouter";

/** Sensible default when OPENROUTER_MODEL is unset: cheap, and good at tools. */
const OPENROUTER_DEFAULT = "anthropic/claude-3.5-haiku";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function activeProvider(): Provider | null {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function providerLabel(): string {
  const provider = activeProvider();
  if (provider === "openrouter") {
    return `OpenRouter · ${process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT}`;
  }
  if (provider === "anthropic") return "Anthropic · claude-opus-5";
  return "not configured";
}

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolCall = { id: string; name: string; input: unknown };

export type ChatResult = {
  text: string;
  toolCalls: ToolCall[];
  /** True when the model declined the request outright. */
  refused: boolean;
};

export class LlmError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

/* ------------------------------- Anthropic ------------------------------- */

export function toAnthropicMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const call of turn.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.input as Record<string, unknown>,
        });
      }
      if (content.length) messages.push({ role: "assistant", content });
    } else {
      // Consecutive tool results belong in one user turn.
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: turn.toolCallId,
        content: turn.content,
      };
      const last = messages[messages.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
    }
  }

  return messages;
}

async function chatAnthropic(
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[],
): Promise<ChatResult> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: toAnthropicMessages(turns),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    })),
  });

  return {
    refused: response.stop_reason === "refusal",
    text: response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim(),
    toolCalls: response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, input: block.input })),
  };
}

/* ------------------------------- OpenRouter ------------------------------ */

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export function toOpenAiMessages(system: string, turns: ChatTurn[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }];

  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        ...(turn.toolCalls?.length
          ? {
              tool_calls: turn.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.input) },
              })),
            }
          : {}),
      });
    } else {
      messages.push({ role: "tool", tool_call_id: turn.toolCallId, content: turn.content });
    }
  }

  return messages;
}

async function chatOpenRouter(
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[],
): Promise<ChatResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "X-Title": "Launchpad",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT,
      max_tokens: 4000,
      messages: toOpenAiMessages(system, turns),
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmError(
      `OpenRouter returned ${response.status}. ${detail.slice(0, 300)}`,
      response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
    );
  }

  const body = (await response.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
      finish_reason?: string;
    }[];
    error?: { message?: string };
  };

  if (body.error) throw new LlmError(body.error.message ?? "OpenRouter error.", 502);
  const message = body.choices?.[0]?.message;
  if (!message) throw new LlmError("OpenRouter returned no message.", 502);

  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call) => {
    let input: unknown = {};
    try {
      // Weaker models sometimes emit malformed argument JSON; treat that as an
      // empty call rather than crashing the loop.
      input = JSON.parse(call.function.arguments || "{}");
    } catch {
      input = {};
    }
    return { id: call.id, name: call.function.name, input };
  });

  return { text: (message.content ?? "").trim(), toolCalls, refused: false };
}

/* --------------------------------- Entry --------------------------------- */

export async function chat(
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[] = [],
): Promise<ChatResult> {
  const provider = activeProvider();
  if (!provider) {
    throw new LlmError(
      "No model configured. Set OPENROUTER_API_KEY (cheap and free models) or ANTHROPIC_API_KEY.",
      501,
    );
  }

  try {
    return provider === "openrouter"
      ? await chatOpenRouter(system, turns, tools)
      : await chatAnthropic(system, turns, tools);
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new LlmError("ANTHROPIC_API_KEY is not valid.", 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new LlmError("Rate limited. Try again shortly.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new LlmError(`Assistant error: ${error.message}`, 502);
    }
    throw new LlmError("The assistant is unavailable.", 502);
  }
}
