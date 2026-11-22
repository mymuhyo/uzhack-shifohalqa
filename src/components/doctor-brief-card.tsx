'use client';

import { useState } from 'react';
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

export function DoctorBriefCard({ brief }: { brief: ClinicalBrief }) {
  const [copied, setCopied] = useState(false);

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief.plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
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
            <p>{brief.headline}</p>
          </div>
          <div className="brief-actions no-print">
            <button type="button" className="switch-chip" onClick={() => void copyBrief()}>
              {copied ? 'Nusxalandi ✓' : 'Xulosani nusxalash'}
            </button>
            <button type="button" className="switch-chip" onClick={() => window.print()}>
              Chop etish / PDF
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
      </article>
    </section>
  );
}
