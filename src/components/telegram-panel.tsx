import { isPatientSideRole, type ClinicalActor } from '@/lib/clinical-types';
import { getTelegramBotUsername } from '@/lib/telegram-web';
import { getDoctorTelegramStatus, getPatientTelegramDetails } from '@/lib/telegram-store';
import { DoctorTelegramControls } from './telegram-controls';

export async function DoctorTelegramPanel({ actor }: { actor: ClinicalActor }) {
  if (actor.role !== 'doctor' || !getTelegramBotUsername()) return null;

  let connected: boolean;
  try {
    connected = await getDoctorTelegramStatus(actor);
  } catch {
    return <p className="notice" role="alert">Telegram ulanishini tekshirib bo‘lmadi. Sahifani yangilang.</p>;
  }

  return (
    <div className="ledger">
      <section aria-labelledby="doctor-telegram-title">
        <h2 id="doctor-telegram-title">Telegram bildirishnomalari</h2>
        <p>Ulasangiz, yangi qizil qayd, mashq og‘rig‘i va qadam maqsadi haqida shaxsiy Telegram chatingizga qisqa xabar keladi. Bemor tafsilotlari ShifoHalqada qoladi.</p>
        <DoctorTelegramControls connected={connected} isDemo={actor.isDemo === true} />
      </section>
    </div>
  );
}

export async function PatientTelegramPanel({ actor }: { actor?: ClinicalActor }) {
  const botUsername = getTelegramBotUsername();
  if (!botUsername) return null;

  let status = { connected: false, detailsEnabled: false };
  if (actor && isPatientSideRole(actor.role)) {
    status = await getPatientTelegramDetails(actor).catch(() => ({ connected: false, detailsEnabled: false }));
  }

  return (
    <div className="ledger">
      <section aria-labelledby="patient-telegram-title">
        <h2 id="patient-telegram-title">Telegram orqali kirish va holat</h2>
        <p>Telegramni ulasangiz, botda <code>/bugun</code> va <code>/holat</code> orqali bugungi dori, bosim, qadam va 7 kunlik hisobotni ko‘rasiz hamda shifokor javobi kelganda xabar olasiz.</p>
        {actor && isPatientSideRole(actor.role) && (
          <DoctorTelegramControls
            connected={status.connected}
            isDemo={actor.isDemo === true}
            isPatient
            initialDetailsEnabled={status.detailsEnabled}
          />
        )}
        <a className="text-action" href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          Telegram botini ochish
        </a>
      </section>
    </div>
  );
}
