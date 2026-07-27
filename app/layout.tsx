import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nan2026-slime-shift.silver-bat-5647.chatgpt.site"),
  title: "터진다! 슬라임 공방",
  description: "NAN 2026 음성 명령 마법 공방 게임",
  openGraph: {
    title: "터진다! 슬라임 공방",
    description: "목소리로 슬라임을 지휘해 3분 안에 마도서 8권을 완성하세요.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "터진다! 슬라임 공방",
    description: "목소리로 슬라임을 지휘해 3분 안에 마도서 8권을 완성하세요.",
    images: ["/og.png"],
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
