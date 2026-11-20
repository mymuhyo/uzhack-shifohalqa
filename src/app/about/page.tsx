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
          <p>Shifokor namuna rejani biriktiradi. Bemor «Icha olmadim»ni ochib, «Dori tugadi» sababini yuboradi. Shifokor shu qaydda «Ko‘rib chiqish»ni ochadi, «Bemorga javob» yozadi va qaydni tasdiqlaydi. Bemor o‘z vazifasida javobni va L4 belgisini ko‘radi.</p>
          <p>L4 shifokor aynan shu yozuvni ko‘rganini va tasdiqlaganini bildiradi. Dorining ichilgani yoki muammo hal bo‘lgani alohida tasdiq talab qiladi.</p>
          <p>Bemor mashq takrorini qurilmasida sanaydi, haftalik reja ijrosini ko‘radi va «Yaqinim» orqali bugungi qisqa holatni ulashadi.</p>
        </section>
        <section>
          <h2>Namuna ma’lumotlar</h2>
          <p>Dr. Sardor va Anvar aka sintetik qahramonlar. Bu demo bir brauzer sessiyasi uchun alohida ish joyi ochadi.</p>
          <p>CDC mashqi oldindan yozilgan namuna video. Tasdiqlangan video L2, yetarli sifatdagi jonli kamera o‘lchovi L3 sifatida saqlanadi.</p>
          <p>DoriMos tayyor sintetik quti rasmlarini o‘qiydi. O‘qilgan yozuvni bemor tasdiqlaydi. Xira rasm yoki xizmat uzilishida qo‘lda qayd yo‘li bor.</p>
        </section>
        <section>
          <h2>AI qayerda ishlaydi?</h2>
          <p>MediaPipe video kadrlarini brauzerda tahlil qiladi. Gemini sintetik quti yozuvini o‘qiydi. Moslikni dastur qoidasi tekshiradi va navbatdagi qayd bo‘yicha shifokor qaror qiladi.</p>
          <p>Kodlash va sinovlarda Codex, uning subagentlari va hujjat qidiruv vositalari ishlatildi.</p>
        </section>
      </div>
      <p className="notice">«Yaqinim» havolasi ochilgan bo‘lsa, eski ish joyidan chiqishdan oldin bemor sahifasida ulashishni o‘chiring. Aks holda havola 24 soatlik muddati tugaguncha ishlaydi.</p>
      <div className="role-actions">
        <Link className="text-action" href="/">Demo rollariga qaytish</Link>
        <form action="/api/demo/reset" method="post">
          <button className="text-action" type="submit">Yangi demo ish joyini boshlash</button>
        </form>
      </div>
    </main>
  );
}
