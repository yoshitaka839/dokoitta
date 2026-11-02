"use client";

// 家族が後から見るページ。探した記録はこの iPad の中にだけ残っている。
import { useEffect, useState } from "react";
import Link from "next/link";
import { foundCounts, loadHistory, type SearchRecord } from "@/lib/history";

const ENDED: Record<SearchRecord["ended"], string> = {
  found: "見つかった",
  rest: "途中で休んだ",
  "all-checked": "ひととおり見て休んだ",
  stopped: "途中で終わった",
};

export default function Family() {
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setRecords(loadHistory());
    setCounts(foundCounts());
  }, []);

  const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <main>
      <h1>探した記録（家族用）</h1>
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

      {records.map((r, i) => (
        <div className="card" key={i}>
          <div style={{ fontWeight: "bold" }}>
            {new Date(r.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
            　{ENDED[r.ended]}
            {r.foundAt ? `：${r.foundAt}` : ""}
          </div>
          {r.utterances.length > 0 && <div className="muted">話したこと：「{r.utterances.join("」「")}」</div>}
          <div style={{ fontSize: 20 }}>見た場所：{r.checked.length ? r.checked.join(" → ") : "なし"}</div>
        </div>
      ))}

      <p>
        <Link href="/">トップへ</Link>
      </p>
    </main>
  );
}
