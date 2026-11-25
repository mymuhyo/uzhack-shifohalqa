import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  FileCheck2,
  HeartPulse,
  Layers,
  Pill,
  Smartphone,
  Sparkles,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import { HomeClinicLogin } from '@/components/home-clinic-login';
import { Badge } from '@/components/ui/badge';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

const EVIDENCE_STAGES = [
  { tier: 'L0', title: 'Qo‘lda qayd', detail: 'Tezkor holat va og‘riq' },
  { tier: 'L2', title: 'Tasdiqlangan media', detail: 'DoriMos OCR / video klip' },
  { tier: 'L3', title: 'Jonli CV kamera', detail: 'Qurilma ichida burchak tahlili' },
  { tier: 'L4', title: 'Shifokor tasdig‘i', detail: '7 kunlik AI + klinik javob' },
] as const;

export default function Home() {
  const demoEnabled = isDemoEnabled();
  return (
    <div className="hero-backdrop">
      <main className="frame entry" id="content" tabIndex={-1}>
        <section className="entry-split" aria-label="Asosiy kirish">
          <div className="pt-2">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="ok">Sintetik ma’lumotlar bilan demo</Badge>
              <Badge variant="outline">Web · Android · Telegram</Badge>
              <Badge variant="secondary">Toshkent vaqti · L0–L4</Badge>
            </div>

            <h1>Uy davolanishi va mashqni bir halqada kuzating</h1>
            <p className="lede">
              AI o‘lchaydi, deterministik qoidalar xavfni ajratadi, yakuniy qarorni faqat shifokor qabul qiladi — dori, qon bosimi, qadamlar va 3 ta reabilitatsiya mashqi bitta ishonchli halqada.
            </p>

            {demoEnabled && (
              <div className="entry-links">
                <Link className="entry-primary" href="/demo/mashq">
                  <Camera className="size-4" aria-hidden="true" />
                  <span>Mashq demosini ochish</span>
                </Link>
                <Link className="text-action border border-border bg-card px-3.5 py-2 rounded-xl" href="/tg">
                  <Smartphone className="size-4 text-primary" aria-hidden="true" />
                  <span>Telegram Mini App ko‘rinishi</span>
                </Link>
              </div>
            )}

            <div className="mt-7 grid grid-cols-3 gap-2.5 sm:max-w-lg">
              <div className="rounded-xl border border-border bg-card/85 px-3 py-2.5 shadow-[var(--surface-shadow)]">
                <span className="block font-mono text-[11px] font-medium text-muted-foreground">DORI & BP</span>
                <strong className="mt-0.5 block font-mono text-base font-semibold text-foreground">1–3 dori</strong>
              </div>
              <div className="rounded-xl border border-border bg-card/85 px-3 py-2.5 shadow-[var(--surface-shadow)]">
                <span className="block font-mono text-[11px] font-medium text-muted-foreground">MEDIAPIPE CV</span>
                <strong className="mt-0.5 block font-mono text-base font-semibold text-foreground">3 mashq</strong>
              </div>
              <div className="rounded-xl border border-border bg-card/85 px-3 py-2.5 shadow-[var(--surface-shadow)]">
                <span className="block font-mono text-[11px] font-medium text-muted-foreground">NAZORAT</span>
                <strong className="mt-0.5 block font-mono text-base font-semibold text-[var(--ok)]">7 kun · L4</strong>
              </div>
            </div>
          </div>

          <div>
            {demoEnabled ? (
              <form className="role-picker" action="/api/demo/login" method="post">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Layers className="size-4" aria-hidden="true" />
                    </span>
                    <h2>To‘liq demoni boshlang</h2>
                  </div>
                  <Badge variant="ok">1-klik Judge Demo</Badge>
                </div>
                <p className="role-intro">Avval shifokor reja tuzadi, keyin bemor uni bajaradi.</p>

                <button className="role-button" type="submit" name="role" value="doctor" aria-describedby="doctor-hint">
                  <span className="inline-flex items-center gap-2.5">
                    <Stethoscope className="size-4 shrink-0" aria-hidden="true" />
                    <span>Shifokor sifatida kirish</span>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
                <p className="role-hint" id="doctor-hint">
                  Avval Dr. Sardor sifatida dori, bosim, kunlik qadam maqsadi va 3 ta asosiy mashqdan birini biriktiring; Android va Telegram ulanishini oching.
                </p>

                <button className="role-button" type="submit" name="role" value="patient" aria-describedby="patient-hint">
                  <span className="inline-flex items-center gap-2.5">
                    <UserCheck className="size-4 shrink-0" aria-hidden="true" />
                    <span>Bemor sifatida kirish</span>
                  </span>
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

        <section className="mt-10 grid gap-4 lg:grid-cols-12" aria-label="Asosiy klinik oqimlar">
          <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-5 shadow-[var(--surface-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[var(--action-soft)] text-primary">
                  <Pill className="size-4" aria-hidden="true" />
                </span>
                <span>1-hikoya · Dori, qon bosimi va 7 kunlik AI hisobot</span>
              </span>
              <Badge variant="secondary">L0 → L4</Badge>
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">
              1–3 ta dori jadvali, DoriMos quti tekshiruvi (mg/mcg/g/iu), yuqori va past BP chegaralari, ikki manbali qadamlar hamda DB yozuvlariga tayangan shifokor tasdig‘i.
            </p>

            <div className="mt-4 grid gap-2.5 rounded-xl border border-border bg-secondary/75 p-3.5 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">08:00 · DORI</span>
                  <CheckCircle2 className="size-3.5 text-[var(--ok)]" aria-hidden="true" />
                </div>
                <p className="mt-1 text-xs font-semibold text-foreground">Amlodipin · 5 mg</p>
                <span className="mt-1 inline-block font-mono text-[11px] text-[var(--ok)]">Ichildi · DoriMos</span>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">BOSIM</span>
                  <HeartPulse className="size-3.5 text-[var(--urgent)]" aria-hidden="true" />
                </div>
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">158/98 mmHg</p>
                <span className="mt-0.5 inline-block font-mono text-[11px] text-[var(--urgent)]">Qizil navbat · &gt;140</span>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">AI BRIEF</span>
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-1 text-xs font-semibold text-foreground">7 kunlik xulosa</p>
                <span className="mt-1 inline-block font-mono text-[11px] text-[var(--ok)]">L4 tasdiqlangan</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0d1017] p-5 text-[#f8fafc] shadow-[var(--surface-shadow-lg)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                  <Activity className="size-4" aria-hidden="true" />
                </span>
                <span>2-hikoya · 3 ta mashq CV + video ko‘rik</span>
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-blue-300">
                L2 / L3
              </span>
            </div>
            <p className="mt-2.5 text-sm text-slate-300">
              MediaPipe Pose brauzerda ishlaydi, muammoli takror kadrlari AI kuzatuvi va rozilik bilan yuborilgan to‘liq video shifokor pleyerida ochiladi.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-300">
                <span>chair_stand · elbow_bend · seated_knee_ext</span>
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                  89.8°
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-3/4 rounded-full bg-blue-500" />
                </div>
                <span className="font-mono text-[11px] text-amber-300">00:12–00:16</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                <FileCheck2 className="size-3.5 text-blue-400" aria-hidden="true" />
                <span>Bosiladigan timestamp markerlari va 1 ta shifokor javobi</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-12 rounded-2xl border border-border bg-secondary/60 px-4 py-3.5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {EVIDENCE_STAGES.map((stage) => (
                <div key={stage.tier} className="flex items-start gap-2.5">
                  <span className="inline-flex min-w-8 items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                    {stage.tier}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{stage.title}</p>
                    <p className="text-xs text-muted-foreground">{stage.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
