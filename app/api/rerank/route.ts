// 父の話をもとに、候補の場所の順番を Claude に入れ替えてもらう。
// ・APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY だけに置く（iPadには届かない）
// ・返事は候補IDの中からしか選べない形（enum）に縛り、受け取った後も候補外を捨てる
// ・遅い／失敗したときは、プログラムの順番のまま返す

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { mergeOrder } from "@/lib/rank";

export const runtime = "nodejs";

const MODEL = "claude-haiku-5-5"; // 父の返事を待たせないため、一番速いモデル
const TIMEOUT_MS = 4000;

const SYSTEM = `あなたは、高齢の方が眼鏡を探すのを手伝う係です。
本人の話から、眼鏡がありそうな場所の順番を、渡された候補の中だけで並べ替えます。
- 候補にない場所は絶対に出さない。
- 体まわり（頭の上・首元・服のポケット）は、話と矛盾しない限り前の方に残す。
- 話に手がかりがなければ、渡された順番のまま返す。
- reason は、最初の場所を選んだ理由を、やさしい話し言葉で20文字以内。「必ず」「絶対」などの言い切りは使わない。手がかりがなければ空文字。`;

export async function POST(req: Request) {
  const started = Date.now();
  let body: { utterance?: string; candidates?: { id?: unknown; name?: unknown }[]; hour?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const utterance = (body.utterance ?? "").slice(0, 300);
  // 候補は iPad から名前つきで届く（家の場所は iPad にだけ保存しているため）。形を確かめてから使う
  const items = (Array.isArray(body.candidates) ? body.candidates : [])
    .filter((c) => typeof c?.id === "string" && /^[a-z0-9_-]{1,40}$/.test(c.id) && typeof c?.name === "string")
    .slice(0, 30)
    .map((c) => ({ id: c.id as string, name: (c.name as string).slice(0, 30) }));
  const candidates = [...new Set(items.map((c) => c.id))];
  const nameOf = (id: string) => items.find((c) => c.id === id)!.name;
  const hour = typeof body.hour === "number" && body.hour >= 0 && body.hour < 24 ? Math.floor(body.hour) : null;
  const fallback = (why: string) =>
    Response.json({ order: candidates, reason: "", source: "program", note: why, ms: Date.now() - started });

  if (candidates.length === 0) return Response.json({ error: "no candidates" }, { status: 400 });
  if (!utterance.trim()) return fallback("empty utterance");
  if (!process.env.ANTHROPIC_API_KEY) return fallback("no api key");

  const ids = candidates as [string, ...string[]];
  const Schema = z.object({
    order: z.array(z.enum(ids)),
    reason: z.string(),
  });
  const list = candidates.map((id, i) => `${i + 1}. ${id}（${nameOf(id)}）`).join("\n");

  try {
    const client = new Anthropic({ maxRetries: 0, timeout: TIMEOUT_MS });
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${hour !== null ? `今は${hour}時ごろ。\n` : ""}本人の話:「${utterance}」\n\n候補（今の順番）:\n${list}`,
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return fallback(`no output (${res.stop_reason})`);
    const order = mergeOrder(res.parsed_output.order, candidates);
    const reason = res.parsed_output.reason.replace(/必ず|絶対/g, "").slice(0, 30);
    return Response.json({ order, reason, source: "claude", ms: Date.now() - started });
  } catch (err) {
    const name = err instanceof Anthropic.APIError ? `api ${err.status}` : err instanceof Error ? err.name : "error";
    return fallback(name);
  }
}
