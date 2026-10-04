import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import "@/components/ui.css";
import { THEME_INIT_SCRIPT } from "@/lib/ui/settings";

// Fonts load into *-loaded variables; globals.css maps them onto --font-inter / --font-geist-mono.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter-loaded", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono-loaded", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Jotter",
  description: "Linked Markdown notes, saved to your own GitHub repository.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
