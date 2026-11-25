'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AuthLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/');
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="default" disabled={busy} onClick={() => void logout()}>
      <LogOut data-icon="inline-start" aria-hidden="true" />
      <span>{busy ? 'Chiqilmoqda…' : 'Hisobdan chiqish'}</span>
    </Button>
  );
}
