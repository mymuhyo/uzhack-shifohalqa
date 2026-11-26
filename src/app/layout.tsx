import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteTelemetry } from '@/components/site-telemetry';
import '@fontsource-variable/rethink-sans';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import { OfflineBanner, TextScaleToggle, ThemeToggle } from '@/components/accessibility-controls';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ShifoHalqa', template: '%s · ShifoHalqa' },
  description: 'Shifokor va bemor uchun uy davolanishi va reabilitatsiyani kuzatish tizimi.',
  robots: { index: false, follow: false },
};

const colorSchemeInitScript = `try{var s=localStorage.getItem('shifo_color_scheme');if(s==='light'||s==='dark'){document.querySelector('meta[name="color-scheme"]').setAttribute('content',s);}if(localStorage.getItem('shifo_text_scale')==='large'){document.documentElement.dataset.textScale='large';}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const showVercelTelemetry = process.env.VERCEL === '1';
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: colorSchemeInitScript }} />
      </head>
      <body>
        <Providers>
          <a className="skip-link" href="#content">Asosiy mazmunga o‘tish</a>
          <header className="site-header">
            <div className="frame header-inner">
              <Link className="wordmark" href="/">
                <span className="wordmark-symbol" aria-hidden="true" />
                <span>ShifoHalqa</span>
              </Link>
              <nav className="header-nav" aria-label="Asosiy menyu">
                <ThemeToggle />
                <TextScaleToggle />
                <Link
                  href="/about"
                  className="rounded-full px-3 py-1.5 text-sm font-normal text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Demo haqida
                </Link>
              </nav>
            </div>
          </header>
          <OfflineBanner />
          {children}
          {showVercelTelemetry && <SiteTelemetry />}
        </Providers>
      </body>
    </html>
  );
}
