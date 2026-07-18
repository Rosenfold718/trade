import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntraTrade Pro — Внутридневной торговый терминал",
  description: "Профессиональный внутридневной торговый терминал с сигналами LONG/SHORT, уровнями входа/выхода, стоп-лосс и тейк-профит. RSI, MACD, Bollinger Bands, VWAP, свечные паттерны.",
  keywords: ["крипто", "интрадей", "сигналы", "LONG", "SHORT", "RSI", "MACD", "VWAP", "торговля", "внутридневная"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
