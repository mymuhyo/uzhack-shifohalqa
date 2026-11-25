export const doctorReplyTemplatesMap: Record<string, readonly string[]> = {
  medication_out_of_supply: [
    'Xabaringizni oldim. Bugun yangi dori olib iching, olganingizdan so‘ng ilovada tasdiqlang.',
    'Poliklinika qabulxonasiga murojaat qiling — sizga yangi retsept yozib beramiz.',
    'Oila a’zongizga ham xabar bering, dori yetib kelgach qabulni davom ettiring.',
  ],
  medication_box_mismatch: [
    'Quti kuchi rejadagidan farq qiladi — bu qutini ichmay turing, shifokor bilan aniqlashtiring.',
    'Rejangizdagi dozani tekshirib, to‘g‘ri kuchdagi qutini oling va qayta tasdiqlang.',
    'Poliklinikaga quti rasmini yoki o‘zini olib keling, dozani birga tekshiramiz.',
  ],
  bp_max: [
    'Bosim yuqori: 30 daqiqa tinch dam olib, bosimni qayta o‘lchab yuboring.',
    'Bugungi dori qabulini o‘tkazib yubormang; bosh og‘rig‘i yoki ko‘krak og‘rig‘i bo‘lsa 103 ga qo‘ng‘iroq qiling.',
    'Qabulga keling — bosim ko‘tarilishi bo‘yicha rejani ko‘rib chiqamiz.',
  ],
  bp_low: [
    'Bosim past: yoting yoki o‘tirib suv iching, 20 daqiqadan so‘ng qayta o‘lchab yuboring.',
    'Kuchli bosh aylanishi yoki hushdan ketish hissi bo‘lsa darhol 103 ga qo‘ng‘iroq qiling.',
  ],
  bp_warning: [
    'Bosim kuzatuv chegarasida. Tuz va kofeinni kamaytirib, ertaga ertalab qayta o‘lchang.',
    '20 daqiqa dam olib bosimni qayta tekshiring va ilovaga kiriting.',
  ],
  chest_pain: [
    'Ko‘krak og‘rig‘i jiddiy belgi. Hozir tinch o‘tiring va og‘riq davom etsa darhol 103 ga qo‘ng‘iroq qiling.',
    'Bugun poliklinikaga shoshilinch ko‘rikka keling yoki tez yordam chaqiring.',
  ],
  medication_missed_consecutive_days: [
    'Ikki kun dori qoldirilgan. Qabul vaqtini eslatmaga qo‘ying, nojo‘ya ta’sir bo‘lsa sababini yozing.',
    'Bugundan reja bo‘yicha davom eting; qiyinchilik bo‘lsa shifokor ko‘rigiga yoziling.',
  ],
  urgent_symptom: [
    'Xabaringizni oldim. Tinch holatda dam oling, ahvol og‘irlashsa darhol 103 ga qo‘ng‘iroq qiling.',
    'Bugungi qabulga zudlik bilan keling, sizni ko‘rikka kiritamiz.',
  ],
};

export function doctorReplyTemplates(ruleKey: string): readonly string[] {
  return doctorReplyTemplatesMap[ruleKey] ?? doctorReplyTemplatesMap.urgent_symptom;
}
