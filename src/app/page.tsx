import Link from 'next/link';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

export default function Home() {
  const demoEnabled = isDemoEnabled();
  return (
    <main className="frame entry" id="content" tabIndex={-1}>
      <div className="entry-intro">
        <h1>Uy mashqini kamera bilan o‘lchang</h1>
        <p className="lede">O‘tirib-turish sikllari, tizza burchagi va har bir sikl vaqti brauzerda hisoblanadi.</p>
        {demoEnabled && <Link className="text-action" href="/demo/mashq">Mashq demosini ochish</Link>}
      </div>
      {demoEnabled ? (
        <form className="role-picker" action="/api/demo/login" method="post">
          <button className="role-button" type="submit" name="role" value="doctor" aria-describedby="doctor-hint">
            Shifokor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="doctor-hint">Avval Dr. Sardor sifatida namuna rejani biriktiring.</p>
          <button className="role-button" type="submit" name="role" value="patient" aria-describedby="patient-hint">
            Bemor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="patient-hint">Anvar aka sifatida «Icha olmadim»dan «Dori tugadi» sababini yuboring. So‘ng shifokor rolida qaydni ochib javob yozing va bemor roliga qayting.</p>
        </form>
      ) : (
        <p className="notice">Demo kirishi hozir mavjud emas.</p>
      )}
      {demoEnabled && <Link className="text-action" href="/tg">Telegram Mini App ko‘rinishi</Link>}
    </main>
  );
}
