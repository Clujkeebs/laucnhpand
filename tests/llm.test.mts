import assert from "node:assert/strict";
import { toAnthropicMessages, toOpenAiMessages, type ChatTurn } from "../src/lib/llm.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

const convo: ChatTurn[] = [
  { role: "user", text: "brainstorm" },
  { role: "assistant", text: "checking", toolCalls: [
    { id: "t1", name: "project_pool", input: { a: 1 } },
    { id: "t2", name: "project_fees", input: { b: 2 } },
  ] },
  { role: "tool", toolCallId: "t1", name: "project_pool", content: "{}" },
  { role: "tool", toolCallId: "t2", name: "project_fees", content: "{}" },
  { role: "user", text: "go on" },
];

check("anthropic: consecutive tool results merge into one user turn", () => {
  const messages = toAnthropicMessages(convo);
  // user, assistant, user(2 tool_results), user
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "user", "user"]);
  const results = messages[2].content as { type: string; tool_use_id: string }[];
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.tool_use_id), ["t1", "t2"]);
  assert.ok(results.every((r) => r.type === "tool_result"));
});

check("anthropic: assistant tool calls become tool_use blocks after its text", () => {
  const blocks = toAnthropicMessages(convo)[1].content as { type: string; name?: string }[];
  assert.deepEqual(blocks.map((b) => b.type), ["text", "tool_use", "tool_use"]);
  assert.deepEqual(blocks.slice(1).map((b) => b.name), ["project_pool", "project_fees"]);
});

check("anthropic: an assistant turn with no text or calls is dropped", () => {
  const messages = toAnthropicMessages([
    { role: "user", text: "hi" },
    { role: "assistant", text: "" },
  ]);
  assert.deepEqual(messages.map((m) => m.role), ["user"]);
});

check("anthropic: a tool result with no preceding user turn still forms one", () => {
  const messages = toAnthropicMessages([
    { role: "assistant", text: "x", toolCalls: [{ id: "t1", name: "n", input: {} }] },
    { role: "tool", toolCallId: "t1", name: "n", content: "done" },
  ]);
  assert.deepEqual(messages.map((m) => m.role), ["assistant", "user"]);
});

check("openai: system prompt is prepended exactly once", () => {
  const messages = toOpenAiMessages("SYS", convo);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[0].content, "SYS");
  assert.equal(messages.filter((m) => m.role === "system").length, 1);
});

check("openai: tool results stay as separate tool messages", () => {
  const messages = toOpenAiMessages("SYS", convo);
  const toolMessages = messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 2);
  assert.deepEqual(toolMessages.map((m) => m.tool_call_id), ["t1", "t2"]);
});

check("openai: tool call arguments are serialised as JSON strings", () => {
  const assistant = toOpenAiMessages("SYS", convo).find((m) => m.role === "assistant")!;
  assert.equal(assistant.tool_calls?.length, 2);
  assert.deepEqual(JSON.parse(assistant.tool_calls![0].function.arguments), { a: 1 });
  assert.equal(assistant.tool_calls![0].type, "function");
});

check("openai: an assistant turn with no text sends null content, not empty string", () => {
  const messages = toOpenAiMessages("SYS", [
    { role: "user", text: "hi" },
    { role: "assistant", text: "", toolCalls: [{ id: "t", name: "n", input: {} }] },
  ]);
  assert.equal(messages[2].content, null);
});

check("both providers preserve turn order", () => {
  const anthropicUsers = toAnthropicMessages(convo).filter((m) => typeof m.content === "string");
  assert.equal(anthropicUsers.length, 2);
  const openai = toOpenAiMessages("S", convo);
  assert.deepEqual(openai.map((m) => m.role), ["system", "user", "assistant", "tool", "tool", "user"]);
});

console.log(`\n${passed} passed`);
