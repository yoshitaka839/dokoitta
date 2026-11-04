import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "どこいった？",
  description: "いつもの眼鏡を、声で一緒に探すアプリ",
  // ホーム画面のアイコンからも Safari の中で開く（別のアプリとして開くと、Safari で入れた設定が見えず、
  // マイクの許可も開くたびに求められるため）
  appleWebApp: { capable: false, title: "どこいった？" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
