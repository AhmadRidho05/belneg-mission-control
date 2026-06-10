// Bilingual translation strings for BELNEG Mission Control
// Usage: getTranslation(key, lang)

type Language = "id" | "en";

export const translations: Record<string, Record<Language, string>> = {
  // Landing Page - Navigation
  "nav.tentang": { id: "Tentang KKRI", en: "About KKRI" },
  "nav.cerita": { id: "Cerita KKRI", en: "KKRI Story" },
  "nav.faq": { id: "FAQ", en: "FAQ" },
  "nav.kontak": { id: "Kontak", en: "Contact" },
  "nav.login": { id: "Masuk", en: "Login" },
  "nav.register": { id: "Daftar", en: "Register" },

  // Landing Page - Hero
  "hero.subtitle": {
    id: "Dashboard monitoring Korps Kadet Republik Indonesia (KKRI) — pemantauan laporan kegiatan, sebaran satuan pendidikan, dan struktur teritorial TNI AD dalam satu pusat komando digital.",
    en: "Monitoring dashboard for Indonesian Cadet Corps (KKRI) — track activity reports, school distribution, and TNI AD territorial structure in one digital command center.",
  },
  "hero.cta.login": { id: "Masuk Dashboard", en: "Login Dashboard" },
  "hero.cta.learn": { id: "Pelajari KKRI", en: "Learn About KKRI" },

  // Landing Page - Features
  "feature.visualization.title": { id: "Visualisasi Data", en: "Data Visualization" },
  "feature.visualization.desc": { id: "Statistik & sebaran satuan pendidikan secara real-time.", en: "Statistics & school distribution in real-time." },
  "feature.mapping.title": { id: "Pemetaan Wilayah", en: "Regional Mapping" },
  "feature.mapping.desc": { id: "Peta interaktif lokasi sekolah & komando teritorial.", en: "Interactive map of school locations & territorial commands." },
  "feature.reports.title": { id: "Laporan KKRI", en: "KKRI Reports" },
  "feature.reports.desc": { id: "Pantau laporan kegiatan dari Pembina di lapangan.", en: "Monitor activity reports from field instructors." },

  // Landing Page - Story Cards
  "story.card1": { id: "Ekstrakurikuler SMA/SMK/MA", en: "Extracurricular for SMA/SMK/MA" },
  "story.card2": { id: "Blended learning", en: "Blended learning" },
  "story.card3": { id: "Siklus 36 minggu", en: "36-week cycle" },
  "story.card4": { id: "Karakter & kepemimpinan", en: "Character & leadership" },
  "story.card5": { id: "Sukarela dan non-militeristik", en: "Voluntary and non-militaristic" },

  // Landing Page - Footer
  "footer": { id: "Sekretariat Nasional Korps Kadet Republik Indonesia 2026", en: "National Secretariat of the Republic of Indonesia Cadet Corps 2026" },

  // Landing Page - Modal Titles
  "modal.about": { id: "Tentang KKRI", en: "About KKRI" },
  "modal.story": { id: "Cerita KKRI", en: "KKRI Story" },
  "modal.faq": { id: "FAQ", en: "FAQ" },
  "modal.contact": { id: "Kontak", en: "Contact" },

  // Landing Page - About Content
  "about.p1": {
    id: "Korps Kadet Republik Indonesia atau KKRI adalah program pembinaan karakter Pancasila dan kesadaran bela negara bagi murid jenjang pendidikan menengah. Program ini diselenggarakan melalui kegiatan ekstrakurikuler dengan pendekatan edukatif, kolaboratif, reflektif, inklusif, dan non-militeristik.",
    en: "Indonesian Cadet Corps or KKRI is a character development program for Pancasila values and national defense awareness among secondary education students. The program is conducted through extracurricular activities with an educational, collaborative, reflective, inclusive, and non-militaristic approach.",
  },
  "about.p2": {
    id: "KKRI dirancang untuk membantu murid SMA/SMK/MA sederajat mengembangkan kedisiplinan, kepemimpinan, nasionalisme, kemampuan berpikir kritis, kolaborasi, komunikasi, dan kepedulian sosial melalui pembelajaran bauran yang memadukan aktivitas daring dan tatap muka.",
    en: "KKRI is designed to help SMA/SMK/MA students develop discipline, leadership, nationalism, critical thinking, collaboration, communication, and social responsibility through blended learning that combines online and face-to-face activities.",
  },

  // Landing Page - Story Content
  "story.p1": {
    id: "KKRI hadir sebagai ruang pembinaan generasi muda agar semakin siap menghadapi tantangan kebangsaan di era digital. Program ini tidak diposisikan sebagai pelatihan militer, melainkan sebagai pendidikan karakter kebangsaan yang relevan dengan kehidupan remaja Indonesia.",
    en: "KKRI provides a space for developing young people to be better prepared for national challenges in the digital era. The program is positioned not as military training, but as national character education relevant to Indonesian youth's lives.",
  },
  "story.p2": {
    id: "Dalam satu siklus pelaksanaan, KKRI berlangsung selama 36 minggu efektif dan terbagi dalam dua batch semesteran. Kegiatan dilakukan melalui modul daring, video pembelajaran, kuis, jurnal refleksi, tugas kolaboratif, praktik tatap muka, mentoring kelompok, dan proyek pengabdian masyarakat. Program ini bersifat sukarela, inklusif, dan menekankan pembentukan disiplin diri, kepemimpinan, civic engagement, serta kesadaran bela negara modern.",
    en: "In one implementation cycle, KKRI runs for 36 effective weeks divided into two semester batches. Activities are conducted through online modules, learning videos, quizzes, reflection journals, collaborative tasks, face-to-face practice, group mentoring, and community service projects. The program is voluntary, inclusive, and emphasizes development of self-discipline, leadership, civic engagement, and modern national defense awareness.",
  },

  // Landing Page - Contact
  "contact.intro": {
    id: "Untuk informasi lebih lanjut mengenai pelaksanaan, koordinasi, dan dukungan teknis program KKRI, silakan menghubungi Sekretariat KKRI.",
    en: "For more information about program implementation, coordination, and technical support, please contact the KKRI Secretariat.",
  },
  "contact.secretariat": { id: "Sekretariat KKRI", en: "KKRI Secretariat" },
  "contact.note": {
    id: "Informasi kontak ini dapat disesuaikan kembali mengikuti kanal resmi Sekretariat KKRI.",
    en: "Contact information may be updated in accordance with official KKRI Secretariat channels.",
  },

  // FAQ Items
  "faq.q1": { id: "Apa itu KKRI?", en: "What is KKRI?" },
  "faq.a1": {
    id: "KKRI adalah program ekstrakurikuler pembinaan karakter Pancasila dan kesadaran bela negara bagi murid jenjang pendidikan menengah.",
    en: "KKRI is an extracurricular program for building Pancasila character and national defense awareness among secondary education students.",
  },
  "faq.q2": { id: "Siapa yang bisa mengikuti KKRI?", en: "Who can participate in KKRI?" },
  "faq.a2": {
    id: "Murid SMA/SMK/MA sederajat yang secara sukarela mendaftar pada ekstrakurikuler KKRI di satuan pendidikan.",
    en: "Students from SMA/SMK/MA or equivalent schools who voluntarily register for KKRI extracurricular activities at their educational unit.",
  },
  "faq.q3": { id: "Apakah KKRI bersifat wajib?", en: "Is KKRI mandatory?" },
  "faq.a3": {
    id: "Tidak. KKRI bersifat sukarela sebagai kegiatan ekstrakurikuler dan tidak menjadi syarat kenaikan kelas atau kelulusan.",
    en: "No. KKRI is voluntary as an extracurricular activity and is not a requirement for grade promotion or graduation.",
  },
  "faq.q4": { id: "Apakah KKRI bersifat militeristik?", en: "Is KKRI militaristic?" },
  "faq.a4": {
    id: "Tidak. KKRI mengedepankan pendekatan edukatif, reflektif, kolaboratif, inklusif, dan non-militeristik.",
    en: "No. KKRI emphasizes an educational, reflective, collaborative, inclusive, and non-militaristic approach.",
  },
  "faq.q5": { id: "Bagaimana model pembelajarannya?", en: "What is the learning model?" },
  "faq.a5": {
    id: "KKRI menggunakan blended learning yang memadukan modul daring, kuis, refleksi, tugas kolaboratif, mentoring, dan sesi tatap muka berkala.",
    en: "KKRI uses blended learning that combines online modules, quizzes, reflection, collaborative tasks, mentoring, and periodic face-to-face sessions.",
  },
  "faq.q6": { id: "Apa fungsi BELNEG Mission Control?", en: "What is the function of BELNEG Mission Control?" },
  "faq.a6": {
    id: "BELNEG Mission Control berfungsi sebagai dashboard digital untuk memantau data pelaksanaan KKRI, laporan kegiatan, sebaran sekolah, pembina, siswa, dan progres program.",
    en: "BELNEG Mission Control serves as a digital dashboard to monitor KKRI implementation data, activity reports, school distribution, instructors, students, and program progress.",
  },

  // Auth Pages
  "auth.login.title": { id: "Login", en: "Login" },
  "auth.login.subtitle.request": {
    id: "Masuk ke BELNEG Mission Control menggunakan Email/No WhatsApp dan NRP Anda.",
    en: "Login to BELNEG Mission Control using your Email/Phone and NRP.",
  },
  "auth.login.subtitle.verify": {
    id: "Masukkan kode OTP yang sudah dikirim.",
    en: "Enter the OTP code that was sent to you.",
  },
  "auth.login.registered.pending": {
    id: "Pendaftaran berhasil. Akun Anda berstatus pending dan baru bisa login setelah disetujui admin.",
    en: "Registration successful. Your account is pending and can only login after admin approval.",
  },
  "auth.label.email": { id: "Email / No WhatsApp", en: "Email / Phone" },
  "auth.placeholder.email": { id: "nama@kkri.id atau 0812xxxxxxxx", en: "name@kkri.id or 0812xxxxxxxx" },
  "auth.label.nrp": { id: "NRP", en: "NRP" },
  "auth.placeholder.nrp": { id: "Nomor Registrasi Pokok", en: "Registration Number" },
  "auth.label.otp": { id: "Kode OTP", en: "OTP Code" },
  "auth.placeholder.otp": { id: "6 digit kode OTP", en: "6-digit OTP code" },
  "auth.button.send.otp": { id: "Kirim OTP", en: "Send OTP" },
  "auth.button.sending": { id: "Mengirim…", en: "Sending…" },
  "auth.button.verify": { id: "Verifikasi & Masuk", en: "Verify & Login" },
  "auth.button.verifying": { id: "Memverifikasi…", en: "Verifying…" },
  "auth.button.resend": { id: "Kirim Ulang OTP", en: "Resend OTP" },
  "auth.button.change.email": { id: "← Ubah Email / NRP", en: "← Change Email / NRP" },
  "auth.link.register": { id: "Daftar", en: "Register" },
  "auth.link.no.account": { id: "Belum punya akun?", en: "Don't have an account?" },
  "auth.link.back.home": { id: "← Kembali ke beranda", en: "← Back to Home" },
  "auth.otp.demo.note": {
    id: "Kode OTP demo sudah dibuat. Cek terminal server untuk mendapatkan kode.",
    en: "Demo OTP has been created. Check server terminal for the code.",
  },

  // Auth Error Messages
  "error.fill.fields": { id: "Lengkapi Email/No WhatsApp dan NRP terlebih dahulu.", en: "Please fill in Email/Phone and NRP first." },
  "error.account.pending": { id: "Akun Anda masih menunggu approval admin.", en: "Your account is pending admin approval." },
  "error.account.rejected": { id: "Akun Anda ditolak atau dinonaktifkan.", en: "Your account has been rejected or deactivated." },
  "error.account.inactive": { id: "Akun Anda tidak aktif. Hubungi admin.", en: "Your account is inactive. Contact admin." },
  "error.send.otp.failed": { id: "Gagal mengirim OTP.", en: "Failed to send OTP." },
  "error.connection": { id: "Terjadi kesalahan koneksi. Coba lagi.", en: "Connection error. Please try again." },
  "error.enter.otp": { id: "Masukkan kode OTP terlebih dahulu.", en: "Please enter the OTP code first." },
  "error.verification.failed": { id: "Verifikasi gagal.", en: "Verification failed." },
};

export function getTranslation(key: string, language: Language): string {
  const keys = key.split(".");
  const allTranslations = translations[key];

  if (!allTranslations) {
    console.warn(`Translation key not found: ${key}`);
    return key; // Return key as fallback
  }

  return allTranslations[language] || allTranslations.id; // Fallback to ID if EN not available
}

export function t(key: string, lang: "id" | "en" = "id"): string {
  return getTranslation(key, lang);
}
