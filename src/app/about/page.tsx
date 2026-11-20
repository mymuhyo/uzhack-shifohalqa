import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Demo haqida' };

export default function About() {
  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Demo haqida</h1>
      <div className="ledger">
        <section>
          <h2>Hozir sinab ko‘ring</h2>
          <p>Shifokor reja biriktiradi, bemor dori yoki qon bosimini qayd etadi. Shifokor navbatdagi qaydni ko‘rib chiqadi va bemorga javob yuboradi.</p>
          <p>Bemor mashq takrorini qurilmasida sanaydi, haftalik reja ijrosini ko‘radi va «Yaqinim» orqali bugungi qisqa holatni ulashadi.</p>
        </section>
        <section>
          <h2>Namuna ma’lumotlar</h2>
          <p>Dr. Sardor va Anvar aka sintetik qahramonlar. Bu demo bir brauzer sessiyasi uchun alohida ish joyi ochadi.</p>
          <p>DoriMos tayyor sintetik quti rasmlarini o‘qiydi. O‘qilgan yozuvni bemor tasdiqlaydi. Xira rasm yoki xizmat uzilishida qo‘lda qayd yo‘li bor.</p>
        </section>
        <section>
          <h2>AI qayerda ishlaydi?</h2>
          <p>MediaPipe video kadrlarini brauzerda tahlil qiladi. Gemini sintetik quti yozuvini o‘qiydi. Moslikni dastur qoidasi tekshiradi va navbatdagi qayd bo‘yicha shifokor qaror qiladi.</p>
          <p>Kodlash va sinovlarda Codex, uning subagentlari va hujjat qidiruv vositalari ishlatildi.</p>
        </section>
      </div>
      <div className="role-actions">
        <Link className="text-action" href="/">Demo rollariga qaytish</Link>
        <form action="/api/demo/reset" method="post">
          <button className="text-action" type="submit">Yangi demo ish joyini boshlash</button>
        </form>
      </div>
    </main>
  );
}
