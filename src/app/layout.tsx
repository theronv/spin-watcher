import "./globals.css";
import { Playfair_Display, Space_Mono } from "next/font/google";
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

export const metadata = {
  title: "NeedleDrop",
  description: "Vinyl Collection Interface",
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
