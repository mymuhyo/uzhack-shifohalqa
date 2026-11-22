import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActivityDashboard } from '@/lib/activity-store';
import type { ActivityDashboardData } from '@/lib/clinical-brief';
import { countOpenClinicalAttention } from '@/lib/clinical-triage';
import { getClinicalView } from '@/lib/clinical-store';
import type { ClinicalActor, ClinicalView } from '@/lib/clinical-types';
import { getDemoSession } from '@/lib/demo-session';
import { readExerciseAttempts, readExercisePlan } from '@/lib/exercise-store';
import { isAndroidDemoEnabled } from '@/lib/mobile-demo';
import { ensureDemoWorkspace } from '@/lib/seed';
import { CaregiverSharing } from './caregiver-sharing';
import { DoctorAndroidPairing } from './doctor-android-pairing';
import { DoctorBriefSection } from './doctor-brief-section';
import { DoctorClinical } from './doctor-clinical';
import { DoctorExercise } from './doctor-exercise';
import { DoctorAdherence, PatientAdherence } from './patient-adherence';
import { PatientClinical } from './patient-clinical';
import { PatientExerciseCard } from './patient-exercise-card';
import { DoctorTelegramPanel, PatientTelegramPanel } from './telegram-panel';

const names = { doctor: 'Dr. Sardor', patient: 'Anvar aka' };
const titles = { doctor: 'Shifokor sahifasi', patient: 'Bemor sahifasi' };
const feedback = {
  invalid: 'Ma’lumotlarni tekshiring va qayta yuboring. Bosim kiritilsa, ikkala qiymat ham kerak. Kuzatuv chegarasi maksimumdan oshmasin.',
  not_found: 'Bu qayd mavjud emas yoki endi qabul qilinmaydi. Sahifani yangilang.',
  already_saved: 'Bu amal avval saqlangan. Quyida joriy holat ko‘rsatilgan.',
  unavailable: 'So‘rov bajarilmadi. Bir ozdan so‘ng sahifani yangilang va qayta urinib ko‘ring.',
};

export async function DemoRolePage({ role, result }: { role: 'doctor' | 'patient'; result?: string | string[] }) {
  const session = await getDemoSession();
  if (session?.role !== role) redirect('/');

  let workspace: Awaited<ReturnType<typeof ensureDemoWorkspace>> = null;
  let view: ClinicalView | null = null;
  let actor: ClinicalActor | null = null;
  let exercisePlan: Awaited<ReturnType<typeof readExercisePlan>> = null;
  let exerciseAttempts: Awaited<ReturnType<typeof readExerciseAttempts>> = [];
  let activity: ActivityDashboardData = null;
  let storageUnavailable = false;
  try {
    workspace = await ensureDemoWorkspace(session.workspaceId);
    if (workspace) {
      actor = {
        workspaceId: session.workspaceId, role,
        doctorId: workspace.doctor.id, patientId: workspace.patient.id,
      };
      const [clinical, plan, attempts, doctorActivity] = await Promise.all([
        getClinicalView(actor),
        readExercisePlan(actor).catch(() => null),
        readExerciseAttempts(actor).catch(() => []),
        role === 'doctor' ? getActivityDashboard(actor).catch(() => null) : Promise.resolve(null),
      ]);
      view = clinical;
      exercisePlan = plan;
      exerciseAttempts = attempts;
      activity = doctorActivity;
    }
  } catch {
    storageUnavailable = true;
  }
  const message = typeof result === 'string' && Object.hasOwn(feedback, result)
    ? feedback[result as keyof typeof feedback]
    : null;
  const otherRole = role === 'doctor' ? 'patient' : 'doctor';
  const openFlagsCount = view
    ? countOpenClinicalAttention({ view, exerciseAttempts }).totalOpen
    : 0;

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>{titles[role]}</h1>
      <p className="lede">{workspace?.[role].name ?? names[role]} · Namuna foydalanuvchi</p>
      <div className="sticky-bar" role="region" aria-label="Tezkor boshqaruv">
        {role === 'patient' && <a className="emergency" href="tel:103">Tez yordam · 103</a>}
        <form action="/api/demo/login" method="post">
          <button className="switch-chip" type="submit" name="role" value={otherRole}>
            {role === 'doctor' ? 'Bemor sifatida ko‘rish ↗' : 'Shifokor sifatida ko‘rish ↗'}
          </button>
        </form>
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
          <span className={`status-pill ${openFlagsCount > 0 ? 'status-warn' : 'status-ok'}`}>
            Ochiq murojaatlar: {openFlagsCount}
          </span>
        )}
      </div>
      {message && <p className="notice" role={result === 'already_saved' ? 'status' : 'alert'}>{message}</p>}
      {view === null && (
        <p className="notice" role={storageUnavailable ? 'alert' : undefined}>
          {storageUnavailable ? 'Demo ma’lumotlarini ochib bo‘lmadi. Sahifani qayta yuklang.' : 'Demo ma’lumotlar bazasi ulanmagan.'}
        </p>
      )}
      {view && role === 'doctor' && actor && (
        view.plan !== null
        || exercisePlan !== null
        || (view.urgentSymptoms?.length ?? 0) > 0
        || exerciseAttempts.length > 0
      ) && (
        <DoctorBriefSection
          actor={actor}
          view={view}
          patientName={workspace?.patient.name ?? names.patient}
          activity={activity}
          exercisePlan={exercisePlan}
          exerciseAttempts={exerciseAttempts}
        />
      )}
      {view && role === 'doctor' && <DoctorClinical view={view} patientName={workspace?.patient.name ?? names.patient} />}
      {view && role === 'doctor' && isAndroidDemoEnabled() && <DoctorAndroidPairing />}
      {view && role === 'patient' && <PatientClinical view={view} />}
      {view && role === 'patient' && exercisePlan && (
        <PatientExerciseCard plan={exercisePlan} attempts={exerciseAttempts} />
      )}
      {view && actor && role === 'patient' && <PatientAdherence actor={actor} />}
      {actor && role === 'patient' && <CaregiverSharing actor={actor} />}
      {view && actor && role === 'doctor' && (
        <DoctorExercise actor={actor} initialPlan={exercisePlan} initialAttempts={exerciseAttempts} />
      )}
      {view?.plan && actor && role === 'doctor' && <DoctorAdherence actor={actor} initialDashboard={activity} />}
      {view && actor && role === 'doctor' && <DoctorTelegramPanel actor={actor} />}
      {view && role === 'patient' && <PatientTelegramPanel actor={actor ?? undefined} />}
      <div className="role-actions">
        {role === 'patient' && !exercisePlan && <Link className="text-action" href="/patient/exercise">O‘tirib-turish mashqi</Link>}
        <form action="/api/demo/logout" method="post">
          <button className="text-action" type="submit">Demodan chiqish</button>
        </form>
      </div>
    </main>
  );
}
