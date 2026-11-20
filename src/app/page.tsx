import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="frame entry" id="content" tabIndex={-1}>
      <div className="entry-intro">
        <h1>Uy davolanishini kuzatish</h1>
        <p className="lede">Demo rolini tanlang. Har ikki rolda namuna ma’lumotlar ishlatiladi.</p>
      </div>
      {isDemoEnabled() ? (
        <form className="role-picker" action="/api/demo/login" method="post">
          <button className="role-button" type="submit" name="role" value="doctor" aria-describedby="doctor-hint">
            Shifokor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="doctor-hint">Dr. Sardor</p>
          <button className="role-button" type="submit" name="role" value="patient" aria-describedby="patient-hint">
            Bemor sifatida kirish <span aria-hidden="true">↗</span>
          </button>
          <p className="role-hint" id="patient-hint">Anvar aka</p>
        </form>
      ) : (
        <p className="notice">Demo kirishi hozir mavjud emas.</p>
      )}
    </main>
  );
}
