import Link from 'next/link';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

export default function Home() {
  const demoEnabled = isDemoEnabled();
  return (
    <main className="frame entry" id="content" tabIndex={-1}>
      <div className="entry-intro">
        <p className="entry-label">Sintetik ma’lumotlar bilan demo</p>
        <h1>Uy mashqini kamera bilan o‘lchang</h1>
        <p className="lede">Mashqni namuna video yoki kamera orqali sinang. Tizza burchagi va takrorlar shu qurilmada hisoblanadi.</p>
        {demoEnabled && <div className="entry-links">
          <Link className="entry-primary" href="/demo/mashq">Mashq demosini ochish</Link>
          <Link className="text-action" href="/tg">Telegram Mini App ko‘rinishi</Link>
        </div>}
      </div>
      {demoEnabled ? (
        <form className="role-picker" action="/api/demo/login" method="post">
          <h2>To‘liq demoni boshlang</h2>
          <p className="role-intro">Avval shifokor reja tuzadi, keyin bemor uni bajaradi.</p>
          <button className="role-button" type="submit" name="role" value="doctor" aria-describedby="doctor-hint">
            Shifokor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="doctor-hint">Avval Dr. Sardor sifatida dori, bosim, kunlik qadam maqsadi va 5 ta mashqdan birini biriktiring; Android va Telegram ulanishini oching.</p>
          <button className="role-button" type="submit" name="role" value="patient" aria-describedby="patient-hint">
            Bemor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="patient-hint">Anvar aka sifatida dori (yoki DoriMos kamera tekshiruvi), bosim, qadam va mashqni bajaring. So‘ng shifokor rolida javob yozing.</p>
        </form>
      ) : (
        <p className="notice">Demo kirishi hozir mavjud emas.</p>
      )}
    </main>
  );
}
