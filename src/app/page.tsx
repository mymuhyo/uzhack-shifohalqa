import Link from 'next/link';
import { Activity, Camera, FileCheck2, HeartPulse, Pill, Smartphone, Sparkles } from 'lucide-react';
import { HomeClinicLogin } from '@/components/home-clinic-login';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

export default function Home() {
  const demoEnabled = isDemoEnabled();
  return (
    <main className="frame entry" id="content" tabIndex={-1}>
      <div className="entry-intro">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="ok">Sintetik ma’lumotlar bilan demo</Badge>
          <Badge variant="outline">Web · Android · Telegram</Badge>
        </div>
        <h1>Uy davolanishi va mashqni bir halqada kuzating</h1>
        <p className="lede">
          Dori qabuli, qon bosimi va 7 kunlik shifokor-tasdiqlagan AI hisoboti hamda 3 ta reabilitatsiya mashqini kamera orqali o‘lchash tizimi.
        </p>
        {demoEnabled && (
          <div className="entry-links">
            <Link className="entry-primary" href="/demo/mashq">
              <Camera className="size-4" aria-hidden="true" />
              <span>Mashq demosini ochish</span>
            </Link>
            <Link className="text-action" href="/tg">
              <Smartphone className="size-4" aria-hidden="true" />
              <span>Telegram Mini App ko‘rinishi</span>
            </Link>
          </div>
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-2" aria-label="Asosiy klinik oqimlar">
          <Card className="border border-border bg-card shadow-[var(--surface-shadow)]">
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ok)]">
                  <Pill className="size-4" aria-hidden="true" />
                  <span>1-hikoya · Dori va 7 kunlik hisobot</span>
                </span>
                <Badge variant="secondary">L0–L4</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                1–3 dori jadvali, DoriMos quti tekshiruvi, yuqori/past qon bosimi, qadamlar va shifokor tasdiqlagan 7 kunlik AI xulosa.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5">
                  <HeartPulse className="size-3" aria-hidden="true" /> BP chegaralari
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5">
                  <Sparkles className="size-3" aria-hidden="true" /> AI xulosa + L4
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-[var(--surface-shadow)]">
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ok)]">
                  <Activity className="size-4" aria-hidden="true" />
                  <span>2-hikoya · 3 ta mashq CV + video</span>
                </span>
                <Badge variant="secondary">L2 / L3</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                O‘tirib-turish, tirsak bukish va oyoq tekislash mashqlari MediaPipe CV tahlili, kadr AI kuzatuvi va rozilik bilan video ko‘rik.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5">
                  <FileCheck2 className="size-3" aria-hidden="true" /> Muammoli sikl markerlari
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        {demoEnabled ? (
          <form className="role-picker" action="/api/demo/login" method="post">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2>To‘liq demoni boshlang</h2>
              <Badge variant="ok">1-klik Judge Demo</Badge>
            </div>
            <p className="role-intro">Avval shifokor reja tuzadi, keyin bemor uni bajaradi.</p>
            <button className="role-button" type="submit" name="role" value="doctor" aria-describedby="doctor-hint">
              <span>Shifokor sifatida kirish</span>
              <span aria-hidden="true">↗</span>
            </button>
            <p className="role-hint" id="doctor-hint">
              Avval Dr. Sardor sifatida dori, bosim, kunlik qadam maqsadi va 3 ta asosiy mashqdan birini biriktiring; Android va Telegram ulanishini oching.
            </p>
            <button className="role-button" type="submit" name="role" value="patient" aria-describedby="patient-hint">
              <span>Bemor sifatida kirish</span>
              <span aria-hidden="true">↗</span>
            </button>
            <p className="role-hint" id="patient-hint">
              Anvar aka sifatida dori (yoki DoriMos kamera tekshiruvi), bosim, qadam va mashqni bajaring. So‘ng shifokor rolida javob yozing.
            </p>
          </form>
        ) : (
          <p className="notice">Demo kirishi hozir mavjud emas.</p>
        )}

        <HomeClinicLogin />
      </div>
    </main>
  );
}
