import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>どこいった？</h1>
      <p>いつもの眼鏡を、声で一緒に探すアプリです（準備中）。</p>
      <Link href="/talk" className="big-button" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
        はじめる
      </Link>
      <p className="muted">
        <Link href="/family">探した記録（家族用）</Link> ／ <Link href="/settings">場所の設定（家族用）</Link> ／ <Link href="/voice-test">声の聞き取りテスト</Link>
      </p>
    </main>
  );
}
