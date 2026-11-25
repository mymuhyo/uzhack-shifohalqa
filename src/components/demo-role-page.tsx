import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertOctagon, ArrowRightLeft, PhoneCall } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getActivityDashboard } from '@/lib/activity-store';
import { readLatestClinicalBrief } from '@/lib/ai/clinical-brief-ai';
import type { ActivityDashboardData } from '@/lib/clinical-brief';
import { countOpenClinicalAttention } from '@/lib/clinical-triage';
import { getClinicalView } from '@/lib/clinical-store';
import type { ClinicalView } from '@/lib/clinical-types';
import { readExerciseAttempts, readExercisePlan } from '@/lib/exercise-store';
import { isAndroidDemoEnabled } from '@/lib/mobile-demo';
import { resolveRolePageContext } from '@/lib/role-page-context';
import { getTeachBackStatus, type TeachBackStatus } from '@/lib/teach-back-store';
import { AuthLogoutButton } from './auth-logout-button';
import { CaregiverSharing } from './caregiver-sharing';
import { DoctorAndroidPairing } from './doctor-android-pairing';
import { DoctorBriefSection } from './doctor-brief-section';
import { DoctorClinical } from './doctor-clinical';
import { DoctorExercise } from './doctor-exercise';
import { DoctorPatientSwitcher } from './doctor-patient-switcher';
import { DoctorAdherence, PatientAdherence } from './patient-adherence';
import { PatientClinical } from './patient-clinical';
import { PatientExerciseCard } from './patient-exercise-card';
import { DoctorTelegramPanel, PatientTelegramPanel } from './telegram-panel';

const titles = { doctor: 'Shifokor sahifasi', patient: 'Bemor sahifasi' };
const feedback = {
  invalid: 'Ma’lumotlarni tekshiring va qayta yuboring. Bosim kiritilsa, ikkala qiymat ham kerak. Kuzatuv chegarasi maksimumdan oshmasin.',
  not_found: 'Bu qayd mavjud emas yoki endi qabul qilinmaydi. Sahifani yangilang.',
  already_saved: 'Bu amal avval saqlangan. Quyida joriy holat ko‘rsatilgan.',
  unavailable: 'So‘rov bajarilmadi. Bir ozdan so‘ng sahifani yangilang va qayta urinib ko‘ring.',
};

export async function DemoRolePage({
  role,
  result,
  patientId,
}: {
  role: 'doctor' | 'patient';
  result?: string | string[];
  patientId?: string | string[];
}) {
  const ctx = await resolveRolePageContext(role, patientId);
  if (!ctx) redirect('/');

  const { actor, isDemo, actorName, patientName, assignedPatients, selectedPatientId } = ctx;
  let view: ClinicalView | null = null;
  let exercisePlan: Awaited<ReturnType<typeof readExercisePlan>> = null;
  let exerciseAttempts: Awaited<ReturnType<typeof readExerciseAttempts>> = [];
  let activity: ActivityDashboardData = null;
  let latestBrief: Awaited<ReturnType<typeof readLatestClinicalBrief>> = null;
  let teachBackStatus: TeachBackStatus | null = null;
  let storageUnavailable = ctx.storageUnavailable;

  if (!storageUnavailable && actor.patientId) {
    try {
      const [clinical, plan, attempts, doctorActivity, brief, teachBack] = await Promise.all([
        getClinicalView(actor),
        readExercisePlan(actor).catch(() => null),
        readExerciseAttempts(actor).catch(() => []),
        role === 'doctor' ? getActivityDashboard(actor).catch(() => null) : Promise.resolve(null),
        readLatestClinicalBrief(actor).catch(() => null),
        role === 'patient' ? getTeachBackStatus(actor).catch(() => null) : Promise.resolve(null),
      ]);
      view = clinical;
      exercisePlan = plan;
      exerciseAttempts = attempts;
      activity = doctorActivity;
      latestBrief = brief;
      teachBackStatus = teachBack;
    } catch {
      storageUnavailable = true;
    }
  }

  const message = typeof result === 'string' && Object.hasOwn(feedback, result)
    ? feedback[result as keyof typeof feedback]
    : null;
  const otherRole = role === 'doctor' ? 'patient' : 'doctor';
  const openFlagsCount = view
    ? countOpenClinicalAttention({ view, exerciseAttempts }).totalOpen
    : 0;
  const doctorAiBrief = latestBrief && 'doctorDraftUz' in latestBrief ? latestBrief : null;
  const patientAiBrief = latestBrief && !('doctorDraftUz' in latestBrief) ? latestBrief : null;
  const showDoctorBrief = Boolean(
    view && role === 'doctor' && (
      view.plan !== null
      || exercisePlan !== null
      || (view.urgentSymptoms?.length ?? 0) > 0
      || exerciseAttempts.length > 0
    ),
  );

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1>{titles[role]}</h1>
        <Badge variant={isDemo ? 'secondary' : 'ok'}>
          {isDemo ? 'Sintetik Judge Demo' : 'Klinika sessiyasi'}
        </Badge>
      </div>
      <p className="lede">
        {actorName} · {isDemo ? 'Namuna foydalanuvchi' : role === 'doctor' ? `Tanlangan bemor: ${patientName}` : 'Klinika bemori'}
      </p>

      <div className="sticky-bar" role="region" aria-label="Tezkor boshqaruv">
        {role === 'patient' && (
          <>
            <a className="emergency" href="tel:103">
              <PhoneCall className="size-4" aria-hidden="true" />
              <span>Tez yordam · 103</span>
            </a>
            <a className="emergency" href="#urgent-report-section">
              <AlertOctagon className="size-4" aria-hidden="true" />
              <span>Og‘riq bor</span>
            </a>
          </>
        )}
        {isDemo && (
          <form action="/api/demo/login" method="post">
            <button className="switch-chip" type="submit" name="role" value={otherRole}>
              <ArrowRightLeft className="size-3.5 text-primary" aria-hidden="true" />
              <span>{role === 'doctor' ? 'Bemor sifatida ko‘rish ↗' : 'Shifokor sifatida ko‘rish ↗'}</span>
            </button>
          </form>
        )}
        {role === 'patient' ? (
          <>
            <Link className="text-action" href="/patient/exercise">Mashq</Link>
            <a className="text-action" href="#daily-steps-title">Qadamlar</a>
            <a className="text-action" href="#caregiver-title">Yaqinim</a>
          </>
        ) : (
          <>
            <a className="text-action" href="#queue-heading">Navbat</a>
            <a className="text-action" href="#exercise-heading">Mashq</a>
          </>
        )}
        <Link className="text-action" href="/">Rolni almashtirish</Link>
        {role === 'doctor' && view && (
          <span className={`status-pill ms-auto ${openFlagsCount > 0 ? 'status-warn' : 'status-ok'}`}>
            Ochiq murojaatlar: {openFlagsCount}
          </span>
        )}
      </div>

      {role === 'doctor' && !isDemo && (
        <DoctorPatientSwitcher patients={assignedPatients} selectedPatientId={selectedPatientId} />
      )}

      {message && <p className="notice" role={result === 'already_saved' ? 'status' : 'alert'}>{message}</p>}

      {view === null && (isDemo || actor.patientId !== null) && (
        <p className="notice" role={storageUnavailable ? 'alert' : undefined}>
          {storageUnavailable ? 'Ma’lumotlarni ochib bo‘lmadi. Sahifani qayta yuklang.' : 'Ma’lumotlar bazasi ulanmagan.'}
        </p>
      )}

      {view && role === 'doctor' && showDoctorBrief && (
        <DoctorBriefSection
          actor={actor}
          view={view}
          patientName={patientName}
          activity={activity}
          exercisePlan={exercisePlan}
          exerciseAttempts={exerciseAttempts}
          initialAiBrief={doctorAiBrief}
        />
      )}

      {view && role === 'doctor' && (
        <>
          <DoctorClinical
            view={view}
            patientName={patientName}
            isDemo={isDemo}
            patientId={selectedPatientId}
          />
          <div className="workspace-doctor">
            <div className="workspace-column">
              <DoctorExercise actor={actor} initialPlan={exercisePlan} initialAttempts={exerciseAttempts} />
            </div>
            <div className="workspace-column">
              {view.plan && <DoctorAdherence actor={actor} initialDashboard={activity} />}
              {isDemo && isAndroidDemoEnabled() && <DoctorAndroidPairing />}
              <DoctorTelegramPanel actor={actor} />
            </div>
          </div>
        </>
      )}

      {view && role === 'patient' && (
        <div className="workspace-patient">
          <div className="workspace-column">
            <PatientClinical
              view={view}
              isDemo={isDemo}
              patientBrief={patientAiBrief}
              teachBackStatus={teachBackStatus}
            />
          </div>
          <div className="workspace-column">
            {exercisePlan && <PatientExerciseCard plan={exercisePlan} attempts={exerciseAttempts} />}
            <PatientAdherence actor={actor} />
            {actor.patientId && <CaregiverSharing actor={actor} />}
            <PatientTelegramPanel actor={actor} />
          </div>
        </div>
      )}

      <div className="role-actions">
        {role === 'patient' && !exercisePlan && <Link className="text-action" href="/patient/exercise">O‘tirib-turish mashqi</Link>}
        {isDemo ? (
          <form action="/api/demo/logout" method="post">
            <button className="text-action" type="submit">Demodan chiqish</button>
          </form>
        ) : (
          <AuthLogoutButton />
        )}
      </div>
    </main>
  );
}
