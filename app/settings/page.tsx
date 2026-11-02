"use client";

// 家族用の設定。家の中で眼鏡がありそうな場所を、この iPad の中にだけ保存する。
// サーバーにも GitHub にも保存しない（探すときに、場所の名前だけが並べ替えのために送られる）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { BODY_PLACES, SAMPLE_HOME_PLACES, loadHomeText, parsePlacesText, placesToText, saveHomeText } from "@/lib/places";

export default function Settings() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<"sample" | "custom">("sample");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = loadHomeText();
    setText(t ?? placesToText(SAMPLE_HOME_PLACES));
    setSaved(t ? "custom" : "sample");
  }, []);

  const parsed = parsePlacesText(text);

  const save = () => {
    saveHomeText(text);
    setSaved("custom");
    setMsg("この iPad に保存しました。");
  };
  const reset = () => {
    saveHomeText(null);
    setText(placesToText(SAMPLE_HOME_PLACES));
    setSaved("sample");
    setMsg("サンプルの場所にもどしました。");
  };

  return (
    <main>
      <h1>場所の設定（家族用）</h1>
      <p className="muted">
        1行に1か所、「名前 | 確かめ方 | 怪しい時刻」の形で書きます。上に書いた場所ほど、いつもの場所として先に聞きます。
        怪しい時刻は任意で、16 と書くと15〜17時ごろに先に聞きます（7,21 のように複数も可）。
        頭の上・首元・服のポケットは、いつも最初に聞くので書かなくて大丈夫です。
      </p>
      <p className="muted">この内容はこの iPad の中にだけ保存され、GitHub などには上がりません。</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        style={{ width: "100%", fontSize: 20, padding: 12, borderRadius: 12, border: "2px solid var(--line)" }}
      />
      <div style={{ display: "flex", gap: 16 }}>
        <button className="big-button" style={{ minHeight: 72, fontSize: 28 }} onClick={save}>保存する</button>
        <button className="big-button no" style={{ minHeight: 72, fontSize: 28 }} onClick={reset}>サンプルにもどす</button>
      </div>
      {msg && <p>{msg}</p>}
      <div className="card">
        <div className="muted">今の設定（{saved === "custom" ? "この iPad に保存した場所" : "サンプル"}）で聞く場所</div>
        <ol style={{ fontSize: 20, margin: "8px 0 0" }}>
          {BODY_PLACES.map((p) => (
            <li key={p.id}>{p.name}（いつも最初）</li>
          ))}
          {parsed.map((p) => (
            <li key={p.id}>
              {p.name}：{p.action}
              {p.hours ? `（${p.hours.join("時・")}時ごろ）` : ""}
            </li>
          ))}
        </ol>
      </div>
      <p><Link href="/talk">探す画面へ</Link></p>
    </main>
  );
}
