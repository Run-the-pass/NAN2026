import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nan2026-slime-shift.silver-bat-5647.chatgpt.site"),
  title: "슬라임 레스토랑",
  description: "NAN 2026 판타지 슬라임 레스토랑 운영 게임",
  openGraph: {
    title: "슬라임 레스토랑",
    description: "슬라임을 지휘해 3분 안에 주문 5건을 완료하세요.",
  },
  twitter: {
    card: "summary",
    title: "슬라임 레스토랑",
    description: "슬라임을 지휘해 3분 안에 주문 5건을 완료하세요.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
