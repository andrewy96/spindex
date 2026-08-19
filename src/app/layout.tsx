import type { Metadata } from "next";
import { Inter, Orbitron, Noto_Sans_SC } from "next/font/google";
import { SITE_URL } from "@/lib/siteUrl";
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

const siteTitle = "SPINDEX";
const siteDescription =
  "The Beyblade X catalog & combo lab - browse every blade, lock chip, assist blade, ratchet and bit, build combos and share them.";
const shareImage = "/brand/spindex-share-card.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteTitle,
  description: siteDescription,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    type: "website",
    images: [
      {
        url: shareImage,
        width: 1200,
        height: 630,
        alt: "SPINDEX Beyblade X platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [shareImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${notoSC.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
