import { expect, it } from 'vitest';
import { filterPrivatePageTelemetry } from '../../src/lib/site-telemetry';

it.each([
  'https://shifohalqa.example/caregiver/demo-token?ref=demo',
  '/caregiver/demo-token',
  '/caregiver%2Fdemo-token',
  '/caregiver',
  '/caregiver/%ZZ',
])('drops telemetry for a private or malformed URL %s', (url) => {
  expect(filterPrivatePageTelemetry({ url })).toBeNull();
});

it('keeps public telemetry and its event payload', () => {
  const vitals = { url: 'https://shifohalqa.example/demo/mashq', metric: 'LCP', value: 1200 };
  const pageview = { url: '/about', type: 'pageview' };
  expect(filterPrivatePageTelemetry(vitals)).toBe(vitals);
  expect(filterPrivatePageTelemetry(pageview)).toBe(pageview);
});
