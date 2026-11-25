import Link from 'next/link';
import { Camera, Smartphone } from 'lucide-react';
import { HomeClinicLogin } from '@/components/home-clinic-login';
import { Badge } from '@/components/ui/badge';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

const EVIDENCE_STAGES = [
  { tier: 'L0', title: 'Qo‘lda qayd', detail: 'Tezkor holat va og‘riq bildirishi' },
  { tier: 'L2', title: 'Tasdiqlangan media', detail: 'DoriMos quti surati yoki yuklangan video' },
  { tier: 'L3', title: 'Jonli kamera CV', detail: 'Brauzerda mahalliy burchak o‘lchovi' },
  { tier: 'L4', title: 'Shifokor tasdig‘i', detail: 'Qayd va 7 kunlik xulosa tasdig‘i' },
] as const;

export default function Home() {
  const demoEnabled = isDemoEnabled();
  return (
    <main className="frame entry" id="content" tabIndex={-1}>
      <section className="entry-split" aria-label="Asosiy kirish">
        <div className="pt-1">
          <Badge variant="secondary" className="mb-5">Sintetik ma’lumotlar bilan demo</Badge>

          <h1>Uy davolanishi va mashqni bir halqada kuzating</h1>
          <p className="lede">
            Dori qabuli, qon bosimi va 7 kunlik shifokor-tasdiqlagan hisobot hamda 3 ta reabilitatsiya mashqini kamera orqali kuzatish tizimi.
          </p>

          {demoEnabled && (
            <div className="entry-links">
              <Link className="entry-primary" href="/demo/mashq">
                <Camera className="size-4" aria-hidden="true" />
                <span>Mashq demosini ochish</span>
              </Link>
              <Link
                className="text-action border border-border bg-secondary px-4 py-2 rounded-[10.8px]"
                href="/tg"
              >
                <Smartphone className="size-4 text-primary" aria-hidden="true" />
                <span>Telegram Mini App ko‘rinishi</span>
              </Link>
            </div>
          )}
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

              <button
                className="role-button role-button-secondary"
                type="submit"
                name="role"
                value="patient"
                aria-describedby="patient-hint"
              >
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
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2" aria-label="Asosiy klinik oqimlar">
        <div className="rounded-[7.2px] border border-border bg-secondary p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium tracking-tight text-foreground">
              1-hikoya: Dori, qon bosimi va 7 kunlik hisobot
            </h2>
            <Badge variant="outline">L0–L4</Badge>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-secondary)]">
            1–3 ta dori jadvali (mg, mkg, g, IU), DoriMos quti tekshiruvi, yuqori va past qon bosimi chegaralari, ikki manbali qadam hisobi hamda shifokor tahrirlaydigan 7 kunlik AI xulosa.
          </p>
        </div>

        <div className="rounded-[7.2px] border border-border bg-[var(--panel-strong)]/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium tracking-tight text-foreground">
              2-hikoya: 3 ta mashq CV va video ko‘rik
            </h2>
            <Badge variant="outline">L2 / L3</Badge>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-secondary)]">
            O‘tirib-turish, tirsak bukish va oyoqni tekislash mashqlari qurilma ichida o‘lchanadi; muammoli takrorlar ajratiladi va rozilik bilan yuborilgan video shifokor pleyerida timestamp markerlari bilan ochiladi.
          </p>
        </div>

        <div className="md:col-span-2 rounded-[7.2px] border border-border bg-card px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE_STAGES.map((stage) => (
              <div key={stage.tier} className="flex items-start gap-2.5">
                <span className="inline-flex min-w-8 items-center justify-center rounded-[5.4px] border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium text-primary">
                  {stage.tier}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{stage.title}</p>
                  <p className="text-xs text-muted-foreground">{stage.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
