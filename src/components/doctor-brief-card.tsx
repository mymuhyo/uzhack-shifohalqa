'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { DoctorClinicalBriefView } from '@/lib/ai/clinical-brief-schema';
import type { ClinicalBrief } from '@/lib/clinical-brief';

const shortTimestamp = new Intl.DateTimeFormat('uz-Latn-UZ', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Tashkent',
});

const numberFormat = new Intl.NumberFormat('uz-Latn-UZ');

const toneLabel = {
  ok: 'Me’yor',
  warn: 'Kuzatuv',
  urgent: 'Yuqori',
} as const;

const recordKindLabel: Record<string, string> = {
  evidence_log: 'Dalil',
  flag: 'Bayroq',
  urgent_symptom: 'Simptom',
  exercise_attempt: 'Mashq',
};

export function DoctorBriefCard({
  brief,
  initialAiBrief = null,
  patientId = null,
}: {
  brief: ClinicalBrief;
  initialAiBrief?: DoctorClinicalBriefView | null;
  patientId?: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [aiBrief, setAiBrief] = useState<DoctorClinicalBriefView | null>(initialAiBrief);
  const [draftReply, setDraftReply] = useState<string>(
    initialAiBrief?.approvedReplyUz ?? initialAiBrief?.doctorDraftUz ?? '',
  );
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [aiError, setAiError] = useState('');

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief.plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function generateAiBrief(forceRefresh: boolean) {
    if (generating) return;
    setGenerating(true);
    setAiError('');
    try {
      const response = await fetch('/api/clinical/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          ...(patientId ? { patientId } : {}),
          forceRefresh,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        brief?: DoctorClinicalBriefView;
        error?: string;
      };
      if (!response.ok || !body.brief) {
        setAiError('AI xulosani yaratib bo‘lmadi. Qayta urinib ko‘ring.');
        return;
      }
      setAiBrief(body.brief);
      setDraftReply(body.brief.approvedReplyUz ?? body.brief.doctorDraftUz);
      toast.success(
        body.brief.sourceMode === 'ai'
          ? '7 kunlik AI xulosa va javob qoralamasi tayyor.'
          : 'Deterministik zaxira asosida 7 kunlik xulosa tayyor.',
      );
      router.refresh();
    } catch {
      setAiError('Tarmoq xatosi. Qayta urinib ko‘ring.');
    } finally {
      setGenerating(false);
    }
  }

  async function approveAiReply() {
    if (!aiBrief || approving || draftReply.trim().length < 5) return;
    setApproving(true);
    setAiError('');
    try {
      const response = await fetch('/api/clinical/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          ...(patientId ? { patientId } : {}),
          briefId: aiBrief.id,
          replyUz: draftReply.trim(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        brief?: DoctorClinicalBriefView;
        error?: string;
      };
      if (!response.ok || !body.brief) {
        setAiError('Tasdiqlash saqlanmadi. Matn kamida 5 ta belgi bo‘lsin.');
        return;
      }
      setAiBrief(body.brief);
      setDraftReply(body.brief.approvedReplyUz ?? draftReply);
      toast.success('7 kunlik shifokor javobi L4 darajasida tasdiqlandi.');
      router.refresh();
    } catch {
      setAiError('Tarmoq xatosi. Qayta urinib ko‘ring.');
    } finally {
      setApproving(false);
    }
  }

  function jumpToRecord(recordId: string, labelUz: string) {
    const target = document.getElementById(`record-${recordId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const details = target.querySelector('details');
      if (details && !details.open) details.open = true;
      toast.info(`Manba yozuvi: ${labelUz}`);
      return;
    }
    toast.info(`Manba ID: ${recordId.slice(0, 8)} · ${labelUz}`);
  }

  const maxBarRef = Math.max(brief.metrics.maxSystolic ?? 160, 180);

  return (
    <section aria-label="Shifokor uchun tezkor ko‘rsatkichlar va 7 kunlik xulosa">
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Shoshilinch ochiq</span>
          <strong className="kpi-value">{brief.metrics.openUrgent}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Tekshirish navbati</span>
          <strong className="kpi-value">{brief.metrics.openWarning}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Oxirgi qon bosimi</span>
          <strong className="kpi-value">{brief.metrics.latestBp ?? '—'}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">7 kunlik reja ijrosi</span>
          <strong className="kpi-value">
            {brief.metrics.adherencePercent === null ? '—' : `${brief.metrics.adherencePercent}%`}
          </strong>
        </div>
        {brief.metrics.stepsToday !== null && (
          <div className="kpi-card">
            <span className="kpi-label">Bugungi qadamlar</span>
            <strong className="kpi-value">{numberFormat.format(brief.metrics.stepsToday)}</strong>
          </div>
        )}
      </div>

      {brief.metrics.openExerciseFlags > 0 && (
        <p className="notice no-print" role="status">
          Reabilitatsiya mashqida ko‘rib chiqilmagan {brief.metrics.openExerciseFlags} ta bayroqli qayd bor.{' '}
          <a href="#exercise-heading">Mashq qaydlariga o‘tish ↓</a>
        </p>
      )}

      <article className="brief-card">
        <div className="brief-header">
          <div>
            <h2>7 kunlik klinik xulosa</h2>
            <p className="text-sm text-muted-foreground">{brief.headline}</p>
          </div>
          <div className="brief-actions no-print">
            <button type="button" className="switch-chip" onClick={() => void copyBrief()}>
              <Copy className="size-3.5" aria-hidden="true" />
              <span>{copied ? 'Nusxalandi ✓' : 'Xulosani nusxalash'}</span>
            </button>
            <button type="button" className="switch-chip" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden="true" />
              <span>Chop etish / PDF</span>
            </button>
          </div>
        </div>

        <ul className="brief-list">
          {brief.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {brief.bpTrend.length > 0 && (
          <div className="bp-trend" aria-label="7 kunlik qon bosimi dinamikasi">
            <h3>Qon bosimi dinamikasi ({brief.bpTrend.length} qayd)</h3>
            <ul className="bp-trend-list" role="list">
              {brief.bpTrend.map((point) => {
                const sysWidth = point.systolic !== null
                  ? Math.min(100, Math.max(18, Math.round((point.systolic / maxBarRef) * 100)))
                  : 100;
                const toneClass = point.tone === 'urgent'
                  ? 'status-urgent'
                  : point.tone === 'warn'
                    ? 'status-warn'
                    : 'status-ok';
                const fillClass = point.tone === 'urgent'
                  ? 'bp-bar-urgent'
                  : point.tone === 'warn'
                    ? 'bp-bar-warn'
                    : 'bp-bar-ok';
                return (
                  <li key={point.id} className="bp-trend-row">
                    <span className="bp-trend-time">
                      <time dateTime={point.createdAt}>{shortTimestamp.format(new Date(point.createdAt))}</time>
                      {point.isRetake && ' · Qayta'}
                    </span>
                    <div className="bp-bar-track" aria-hidden="true">
                      <div className={`bp-bar-fill ${fillClass}`} style={{ width: `${sysWidth}%` }} />
                    </div>
                    <strong className="bp-trend-reading">
                      {point.systolic !== null && point.diastolic !== null
                        ? `${point.systolic}/${point.diastolic}`
                        : 'Bosim kiritilmagan'}
                    </strong>
                    <span className={`status-pill ${toneClass}`}>
                      {point.chestPain ? 'Ko‘krak og‘rig‘i' : toneLabel[point.tone]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Separator className="my-4" />

        <div className="no-print flex flex-col gap-3" aria-label="Nazorat ostidagi AI 7 kunlik tahlil">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <span>Supervised AI 7 kunlik tahlil va javob qoralamasi</span>
              </span>
              {aiBrief && (
                <>
                  <Badge variant={aiBrief.level === 4 ? 'ok' : 'warn'}>
                    {aiBrief.level === 4 ? 'L4 Tasdiqlandi' : 'Qoralama · L0'}
                  </Badge>
                  <Badge variant="outline">
                    {aiBrief.sourceMode === 'ai'
                      ? `AI (${aiBrief.provider ?? 'gateway'})`
                      : 'Deterministik zaxira'}
                  </Badge>
                </>
              )}
            </div>
            <Button
              type="button"
              variant={aiBrief ? 'outline' : 'default'}
              size="sm"
              disabled={generating}
              onClick={() => void generateAiBrief(Boolean(aiBrief))}
            >
              {generating ? (
                <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : aiBrief ? (
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Sparkles data-icon="inline-start" aria-hidden="true" />
              )}
              <span>
                {generating
                  ? 'Tayyorlanmoqda…'
                  : aiBrief
                    ? 'Qoralama yangilash'
                    : 'AI 7-kunlik xulosa yaratish'}
              </span>
            </Button>
          </div>

          {aiError && (
            <p role="alert" className="rounded-lg border border-[var(--urgent)]/40 bg-[var(--urgent-bg)] px-3 py-2 text-sm font-semibold text-[var(--urgent)]">
              {aiError}
            </p>
          )}

          {aiBrief ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/70 p-3.5">
              <p className="text-sm text-foreground">{aiBrief.narrativeUz}</p>

              {aiBrief.highlights.length > 0 && (
                <ul className="grid gap-1 pl-4 text-sm text-muted-foreground list-disc">
                  {aiBrief.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}

              {aiBrief.citedRecords.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Tasdiqlangan DB manba yozuvlari ({aiBrief.citedRecords.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {aiBrief.citedRecords.map((ref) => (
                      <button
                        key={ref.id}
                        type="button"
                        onClick={() => jumpToRecord(ref.id, ref.labelUz)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        <Link2 className="size-3 text-primary" aria-hidden="true" />
                        <span>{recordKindLabel[ref.kind] ?? ref.kind}</span>
                        <span className="tabular-nums text-muted-foreground">{ref.date}</span>
                        <span className="max-w-44 truncate">{ref.labelUz}</span>
                        <code className="text-[11px] text-muted-foreground">{ref.id.slice(0, 6)}</code>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-1">
                <label htmlFor="ai-brief-draft-reply" className="text-sm font-semibold">
                  Bemorga yuboriladigan 7 kunlik shifokor javobi
                </label>
                <p className="text-xs text-muted-foreground">
                  AI qoralamasini tekshiring va kerak bo‘lsa tahrirlang. Bemor faqat siz L4 tasdiqlagan javobni ko‘radi.
                </p>
                <Textarea
                  id="ai-brief-draft-reply"
                  rows={3}
                  maxLength={1200}
                  value={draftReply}
                  onChange={(e) => setDraftReply(e.currentTarget.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  disabled={approving || draftReply.trim().length < 5}
                  onClick={() => void approveAiReply()}
                >
                  {approving ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                  )}
                  <span>
                    {aiBrief.level === 4 ? 'Javobni yangilab L4 tasdiqlash' : 'Tahrirlash va L4 tasdiqlash'}
                  </span>
                </Button>
                {aiBrief.approvedAt && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ok)]">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    <span>Tasdiqlangan: {shortTimestamp.format(new Date(aiBrief.approvedAt))}</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              7 kunlik deterministik ko‘rsatkichlar va DB yozuvlari asosida o‘zbek tilida javob qoralamasini tayyorlash uchun yuqoridagi tugmani bosing.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
