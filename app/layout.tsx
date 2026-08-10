import type { Metadata } from "next";
import "./globals.css";
import { GlobalSoundEffects } from "./SoundEffects";
import Splash from "./Splash";

const description = "네 슬라임과 함께 제한된 턴 안에 주문을 완성하는 주방 운영 게임";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "https://run-the-pass.github.io/NAN2026/",
  ),
  title: "슬라임 레스토랑",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "슬라임 레스토랑",
    description,
    url: "/",
    siteName: "슬라임 레스토랑",
    locale: "ko_KR",
    type: "website",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "슬라임 레스토랑 홈 화면",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "슬라임 레스토랑",
    description,
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
      <body>
        <GlobalSoundEffects />
        <Splash />
        {children}
      </body>
    </html>
  );
}
