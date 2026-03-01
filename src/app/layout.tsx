import "./globals.css";
import { Playfair_Display, Space_Mono } from "next/font/google";
import type { Metadata } from "next";
import React from "react";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "700", "900"],
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NeedleDrop",
  description: "Your vinyl collection, beautifully tracked.",
  openGraph: {
    title: "NeedleDrop",
    description: "Your vinyl collection, beautifully tracked.",
    url: "https://needle-drop.com",
    siteName: "NeedleDrop",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "NeedleDrop" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeedleDrop",
    description: "Your vinyl collection, beautifully tracked.",
    images: ["/og.png"],
  },
  metadataBase: new URL("https://needle-drop.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${spaceMono.variable}`}>
      <body className="overflow-hidden" style={{ background: "#0c0a07", color: "#f5f0e8" }}>
        {children}
      </body>
    </html>
  );
}
