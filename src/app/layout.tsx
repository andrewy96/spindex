import type { Metadata } from "next";
import { Inter, Orbitron, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron" });
const notoSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sc",
  // Only ever a fallback behind Inter, so it should not compete for first paint.
  preload: false,
});

export const metadata: Metadata = {
  title: "SPINDEX",
  description:
    "The Beyblade X catalog & combo lab - browse every blade, lock chip, assist blade, ratchet and bit, build combos and share them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${notoSC.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
