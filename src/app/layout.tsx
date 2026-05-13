import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Space_Mono } from 'next/font/google';
import './globals.css';
import { NowPlayingProvider } from '@/context/NowPlayingContext';
import NowPlayingBar from '@/components/NowPlayingBar';

const playfair = Playfair_Display({
  subsets:  ['latin'],
  weight:   ['400', '700', '900'],
  style:    ['normal', 'italic'],
  variable: '--font-playfair',
  display:  'swap',
});

const spaceMono = Space_Mono({
  subsets:  ['latin'],
  weight:   ['400', '700'],
  variable: '--font-mono',
  display:  'swap',
});

export const metadata: Metadata = {
  title:       'NeedleDrop',
  description: 'Your vinyl collection, beautifully tracked.',
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  width:       'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${spaceMono.variable}`}>
      <body style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        <NowPlayingProvider>
          {children}
          <NowPlayingBar />
        </NowPlayingProvider>
      </body>
    </html>
  );
}
