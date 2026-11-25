'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const CLINIC_PREVIEW_ACCOUNTS = [
  { label: 'Dr. Kamola (Shifokor)', email: 'shifokor@demo.shifohalqa.uz', role: 'Shifokor' },
  { label: 'Anvar (Yuqori BP)', email: 'anvar@demo.shifohalqa.uz', role: 'Bemor' },
  { label: 'Malika (Dori tugagan)', email: 'malika@demo.shifohalqa.uz', role: 'Bemor' },
  { label: 'Rustam (Barqaror)', email: 'rustam@demo.shifohalqa.uz', role: 'Bemor' },
] as const;

const PREVIEW_PASSWORD = 'ShifoDemo2026!';

const loginErrors: Record<string, string> = {
  invalid_credentials: 'Email yoki parol noto‘g‘ri. Qayta tekshiring.',
  forbidden: 'Bu hisobga klinika ruxsati berilmagan.',
  unavailable: 'Kirish xizmati vaqtincha band. Bir ozdan so‘ng urinib ko‘ring.',
  invalid: 'Email va parolni to‘g‘ri kiriting.',
};

export function HomeClinicLogin() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: { role?: string } | null;
      };
      if (!response.ok || !body.session) {
        setError(loginErrors[body.error ?? ''] ?? 'Kirish amalga oshmadi.');
        return;
      }
      const destination = body.session.role === 'doctor' ? '/doctor' : '/patient';
      router.push(destination);
      router.refresh();
    } catch {
      setError('Tarmoq xatosi. Internet aloqasini tekshiring.');
    } finally {
      setPending(false);
    }
  }

  function applyPreviewAccount(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(PREVIEW_PASSWORD);
    setError('');
  }

  return (
    <Card className="mt-4 border border-border bg-card shadow-[var(--surface-shadow)]">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            <span>Klinika hisobiga kirish</span>
          </CardTitle>
          <Badge variant="secondary">Supabase Auth</Badge>
        </div>
        <CardDescription>
          Ko‘p bemorli shifokor navbati va haqiqiy bemor sessiyalari (sintetik sinov hisoblari).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!expanded ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-between"
            onClick={() => setExpanded(true)}
            aria-expanded="false"
          >
            <span className="inline-flex items-center gap-2">
              <LogIn data-icon="inline-start" aria-hidden="true" />
              <span>Klinika hisobi bilan kirish</span>
            </span>
            <span aria-hidden="true">↓</span>
          </Button>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Tayyor sintetik klinika hisoblari (1 klik):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CLINIC_PREVIEW_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="template-chip"
                    aria-pressed={email === account.email}
                    onClick={() => applyPreviewAccount(account.email)}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="clinic-login-email" className="text-sm font-semibold">
                Email manzil
              </label>
              <Input
                id="clinic-login-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                aria-invalid={error ? true : undefined}
                placeholder="shifokor@demo.shifohalqa.uz"
                enterKeyHint="next"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="clinic-login-password" className="text-sm font-semibold">
                Parol
              </label>
              <div className="relative flex items-center">
                <Input
                  id="clinic-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  aria-invalid={error ? true : undefined}
                  placeholder="Parolni kiriting"
                  className="pr-11"
                  enterKeyHint="done"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-[var(--urgent)]/40 bg-[var(--urgent-bg)] px-3 py-2 text-sm font-semibold text-[var(--urgent)]">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" size="lg" className="flex-1" disabled={pending || !email.trim() || !password}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <LogIn data-icon="inline-start" aria-hidden="true" />}
                <span>{pending ? 'Tekshirilmoqda…' : 'Hisobga kirish'}</span>
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setExpanded(false)}>
                Yopish
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
