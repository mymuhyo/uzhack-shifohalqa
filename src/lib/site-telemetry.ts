export function filterPrivatePageTelemetry<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url, 'https://shifohalqa.invalid');
    const pathname = decodeURIComponent(url.pathname);
    // The caregiver path carries a bearer token for read-only sharing.
    if (pathname === '/caregiver' || pathname.startsWith('/caregiver/')) return null;
    return event;
  } catch {
    return null;
  }
}
