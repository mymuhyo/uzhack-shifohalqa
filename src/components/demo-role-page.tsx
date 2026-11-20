import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDemoSession } from '@/lib/demo-session';
import { ensureDemoWorkspace } from '@/lib/seed';
import { getClinicalView } from '@/lib/clinical-store';
import { isAndroidDemoEnabled } from '@/lib/mobile-demo';
import type { ClinicalActor, ClinicalView } from '@/lib/clinical-types';
import { CaregiverSharing } from './caregiver-sharing';
import { DoctorClinical } from './doctor-clinical';
import { DoctorAndroidPairing } from './doctor-android-pairing';
import { DoctorExercise } from './doctor-exercise';
import { DoctorAdherence, PatientAdherence } from './patient-adherence';
import { PatientClinical } from './patient-clinical';
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
  let storageUnavailable = false;
  try {
    workspace = await ensureDemoWorkspace(session.workspaceId);
    if (workspace) {
      actor = {
        workspaceId: session.workspaceId, role,
        doctorId: workspace.doctor.id, patientId: workspace.patient.id,
      };
      view = await getClinicalView(actor);
    }
  } catch {
    storageUnavailable = true;
  }
  const message = typeof result === 'string' && Object.hasOwn(feedback, result)
    ? feedback[result as keyof typeof feedback]
    : null;

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>{titles[role]}</h1>
      <p className="lede">{workspace?.[role].name ?? names[role]} · Namuna foydalanuvchi</p>
      {role === 'patient' && <a className="emergency" href="tel:103">Tez yordam · 103</a>}
      {message && <p className="notice" role={result === 'already_saved' ? 'status' : 'alert'}>{message}</p>}
      {view === null && (
        <p className="notice" role={storageUnavailable ? 'alert' : undefined}>
          {storageUnavailable ? 'Demo ma’lumotlarini ochib bo‘lmadi. Sahifani qayta yuklang.' : 'Demo ma’lumotlar bazasi ulanmagan.'}
        </p>
      )}
      {view && role === 'doctor' && <DoctorClinical view={view} patientName={workspace?.patient.name ?? names.patient} />}
      {view && role === 'doctor' && isAndroidDemoEnabled() && <DoctorAndroidPairing />}
      {view && role === 'patient' && <PatientClinical view={view} />}
      {view && actor && role === 'patient' && <PatientAdherence actor={actor} />}
      {actor && role === 'patient' && <CaregiverSharing actor={actor} />}
      {view && actor && role === 'doctor' && <DoctorExercise actor={actor} />}
      {view?.plan && actor && role === 'doctor' && <DoctorAdherence actor={actor} />}
      {view && actor && role === 'doctor' && <DoctorTelegramPanel actor={actor} />}
      {view && role === 'patient' && <PatientTelegramPanel />}
      <div className="role-actions">
        {role === 'patient' && <Link className="text-action" href="/patient/exercise">O‘tirib-turish mashqi</Link>}
        <Link className="text-action" href="/">Rolni almashtirish</Link>
        <form action="/api/demo/logout" method="post">
          <button className="text-action" type="submit">Demodan chiqish</button>
        </form>
      </div>
    </main>
  );
}
