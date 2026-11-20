import type { ClinicalActor } from '@/lib/clinical-types';
import { getTelegramBotUsername } from '@/lib/telegram-web';
import { getDoctorTelegramStatus } from '@/lib/telegram-store';
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
        <p>Ulasangiz, yangi qizil qayd haqida shaxsiy Telegram chatingizga qisqa xabar keladi. Bemor tafsilotlari ShifoHalqada qoladi.</p>
        <DoctorTelegramControls connected={connected} />
      </section>
    </div>
  );
}

export function PatientTelegramPanel() {
  const botUsername = getTelegramBotUsername();
  if (!botUsername) return null;

  return (
    <div className="ledger">
      <section aria-labelledby="patient-telegram-title">
        <h2 id="patient-telegram-title">Telegram orqali kirish</h2>
        <p>Botda /bugun buyrug‘i orqali ShifoHalqa havolasini oching.</p>
        <a className="text-action" href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          Telegram botini ochish
        </a>
      </section>
    </div>
  );
}
