import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>どこいった？</h1>
      <p>いつもの眼鏡を、声で一緒に探すアプリです（準備中）。</p>
      <p>
        <Link href="/voice-test">声の聞き取りテストへ</Link>
      </p>
    </main>
  );
}
