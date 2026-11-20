import { getCaregiverSharing } from '@/lib/caregiver-store';
import type { ClinicalActor } from '@/lib/clinical-types';
import { CaregiverSharingControls } from './caregiver-sharing-controls';

export async function CaregiverSharing({ actor }: { actor: ClinicalActor }) {
  let expiresAt: string | null;
  try {
    expiresAt = await getCaregiverSharing(actor);
  } catch {
    return <p className="notice" role="alert">«Yaqinim» holatini yuklab bo‘lmadi. Sahifani yangilang.</p>;
  }

  return (
    <div className="ledger">
      <section aria-labelledby="caregiver-title">
        <h2 id="caregiver-title">Yaqinim</h2>
        <p>Havolani olgan inson bugun nechta vazifa muddati kelganini, nechtasiga javob berilganini va nechtasi bajarilganini ko‘radi.</p>
        <CaregiverSharingControls initialExpiresAt={expiresAt} />
      </section>
    </div>
  );
}
