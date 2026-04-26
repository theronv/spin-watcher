import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'NeedleDrop',
  description: 'Your vinyl collection, beautifully tracked.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
