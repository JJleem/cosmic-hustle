import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://cosmic-hustle.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Cosmic Hustle — AI 리서치 에이전트",
    template: "%s · Cosmic Hustle",
  },
  description:
    "주제를 던지면 AI 에이전트 11명이 역할 분담해서 조사하고 리포트를 만들어주는 우주 리서치 회사. Research · Creative · Operations 3개 부서, 실시간 스트리밍.",
  keywords: [
    "AI 리서치",
    "AI 에이전트",
    "리서치 자동화",
    "Claude AI",
    "Cosmic Hustle",
    "리포트 생성",
    "AI assistant",
  ],
  authors: [{ name: "Cosmic Hustle" }],
  creator: "Cosmic Hustle",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: APP_URL,
    siteName: "Cosmic Hustle",
    title: "Cosmic Hustle — AI 리서치 에이전트",
    description:
      "주제를 던지면 AI 에이전트 11명이 역할 분담해서 조사하고 리포트를 만들어주는 우주 리서치 회사.",
    images: [
      {
        url: "/opengraph-image.svg",
        width: 1200,
        height: 630,
        alt: "Cosmic Hustle — AI 리서치 에이전트",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cosmic Hustle — AI 리서치 에이전트",
    description:
      "주제를 던지면 AI 에이전트 11명이 역할 분담해서 조사하고 리포트를 만들어주는 우주 리서치 회사.",
    images: ["/opengraph-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  themeColor: "#07091a",
  colorScheme: "dark",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
