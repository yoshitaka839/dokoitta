"use client";

// 家族が後から見るページ。探した記録はこの iPad の中にだけ残っている。
import { useEffect, useState } from "react";
import Link from "next/link";
import { foundCounts, loadHistory, type SearchRecord } from "@/lib/history";
import { setupStatus, statusLine } from "@/lib/setupstatus";

const ENDED: Record<SearchRecord["ended"], string> = {
  searching: "探している途中で閉じた",
  found: "見つかった",
  rest: "あきらめた",
  "no-reply": "返事がなかった",
  "all-checked": "ひととおり見て終わった",
  stopped: "途中で終わった",
};

// 家族が声をかけるきっかけにしたい記録（あきらめた・返事なし・古い方を持って行ったかもしれない）
const needsCall = (r: SearchRecord) => r.ended === "rest" || r.ended === "no-reply" || r.ended === "searching" || !!r.lookNoReply;

export default function Family() {
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    setRecords(loadHistory());
    setCounts(foundCounts());
    const st = setupStatus();
    setStatus(statusLine(st));
    setSample(!st.custom);
  }, []);

  const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <main>
      <h1>探した記録（家族用）</h1>
      {status && (
        <div className="card" style={{ fontSize: 22, fontWeight: 700, color: sample ? "#b5482f" : "#2e7d4f", borderColor: sample ? "#b5482f" : undefined }}>
          {status}
          {sample && (
            <>
              {" "}
              <Link href="/settings">設定を入れる</Link>
            </>
          )}
        </div>
      )}
      <p className="muted">この iPad の中にだけ残っている記録です。新しいものが上です。</p>

      <div className="card">
        <div className="muted">よく見つかる場所</div>
        {ranking.length === 0 ? (
          <div>まだ記録がありません</div>
        ) : (
          <ol style={{ margin: "8px 0 0" }}>
            {ranking.map(([name, n]) => (
              <li key={name}>
                {name}（{n}回）
              </li>
            ))}
          </ol>
        )}
      </div>

      {records.filter((r) => !r.practice).map((r, i) => (
        <div className="card" key={i} style={needsCall(r) ? { borderColor: "#b5482f", background: "#fff3ef" } : undefined}>
          <div style={{ fontWeight: "bold" }}>
            {new Date(r.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
            　{ENDED[r.ended]}
            {r.foundAt ? `：${r.foundAt}` : ""}
          </div>
          {r.utterances.length > 0 && <div className="muted">話したこと：「{r.utterances.join("」「")}」</div>}
          <div style={{ fontSize: 20 }}>見た場所：{r.checked.length ? r.checked.join(" → ") : "なし"}</div>
          {r.nextPlace && <div style={{ fontSize: 24, fontWeight: "bold", color: "#b5482f" }}>次に見るなら：{r.nextPlace}</div>}
          {r.oldFound?.length ? <div style={{ fontSize: 20 }}>古い方の老眼鏡が見つかった場所：{r.oldFound.join("、")}</div> : null}
          {r.lookNoReply && <div style={{ fontSize: 20, color: "#b5482f" }}>確かめの返事なし（古い方を持って行ったかもしれません）</div>}
        </div>
      ))}

      {records.some((r) => r.practice) && (
        <details className="card">
          <summary className="muted">練習・動作確認の記録（{records.filter((r) => r.practice).length}件、回数には数えません）</summary>
          {records.filter((r) => r.practice).map((r, i) => (
            <div key={i} style={{ fontSize: 18, marginTop: 8 }}>
              {new Date(r.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}　
              {ENDED[r.ended]}
              {r.foundAt ? `：${r.foundAt}` : ""}　見た場所：{r.checked.join(" → ") || "なし"}
            </div>
          ))}
        </details>
      )}

      <p>
        <Link href="/">トップへ</Link>
      </p>
    </main>
  );
}
