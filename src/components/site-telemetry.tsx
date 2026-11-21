'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { filterPrivatePageTelemetry } from '@/lib/site-telemetry';

export function SiteTelemetry() {
  return (
    <>
      <Analytics beforeSend={filterPrivatePageTelemetry} />
      <SpeedInsights beforeSend={filterPrivatePageTelemetry} />
    </>
  );
}
