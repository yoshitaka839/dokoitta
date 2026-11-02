"use client";

// 家族用の設定。家の場所と「していたこと → 場所」のつながりを、この iPad の中にだけ保存する。
// サーバーにも GitHub にも保存しない（探すときに、場所の名前と本人の話だけが並べ替えのために送られる）。

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BODY_CHECK,
  MAIN_COUNT,
  SAMPLE_ACTIVITIES_TEXT,
  SAMPLE_HOME_PLACES,
  loadActivitiesText,
  loadHomeText,
  parseActivitiesText,
  parsePlacesText,
  placesToText,
  saveActivitiesText,
  saveHomeText,
} from "@/lib/places";

const area = { width: "100%", fontSize: 20, padding: 12, borderRadius: 12, border: "2px solid var(--line)" } as const;

export default function Settings() {
  const [text, setText] = useState("");
  const [acts, setActs] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setText(loadHomeText() ?? placesToText(SAMPLE_HOME_PLACES));
    setActs(loadActivitiesText() ?? SAMPLE_ACTIVITIES_TEXT);
  }, []);

  const places = parsePlacesText(text);
  const activities = parseActivitiesText(acts);

  const save = () => {
    saveHomeText(text);
    saveActivitiesText(acts);
    setMsg("この iPad に保存しました。");
  };
  const reset = () => {
    saveHomeText(null);
    saveActivitiesText(null);
    setText(placesToText(SAMPLE_HOME_PLACES));
    setActs(SAMPLE_ACTIVITIES_TEXT);
    setMsg("サンプルにもどしました。");
  };

  return (
    <main>
      <h1>設定（家族用）</h1>
      <p className="muted">ここに書いた内容は、この iPad の中にだけ保存され、GitHub などには上がりません。</p>

      <h2>1. 家の場所</h2>
      <p className="muted">
        1行に1か所、「名前 | 確かめ方 | 怪しい時刻」。上から{MAIN_COUNT}か所が「よく置く場所」で、最初はここだけ確かめます。
        怪しい時刻（任意）は 16 や 7,21 のように書きます。頭の上・首元・ポケットは書かなくて大丈夫です。
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={area} />

      <h2>2. していたこと → 場所</h2>
      <p className="muted">
        1行に1つ、「していたこと、していたこと &gt; 場所の名前」。話の中にその言葉があれば、その場所をいちばん先に確かめます。
        場所の名前は、上の1と同じ書き方にしてください。
      </p>
      <textarea value={acts} onChange={(e) => setActs(e.target.value)} rows={6} style={area} />

      <div style={{ display: "flex", gap: 16 }}>
        <button className="big-button" style={{ minHeight: 72, fontSize: 28 }} onClick={save}>保存する</button>
        <button className="big-button no" style={{ minHeight: 72, fontSize: 28 }} onClick={reset}>サンプルにもどす</button>
      </div>
      {msg && <p>{msg}</p>}

      <div className="card" style={{ fontSize: 20 }}>
        <div className="muted">確かめる順番（手がかりがないとき）</div>
        <ol style={{ margin: "8px 0 0" }}>
          <li>{BODY_CHECK.name}（1回でまとめて聞く）</li>
          {places.filter((p) => p.main).map((p) => (
            <li key={p.id}>
              {p.name}
              {p.hours ? `（${p.hours.join("時・")}時ごろは理由をそえて聞く）` : ""}
            </li>
          ))}
        </ol>
        {places.some((p) => !p.main) && (
          <div className="muted" style={{ marginTop: 8 }}>
            それでもなければ「ほかの場所も見ますか？」と聞いてから: {places.filter((p) => !p.main).map((p) => p.name).join("、")}
          </div>
        )}
      </div>
      <div className="card" style={{ fontSize: 20 }}>
        <div className="muted">していたこと → 先に確かめる場所</div>
        <ul style={{ margin: "8px 0 0" }}>
          {activities.map((a, i) => {
            const ok = places.some((p) => p.name === a.placeName);
            return (
              <li key={i} style={{ color: ok ? undefined : "#b5482f" }}>
                {a.keywords.join("・")} → {a.placeName}
                {ok ? "" : "（1に同じ名前の場所がありません）"}
              </li>
            );
          })}
        </ul>
      </div>
      <p><Link href="/talk">探す画面へ</Link></p>
    </main>
  );
}
