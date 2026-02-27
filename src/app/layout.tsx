import "promise-polyfill/src/polyfill";
import "whatwg-fetch";
import "core-js/stable";
import "regenerator-runtime/runtime";
import "./globals.css";
import { Inter } from "next/font/google";
import React from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "SpinWatcher",
  description: "Vinyl Collection Interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className + " bg-black text-white overflow-hidden"}>
        {children}
      </body>
    </html>
  );
}
