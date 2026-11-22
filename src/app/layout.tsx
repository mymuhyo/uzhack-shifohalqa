import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteTelemetry } from '@/components/site-telemetry';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/literata/500.css';
import { OfflineBanner, TextScaleToggle } from '@/components/accessibility-controls';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ShifoHalqa', template: '%s · ShifoHalqa' },
  description: 'Shifokor va bemor uchun uy davolanishini kuzatish demosi.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>
        <a className="skip-link" href="#content">Asosiy mazmunga o‘tish</a>
        <header className="site-header">
          <div className="frame header-inner">
            <Link className="wordmark" href="/">
              <span className="wordmark-symbol" aria-hidden="true" />
              ShifoHalqa
            </Link>
            <nav className="header-nav" aria-label="Asosiy menyu">
              <TextScaleToggle />
              <Link href="/about">Demo haqida</Link>
            </nav>
          </div>
        </header>
        <OfflineBanner />
        {children}
        <SiteTelemetry />
      </body>
    </html>
  );
}
