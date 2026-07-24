import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "터진다! 슬라임 공방",
  description: "NAN 2026 음성 명령 마법 공방 게임",
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
