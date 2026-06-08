// Idempotent seed of the curated course catalog (~200 courses across 10
// skill clusters). DELETEs course_catalog + course_skill_tags first, then
// bulk inserts. Run after migrate-siswa.mjs. Re-run anytime to refresh.
//
// Usage: node apps/belneg/scripts/seed-courses.mjs
//
// NOTE: This is a best-effort hand-curated v0 list. Titles + providers are
// real; URLs are best-effort (most are real provider+course slugs; some
// landing pages on the provider site). Ratings + durations are approximate.
// Swap with a validated curated list before public pilot.

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const newId = (prefix) => `${prefix}_${randomBytes(8).toString("base64url")}`;

// ─────────────────────────────────────────────────────────────────────────
// COURSES (200 — distribution per S4 spec)
//   Programming 30 · Data Science 25 · Design 20 · Business 25 ·
//   Communication 20 · Math/Science 15 · Languages 15 · Trades 15 ·
//   Healthcare 15 · Indonesian-specific 15
// ─────────────────────────────────────────────────────────────────────────
const COURSES = [
  // ─── Programming (30) ───
  ["coursera","programming-for-everybody","Programming for Everybody (Python)","University of Michigan","Pengantar pemrograman Python dari nol, fokus pada konsep fundamental.","https://www.coursera.org/learn/python",16,"en",0,4.8,"beginner"],
  ["coursera","python-data","Python Data Structures","University of Michigan","Lanjutan Python: list, dict, tuple, dan operasi file.","https://www.coursera.org/learn/python-data",19,"en",0,4.8,"beginner"],
  ["coursera","python-network-data","Using Python to Access Web Data","University of Michigan","Scraping web, parsing JSON/XML, dan konsumsi REST API dengan Python.","https://www.coursera.org/learn/python-network-data",20,"en",0,4.8,"intermediate"],
  ["edx","cs50x","CS50's Introduction to Computer Science","Harvard University","Pengantar ilmu komputer dari C → Python → SQL → JavaScript. Wajib bagi calon programmer.","https://www.edx.org/cs50",100,"en",0,4.9,"beginner"],
  ["freecodecamp","js-algorithms","JavaScript Algorithms and Data Structures","freeCodeCamp","300 jam latihan algoritma + struktur data dengan JavaScript modern.","https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures",300,"en",0,4.7,"intermediate"],
  ["freecodecamp","responsive-web","Responsive Web Design","freeCodeCamp","HTML, CSS, Flexbox, Grid — sampai siap bikin landing page profesional.","https://www.freecodecamp.org/learn/responsive-web-design",300,"en",0,4.7,"beginner"],
  ["dicoding","web-pemula","Belajar Dasar Pemrograman Web","Dicoding Indonesia","HTML, CSS, JavaScript dasar dalam Bahasa Indonesia.","https://www.dicoding.com/academies/123",35,"id",0,4.7,"beginner"],
  ["dicoding","js-pemula","Belajar Dasar Pemrograman JavaScript","Dicoding Indonesia","Sintaks JavaScript modern: variabel, fungsi, async/await.","https://www.dicoding.com/academies/256",30,"id",0,4.6,"beginner"],
  ["dicoding","python-pemula","Memulai Pemrograman Dengan Python","Dicoding Indonesia","Python dari nol dengan latihan harian.","https://www.dicoding.com/academies/86",30,"id",0,4.7,"beginner"],
  ["dicoding","java-pemula","Memulai Pemrograman Dengan Kotlin","Dicoding Indonesia","Pengantar Kotlin untuk Android & backend.","https://www.dicoding.com/academies/80",30,"id",0,4.6,"beginner"],
  ["dicoding","android-pemula","Belajar Membuat Aplikasi Android untuk Pemula","Dicoding Indonesia","Aplikasi Android pertama dengan Kotlin + Jetpack.","https://www.dicoding.com/academies/51",45,"id",0,4.7,"beginner"],
  ["dicoding","git-dasar","Belajar Dasar Git dengan GitHub","Dicoding Indonesia","Workflow Git, branching, pull request, kolaborasi tim.","https://www.dicoding.com/academies/116",8,"id",0,4.8,"beginner"],
  ["udemy","web-bootcamp","The Web Developer Bootcamp 2025","Udemy (Colt Steele)","Full-stack web bootcamp — HTML/CSS/JS, Node, Express, MongoDB.","https://www.udemy.com/course/the-web-developer-bootcamp/",70,"en",250000,4.7,"beginner"],
  ["udemy","python-bootcamp","The Complete Python Bootcamp From Zero to Hero","Udemy (Jose Portilla)","Python end-to-end: OOP, decorators, web scraping, data analysis.","https://www.udemy.com/course/complete-python-bootcamp/",22,"en",250000,4.6,"beginner"],
  ["udemy","python-automate","Automate the Boring Stuff with Python","Udemy (Al Sweigart)","Otomatisasi tugas harian (Excel, PDF, email) dengan Python.","https://www.udemy.com/course/automate/",9,"en",250000,4.7,"beginner"],
  ["udemy","react-complete","React - The Complete Guide 2025","Udemy (Maximilian Schwarzmüller)","React modern dengan hooks, Redux, Next.js.","https://www.udemy.com/course/react-the-complete-guide-incl-redux/",50,"en",250000,4.7,"intermediate"],
  ["udemy","node-react","Node with React: Fullstack Web Development","Udemy (Stephen Grider)","Stack Node + Express + MongoDB + React end-to-end.","https://www.udemy.com/course/node-with-react-fullstack-web-development/",25,"en",250000,4.6,"intermediate"],
  ["edx","cs50w","Web Programming with Python and JavaScript (CS50W)","Harvard University","Lanjutan CS50: Django, React, JavaScript dengan project-based learning.","https://www.edx.org/learn/web-development/harvard-university-cs50-s-web-programming-with-python-and-javascript",50,"en",0,4.7,"intermediate"],
  ["mit-ocw","6.0001","Introduction to Computer Science in Python (6.0001)","MIT OpenCourseWare","Kelas dasar CS MIT dengan Python — gratis dan terbuka.","https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",12,"en",0,4.8,"beginner"],
  ["coursera","google-it-automation","Google IT Automation with Python","Google","Sertifikat profesional Google: Python + Linux + Git untuk automation.","https://www.coursera.org/professional-certificates/google-it-automation",100,"en",0,4.7,"beginner"],
  ["coursera","meta-frontend","Meta Front-End Developer Professional Certificate","Meta","Sertifikat Meta: HTML, CSS, React, version control.","https://www.coursera.org/professional-certificates/meta-front-end-developer",100,"en",0,4.7,"beginner"],
  ["coursera","duke-java-oop","Object Oriented Programming in Java","Duke University","Konsep OOP, inheritance, polymorphism dengan Java.","https://www.coursera.org/learn/object-oriented-java",50,"en",0,4.7,"intermediate"],
  ["coursera","algs4-part1","Algorithms, Part I","Princeton University","Algoritma dan struktur data klasik (sorting, graph) dengan Java.","https://www.coursera.org/learn/algorithms-part1",60,"en",0,4.9,"intermediate"],
  ["coursera","algs4-part2","Algorithms, Part II","Princeton University","Lanjutan: graph algorithms, string algorithms, kompleksitas.","https://www.coursera.org/learn/algorithms-part2",60,"en",0,4.9,"advanced"],
  ["dicoding","frontend-pemula","Belajar Membuat Front-End Web untuk Pemula","Dicoding Indonesia","Bangun aplikasi web modular dengan Webpack, Babel, modern JS.","https://www.dicoding.com/academies/315",35,"id",0,4.6,"beginner"],
  ["dicoding","backend-pemula","Belajar Membuat Aplikasi Back-End untuk Pemula","Dicoding Indonesia","REST API dengan Node.js + Hapi, deployment ke cloud.","https://www.dicoding.com/academies/261",45,"id",0,4.6,"intermediate"],
  ["youtube","mosh-csharp","C# Tutorial for Beginners","YouTube (Programming with Mosh)","C# fundamentals dengan Mosh, langsung praktik.","https://www.youtube.com/watch?v=GhQdlIFylQ8",4,"en",0,4.7,"beginner"],
  ["youtube","netninja-vue3","Vue 3 Tutorial for Beginners","YouTube (The Net Ninja)","Vue 3 + Composition API, lengkap dengan project.","https://www.youtube.com/playlist?list=PL4cUxeGkcC9hYYGbV60Vq3IXYNfDk8At1",10,"en",0,4.8,"intermediate"],
  ["youtube","fcc-python","Python Full Course for Beginners","YouTube (freeCodeCamp)","Python 12 jam dalam satu video — full curriculum.","https://www.youtube.com/watch?v=rfscVS0vtbw",12,"en",0,4.8,"beginner"],
  ["dicoding","react-pemula","Belajar Membuat Aplikasi Web dengan React","Dicoding Indonesia","React + Redux + testing + deployment dalam Bahasa Indonesia.","https://www.dicoding.com/academies/294",40,"id",800000,4.6,"intermediate"],

  // ─── Data Science (25) ───
  ["coursera","stats-intro","Introduction to Statistics","Stanford University","Statistika deskriptif, inferensial, regresi — landasan data science.","https://www.coursera.org/learn/stanford-statistics",32,"en",0,4.6,"beginner"],
  ["coursera","ml-andrew","Machine Learning Specialization","DeepLearning.AI (Andrew Ng)","Spesialisasi 3-kursus: supervised, unsupervised, recommenders.","https://www.coursera.org/specializations/machine-learning-introduction",90,"en",0,4.9,"intermediate"],
  ["coursera","dl-specialization","Deep Learning Specialization","DeepLearning.AI (Andrew Ng)","5-kursus: NN, CNN, RNN, structuring ML projects.","https://www.coursera.org/specializations/deep-learning",120,"en",0,4.9,"advanced"],
  ["coursera","ibm-data-science","IBM Data Science Professional Certificate","IBM","Sertifikat IBM: Python, SQL, ML, visualization, capstone.","https://www.coursera.org/professional-certificates/ibm-data-science",120,"en",0,4.6,"beginner"],
  ["coursera","google-data-analytics","Google Data Analytics Professional Certificate","Google","Sertifikat Google: spreadsheet, SQL, R, Tableau end-to-end.","https://www.coursera.org/professional-certificates/google-data-analytics",180,"en",0,4.8,"beginner"],
  ["coursera","sql-data-science","SQL for Data Science","UC Davis","Query SQL untuk analisis data, dari SELECT sampai window functions.","https://www.coursera.org/learn/sql-for-data-science",14,"en",0,4.6,"beginner"],
  ["coursera","python-for-data","Python for Data Science, AI & Development","IBM","Pandas, NumPy, dasar ML dengan Python.","https://www.coursera.org/learn/python-for-applied-data-science-ai",25,"en",0,4.6,"beginner"],
  ["dicoding","data-analytics-sql","Belajar Data Analytics dengan SQL","Dicoding Indonesia","SQL analytics dengan studi kasus real Indonesia.","https://www.dicoding.com/academies/467",35,"id",0,4.7,"intermediate"],
  ["dicoding","visualisasi-data","Belajar Dasar Visualisasi Data","Dicoding Indonesia","Prinsip visualization + tools (Tableau, Python matplotlib).","https://www.dicoding.com/academies/444",30,"id",0,4.6,"beginner"],
  ["dicoding","ml-pemula","Belajar Machine Learning untuk Pemula","Dicoding Indonesia","ML dasar dengan scikit-learn + TensorFlow.","https://www.dicoding.com/academies/184",30,"id",0,4.7,"intermediate"],
  ["dicoding","ml-advanced","Belajar Pengembangan Machine Learning","Dicoding Indonesia","ML production: pipeline, MLOps, deployment.","https://www.dicoding.com/academies/185",45,"id",800000,4.6,"advanced"],
  ["fastai","practical-dl","Practical Deep Learning for Coders","fast.ai","DL top-down, langsung practical, tanpa banyak teori awal.","https://course.fast.ai/",70,"en",0,4.9,"advanced"],
  ["kaggle","intro-ml","Intro to Machine Learning","Kaggle Learn","ML cepat 3 jam dengan dataset Titanic-style.","https://www.kaggle.com/learn/intro-to-machine-learning",3,"en",0,4.7,"beginner"],
  ["kaggle","pandas","Pandas","Kaggle Learn","Manipulasi data dengan pandas dalam 4 jam.","https://www.kaggle.com/learn/pandas",4,"en",0,4.7,"beginner"],
  ["coursera","duke-stats-r","Statistics with R Specialization","Duke University","Spesialisasi stats lengkap dengan R.","https://www.coursera.org/specializations/statistics",70,"en",0,4.6,"intermediate"],
  ["mit-ocw","18.06","Linear Algebra (18.06)","MIT OpenCourseWare (Gilbert Strang)","Kelas legendaris Aljabar Linear MIT — fondasi ML.","https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",35,"en",0,4.9,"intermediate"],
  ["coursera","math-ml","Mathematics for Machine Learning Specialization","Imperial College London","Aljabar Linear + Kalkulus + PCA untuk ML.","https://www.coursera.org/specializations/mathematics-machine-learning",50,"en",0,4.6,"intermediate"],
  ["youtube","statquest","StatQuest with Josh Starmer","YouTube (Josh Starmer)","Statistika & ML dijelaskan dengan jelas + lagu jingle.","https://www.youtube.com/@statquest",30,"en",0,4.9,"beginner"],
  ["huggingface","nlp-course","Hugging Face NLP Course","Hugging Face","NLP modern dengan Transformers, gratis end-to-end.","https://huggingface.co/learn/nlp-course",30,"en",0,4.8,"intermediate"],
  ["coursera","tensorflow-pro","TensorFlow Developer Certificate Specialization","DeepLearning.AI","Persiapan sertifikat TF Developer.","https://www.coursera.org/professional-certificates/tensorflow-in-practice",60,"en",0,4.7,"intermediate"],
  ["coursera","data-engineering","Data Engineering with Python","Duke University","ETL pipelines, Airflow, dbt dengan Python.","https://www.coursera.org/learn/data-engineering-python",25,"en",0,4.5,"intermediate"],
  ["coursera","excel-business","Excel Skills for Business Specialization","Macquarie University","Excel essential → advanced untuk profesional.","https://www.coursera.org/specializations/excel",50,"en",0,4.9,"beginner"],
  ["dicoding","tensorflow","Belajar Pengembangan Machine Learning dengan TensorFlow","Dicoding Indonesia","TensorFlow + Keras untuk image, NLP, time-series.","https://www.dicoding.com/academies/185",30,"id",0,4.6,"intermediate"],
  ["khan","stats-prob","Statistics and Probability","Khan Academy","Statistika dasar gratis dengan latihan interaktif.","https://www.khanacademy.org/math/statistics-probability",40,"en",0,4.8,"beginner"],
  ["youtube","3blue1brown-la","Essence of Linear Algebra","YouTube (3Blue1Brown)","Visualisasi aljabar linear yang membuat semua klik.","https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab",5,"en",0,5.0,"beginner"],

  // ─── Design (20) ───
  ["coursera","google-ux","Google UX Design Professional Certificate","Google","Sertifikat 7-kursus UX dari riset sampai prototyping.","https://www.coursera.org/professional-certificates/google-ux-design",200,"en",0,4.8,"beginner"],
  ["coursera","calarts-graphic","Graphic Design Specialization","California Institute of the Arts","Spesialisasi 4-kursus: typography, image-making, branding.","https://www.coursera.org/specializations/graphic-design",90,"en",0,4.8,"beginner"],
  ["dicoding","ux-pemula","Belajar Dasar UX Design","Dicoding Indonesia","User research, wireframing, usability testing.","https://www.dicoding.com/academies/198",30,"id",0,4.7,"beginner"],
  ["dicoding","desain-grafis","Belajar Dasar Desain Grafis","Dicoding Indonesia","Prinsip desain + tools (Figma, Adobe).","https://www.dicoding.com/academies/421",25,"id",0,4.6,"beginner"],
  ["skillacademy","figma-ui","Figma untuk UI/UX Design","Skill Academy (Ruangguru)","Figma dari basic component sampai prototyping.","https://www.skillacademy.com/all-classes",8,"id",150000,4.7,"beginner"],
  ["skillshare","photoshop-beginner","Adobe Photoshop CC for Beginners","Skillshare","Workflow Photoshop untuk pemula.","https://www.skillshare.com/en/classes/Adobe-Photoshop",12,"en",300000,4.6,"beginner"],
  ["domestika","illustrator-guide","The Ultimate Guide to Adobe Illustrator","Domestika (Aaron Draplin)","Master Illustrator dari basics sampai logo design.","https://www.domestika.org/en/courses/adobe-illustrator",8,"en",250000,4.8,"beginner"],
  ["udemy","ux-fundamentals","User Experience (UX) Fundamentals","Udemy","Prinsip UX dari Steve Krug + Nielsen Norman.","https://www.udemy.com/course/ux-fundamentals/",4,"en",150000,4.7,"beginner"],
  ["dicoding","unity-game-pemula","Belajar Membuat Game dengan Unity","Dicoding Indonesia","2D game dengan Unity + C#.","https://www.dicoding.com/academies/178",40,"id",600000,4.5,"intermediate"],
  ["coursera","web-accessibility","Web Accessibility","Google","Membuat web accessible untuk semua user (WCAG).","https://www.coursera.org/learn/web-accessibility",12,"en",0,4.6,"beginner"],
  ["domestika","logo-design","Logo Design Masterclass","Domestika (Sagi Haviv)","Logo design dari mentor branding global.","https://www.domestika.org/en/courses/logo-design",4,"en",250000,4.8,"intermediate"],
  ["coursera","typography","Introduction to Typography","California Institute of the Arts","Typography 101: anatomi huruf sampai layout.","https://www.coursera.org/learn/typography",18,"en",0,4.8,"beginner"],
  ["skillacademy","motion-ae","Motion Design dengan After Effects","Skill Academy (Ruangguru)","Animasi 2D dengan AE untuk konten digital.","https://www.skillacademy.com/all-classes",15,"id",250000,4.6,"intermediate"],
  ["udemy","sketch-figma","UI/UX Design with Figma","Udemy (Daniel Walter Scott)","Bangun design system dengan Figma + Sketch.","https://www.udemy.com/course/figma-ux-design/",15,"en",250000,4.6,"intermediate"],
  ["coursera","ui-patterns","UI Design Patterns for Successful Software","UC San Diego","Pola design UI yang battle-tested.","https://www.coursera.org/learn/ui-design",16,"en",0,4.5,"intermediate"],
  ["dicoding","flutter-pemula","Belajar Membuat Aplikasi Flutter untuk Pemula","Dicoding Indonesia","Flutter dari widget dasar sampai state management.","https://www.dicoding.com/academies/159",50,"id",0,4.6,"beginner"],
  ["udemy","blender-char","Blender 3D Character Creator","Udemy (GameDev.tv)","Modeling, rigging, animating karakter 3D.","https://www.udemy.com/course/complete-blender-creator/",20,"en",350000,4.7,"intermediate"],
  ["skillshare","brand-identity","Brand Identity Design with Illustrator","Skillshare","Bangun brand identity lengkap dari riset sampai eksekusi.","https://www.skillshare.com/en/classes/Brand-Identity",10,"en",300000,4.6,"intermediate"],
  ["dicoding","aws-cloud","Belajar Dasar AWS Cloud","Dicoding Indonesia","AWS fundamentals untuk developer.","https://www.dicoding.com/academies/263",25,"id",0,4.6,"beginner"],
  ["webflow","webflow-101","Webflow 101 Crash Course","Webflow University","Bangun web modern tanpa coding dengan Webflow.","https://university.webflow.com/courses/webflow-101-crash-course",12,"en",0,4.8,"beginner"],

  // ─── Business (25) ───
  ["coursera","yale-wellbeing","The Science of Well-Being","Yale University","Psikologi kebahagiaan oleh Prof. Laurie Santos.","https://www.coursera.org/learn/the-science-of-well-being",19,"en",0,4.9,"beginner"],
  ["coursera","yale-financial-markets","Financial Markets","Yale University (Robert Shiller)","Pengantar pasar keuangan oleh peraih Nobel.","https://www.coursera.org/learn/financial-markets-global",33,"en",0,4.8,"beginner"],
  ["khan","personal-finance","Personal Finance","Khan Academy","Mengelola uang pribadi: budgeting, investing, retirement.","https://www.khanacademy.org/college-careers-more/personal-finance",12,"en",0,4.7,"beginner"],
  ["coursera","google-digital-marketing","Google Digital Marketing & E-commerce Certificate","Google","Sertifikat Google: SEO, social, email marketing, e-commerce.","https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce",150,"en",0,4.8,"beginner"],
  ["coursera","wharton-foundations","Business Foundations Specialization","University of Pennsylvania (Wharton)","4-kursus: marketing, finance, accounting, operations.","https://www.coursera.org/specializations/wharton-business-foundations",90,"en",0,4.7,"intermediate"],
  ["coursera","marketing-digital","Marketing in a Digital World","University of Illinois","Bagaimana digital mengubah marketing.","https://www.coursera.org/learn/marketing-digital",25,"en",0,4.7,"beginner"],
  ["coursera","strategic-leadership","Strategic Leadership and Management Specialization","University of Illinois","Spesialisasi 5-kursus: leading teams, strategy, finance.","https://www.coursera.org/specializations/strategic-leadership",70,"en",0,4.7,"intermediate"],
  ["skillacademy","project-management","Belajar Dasar Manajemen Proyek","Skill Academy (Ruangguru)","PMBOK dasar untuk SMK & fresh graduate.","https://www.skillacademy.com/all-classes",10,"id",200000,4.5,"beginner"],
  ["skillacademy","akuntansi-dasar","Akuntansi Dasar untuk Pemula","Skill Academy (Ruangguru)","Debit-kredit, jurnal, laporan keuangan dasar.","https://www.skillacademy.com/all-classes",12,"id",150000,4.6,"beginner"],
  ["coursera","umich-negotiation","Successful Negotiation: Essential Strategies","University of Michigan","Teori + praktik negosiasi.","https://www.coursera.org/learn/negotiation-skills",17,"en",0,4.8,"intermediate"],
  ["skillacademy","pm-pro","Project Management: From Beginner to Pro","Skill Academy (Ruangguru)","Manajemen proyek end-to-end dengan tools modern.","https://www.skillacademy.com/all-classes",20,"id",350000,4.6,"intermediate"],
  ["coursera","google-pm","Google Project Management Professional Certificate","Google","Sertifikat Google PM: Agile, Scrum, Kanban.","https://www.coursera.org/professional-certificates/google-project-management",180,"en",0,4.8,"beginner"],
  ["skillacademy","public-speaking","Public Speaking & Persuasion","Skill Academy (Ruangguru)","Berbicara di depan umum dengan percaya diri.","https://www.skillacademy.com/all-classes",6,"id",100000,4.7,"beginner"],
  ["coursera","brand-management","Brand Management: Aligning Business, Brand and Behaviour","University of London","Strategi branding modern.","https://www.coursera.org/learn/brand",12,"en",0,4.7,"intermediate"],
  ["skillacademy","social-media","Social Media Marketing","Skill Academy (Ruangguru)","Strategi Instagram, TikTok, YouTube untuk bisnis.","https://www.skillacademy.com/all-classes",12,"id",200000,4.6,"beginner"],
  ["arkademi","seo-pemula","Belajar SEO untuk Pemula","Arkademi","SEO on-page + off-page + tools.","https://arkademi.com/",8,"id",150000,4.5,"beginner"],
  ["arkademi","copywriting","Copywriting Untuk Konversi Tinggi","Arkademi","Copy yang menjual: framework AIDA, PAS, storytelling.","https://arkademi.com/",5,"id",200000,4.6,"intermediate"],
  ["coursera","wharton-entrepreneurship","Entrepreneurship Specialization","Wharton","4-kursus: dari opportunity recognition sampai growth.","https://www.coursera.org/specializations/wharton-entrepreneurship",80,"en",0,4.7,"intermediate"],
  ["arkademi","bisnis-online","Belajar Bisnis Online untuk Pemula","Arkademi","Memulai bisnis online dari nol.","https://arkademi.com/",10,"id",250000,4.5,"beginner"],
  ["skillacademy","product-manager","Memulai Karir Sebagai Product Manager","Skill Academy (Ruangguru)","Roadmap karir PM di Indonesia.","https://www.skillacademy.com/all-classes",12,"id",250000,4.7,"intermediate"],
  ["arkademi","investasi-saham","Belajar Investasi Saham untuk Pemula","Arkademi","Analisis fundamental + teknikal saham IDX.","https://arkademi.com/",6,"id",150000,4.5,"beginner"],
  ["coursera","excel-essentials","Excel Fundamentals for Data Analysis","Macquarie University","Excel untuk analisis bisnis sehari-hari.","https://www.coursera.org/learn/excel-fundamentals-data-analysis",25,"en",0,4.9,"beginner"],
  ["skillacademy","bisnis-plan","Belajar Membuat Bisnis Plan","Skill Academy (Ruangguru)","Template + framework BP untuk pitch ke investor.","https://www.skillacademy.com/all-classes",8,"id",100000,4.5,"beginner"],
  ["coursera","emotional-intelligence","Inspiring Leadership through Emotional Intelligence","Case Western Reserve","EQ untuk pemimpin oleh Richard Boyatzis.","https://www.coursera.org/learn/emotional-intelligence-leadership",19,"en",0,4.7,"intermediate"],
  ["coursera","strategic-innovation","Strategic Innovation: Managing Innovation Initiatives","University of Illinois","Inovasi strategis di perusahaan besar.","https://www.coursera.org/learn/innovation-initiative",30,"en",0,4.7,"intermediate"],

  // ─── Communication + Soft skills (20) ───
  ["coursera","umich-negotiation-2","Successful Negotiation: Essential Strategies","University of Michigan","Negosiasi praktis di tempat kerja.","https://www.coursera.org/learn/negotiation-skills",17,"en",0,4.8,"beginner"],
  ["coursera","wharton-communication","Improving Communication Skills","Wharton","Komunikasi profesional efektif.","https://www.coursera.org/learn/wharton-communication-skills",16,"en",0,4.6,"beginner"],
  ["skillacademy","presentation","Public Speaking & Presentation","Skill Academy (Ruangguru)","Storytelling presentasi yang memukau.","https://www.skillacademy.com/all-classes",6,"id",100000,4.6,"beginner"],
  ["skillacademy","effective-comm","Effective Communication","Skill Academy (Ruangguru)","Active listening, feedback, conflict resolution.","https://www.skillacademy.com/all-classes",5,"id",75000,4.6,"beginner"],
  ["skillacademy","time-mgmt","Time Management Fundamentals","Skill Academy (Ruangguru)","Eisenhower matrix, Pomodoro, deep work.","https://www.skillacademy.com/all-classes",4,"id",50000,4.7,"beginner"],
  ["coursera","critical-thinking","Critical Thinking Skills for the Professional","UC Davis","Berpikir kritis di tempat kerja.","https://www.coursera.org/learn/critical-thinking-skills-for-the-professional",16,"en",0,4.6,"beginner"],
  ["coursera","rice-leadership","Engineering Leadership and Communication","Rice University","Skill leadership untuk insinyur dan saintis.","https://www.coursera.org/learn/leadership-engineering",20,"en",0,4.6,"intermediate"],
  ["skillacademy","mindfulness","Mindfulness untuk Produktivitas","Skill Academy (Ruangguru)","Latihan mindfulness untuk fokus + reduce stress.","https://www.skillacademy.com/all-classes",4,"id",50000,4.5,"beginner"],
  ["skillacademy","stress-mgmt","Mengatasi Stres di Tempat Kerja","Skill Academy (Ruangguru)","Manajemen stres + mental wellbeing.","https://www.skillacademy.com/all-classes",5,"id",100000,4.6,"beginner"],
  ["skillacademy","personal-branding","Networking & Personal Branding","Skill Academy (Ruangguru)","Build personal brand di LinkedIn + offline.","https://www.skillacademy.com/all-classes",6,"id",100000,4.5,"beginner"],
  ["coursera","learning-how-to-learn","Learning How to Learn","McMaster University","Teknik belajar berbasis neuroscience.","https://www.coursera.org/learn/learning-how-to-learn",15,"en",0,4.8,"beginner"],
  ["coursera","mindshift","Mindshift: Break Through Obstacles","McMaster University","Career change + lifelong learning mindset.","https://www.coursera.org/learn/mindshift",25,"en",0,4.8,"beginner"],
  ["skillacademy","storytelling","Storytelling untuk Persuasi","Skill Academy (Ruangguru)","Framework storytelling untuk pitch + presentasi.","https://www.skillacademy.com/all-classes",4,"id",100000,4.6,"intermediate"],
  ["skillacademy","conflict-resolution","Resolving Workplace Conflict","Skill Academy (Ruangguru)","Mediasi + konflik resolution practical.","https://www.skillacademy.com/all-classes",4,"id",75000,4.5,"beginner"],
  ["skillacademy","cv-cover-letter","Menulis CV & Cover Letter Profesional","Skill Academy (Ruangguru)","Template + review untuk siswa SMA & fresh grad.","https://www.skillacademy.com/all-classes",3,"id",50000,4.7,"beginner"],
  ["skillacademy","interview-skills","Interview Skills for Job Seekers","Skill Academy (Ruangguru)","Persiapan interview behavioral + technical.","https://www.skillacademy.com/all-classes",4,"id",75000,4.6,"beginner"],
  ["skillacademy","body-language","Bahasa Tubuh untuk Komunikasi","Skill Academy (Ruangguru)","Nonverbal communication di profesional setting.","https://www.skillacademy.com/all-classes",3,"id",50000,4.5,"beginner"],
  ["skillacademy","active-listening","Active Listening Skills","Skill Academy (Ruangguru)","Latihan listening untuk leader + counselor.","https://www.skillacademy.com/all-classes",3,"id",50000,4.6,"beginner"],
  ["skillacademy","team-collab","Team Collaboration & Remote Work","Skill Academy (Ruangguru)","Tools + framework remote work yang produktif.","https://www.skillacademy.com/all-classes",5,"id",100000,4.5,"beginner"],
  ["skillacademy","analytical-thinking","Berpikir Kritis & Analitis","Skill Academy (Ruangguru)","Latihan critical thinking dengan studi kasus.","https://www.skillacademy.com/all-classes",6,"id",100000,4.6,"beginner"],

  // ─── Math + Science (15) ───
  ["edx","mit-calc1a","Calculus 1A: Differentiation","MIT","Kalkulus diferensial dari MIT.","https://www.edx.org/learn/calculus/massachusetts-institute-of-technology-calculus-1a-differentiation",60,"en",0,4.8,"intermediate"],
  ["mit-ocw","18.01","Single Variable Calculus","MIT OpenCourseWare","Kelas kalkulus satu variabel MIT (18.01).","https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/",30,"en",0,4.8,"intermediate"],
  ["khan","calc1","Calculus 1","Khan Academy","Kalkulus 1 lengkap dengan latihan interaktif.","https://www.khanacademy.org/math/calculus-1",40,"en",0,4.9,"beginner"],
  ["khan","trig","Trigonometry","Khan Academy","Trigonometri dari unit circle sampai identity.","https://www.khanacademy.org/math/trigonometry",25,"en",0,4.9,"beginner"],
  ["khan","algebra-id","Aljabar (Bahasa Indonesia)","Khan Academy","Aljabar 1 dalam Bahasa Indonesia.","https://id.khanacademy.org/math/algebra",50,"id",0,4.9,"beginner"],
  ["khan","geometry-id","Geometri (Bahasa Indonesia)","Khan Academy","Geometri untuk SMP/SMA.","https://id.khanacademy.org/math/geometry",40,"id",0,4.9,"beginner"],
  ["khan","physics-id","Fisika (Bahasa Indonesia)","Khan Academy","Fisika SMA dari mekanika sampai listrik.","https://id.khanacademy.org/science/physics",60,"id",0,4.9,"beginner"],
  ["khan","chemistry-id","Kimia (Bahasa Indonesia)","Khan Academy","Kimia SMA: atom, ikatan, reaksi.","https://id.khanacademy.org/science/chemistry",50,"id",0,4.9,"beginner"],
  ["khan","biology-id","Biologi (Bahasa Indonesia)","Khan Academy","Biologi SMA: sel, genetika, ekologi.","https://id.khanacademy.org/science/biology",50,"id",0,4.9,"beginner"],
  ["mit-ocw","8.04","Quantum Physics I","MIT OpenCourseWare","Pengantar mekanika kuantum MIT.","https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2013/",40,"en",0,4.7,"advanced"],
  ["coursera","astronomy","Astronomy: Exploring Time and Space","University of Arizona","Astronomi modern dari Big Bang sampai exoplanet.","https://www.coursera.org/learn/astronomy",30,"en",0,4.7,"beginner"],
  ["coursera","genetics-society","Genetics and Society","American Museum of Natural History","Genetika + etikanya dalam masyarakat modern.","https://www.coursera.org/learn/genetics-society",20,"en",0,4.7,"beginner"],
  ["pahamify","utbk-math","Belajar Matematika untuk UTBK","Pahamify","Persiapan UTBK matematika dengan strategi soal.","https://pahamify.com/",40,"id",200000,4.6,"intermediate"],
  ["pahamify","utbk-physics","Belajar Fisika untuk UTBK","Pahamify","Persiapan UTBK fisika.","https://pahamify.com/",40,"id",200000,4.6,"intermediate"],
  ["youtube","rosling-stats","Hans Rosling: Joy of Statistics","YouTube (Hans Rosling)","Statistika yang dijelaskan dengan inspiratif.","https://www.youtube.com/watch?v=jbkSRLYSojo",5,"en",0,4.8,"beginner"],

  // ─── Languages (15) ───
  ["coursera","english-career","English for Career Development","University of Pennsylvania","English skills untuk job application + workplace.","https://www.coursera.org/learn/careerdevelopment",40,"en",0,4.8,"beginner"],
  ["coursera","business-english","Business English Specialization","Arizona State University","Spesialisasi 5-kursus Business English.","https://www.coursera.org/specializations/business-english",90,"en",0,4.7,"intermediate"],
  ["coursera","toefl-prep","TOEFL Test Preparation","Educational Testing Service","Persiapan TOEFL resmi dari pembuat tes.","https://www.coursera.org/learn/toefl-prep",30,"en",0,4.6,"intermediate"],
  ["edx","ielts-prep","IELTS Academic Test Preparation","University of Queensland","Persiapan IELTS Academic.","https://www.edx.org/course/ielts-academic-test-preparation",30,"en",0,4.7,"intermediate"],
  ["cakap","english-pemula","Belajar Bahasa Inggris untuk Pemula","Cakap","Live class dengan native speaker.","https://cakap.com/",60,"id",1500000,4.6,"beginner"],
  ["ef","english-live","EF English Live — Conversation Practice","EF Education First","Online English dengan 24/7 conversation class.","https://englishlive.ef.com/",100,"en",2000000,4.5,"intermediate"],
  ["coursera","mandarin-1","Chinese for Beginners","Peking University","Mandarin level 1 dari Peking U.","https://www.coursera.org/learn/learn-chinese",30,"en",0,4.7,"beginner"],
  ["ttmik","korean-step","Korean Step by Step","TalkToMeInKorean","Korean dari hangul sampai conversational.","https://talktomeinkorean.com/",25,"en",0,4.8,"beginner"],
  ["cakap","japanese-pemula","Belajar Bahasa Jepang untuk Pemula","Cakap","Hiragana + katakana + percakapan dasar.","https://cakap.com/",40,"id",1200000,4.5,"beginner"],
  ["coursera","spanish-vocab","Spanish Vocabulary Specialization","UC Davis","4-kursus vocab Spanish dari basic ke advanced.","https://www.coursera.org/specializations/spanish-vocabulary",40,"en",0,4.7,"beginner"],
  ["edx","arabic-beginner","Arabic for Beginners","Madinah Arabic","Bahasa Arab dari alfabet ke percakapan dasar.","https://www.edx.org/learn/arabic",25,"en",0,4.6,"beginner"],
  ["arkademi","arabic-dasar","Belajar Bahasa Arab Dasar","Arkademi","Bahasa Arab untuk pemula muslim Indonesia.","https://arkademi.com/",12,"id",200000,4.5,"beginner"],
  ["cambridge","pronunciation","English Pronunciation in Use","Cambridge University Press","Latihan pronunciation Inggris British/American.","https://www.cambridge.org/elt/",15,"en",250000,4.6,"intermediate"],
  ["bbc","bbc-english","BBC Learning English","BBC","English daily lessons gratis dari BBC.","https://www.bbc.co.uk/learningenglish",20,"en",0,4.7,"beginner"],
  ["cakap","english-conversation","Cakap Live Class — English Conversation","Cakap","Live conversation class harian.","https://cakap.com/",24,"id",800000,4.6,"intermediate"],

  // ─── Trades + Practical (15) ───
  ["youtube","motor-repair","Belajar Memperbaiki Sepeda Motor","YouTube (Motor Plus)","Tutorial perbaikan motor dari channel populer Indonesia.","https://www.youtube.com/results?search_query=motor+plus+tutorial",8,"id",0,4.5,"beginner"],
  ["khan","electrical-eng","Electrical Engineering","Khan Academy","Listrik dasar: Ohm, Kirchhoff, AC/DC.","https://www.khanacademy.org/science/electrical-engineering",20,"en",0,4.7,"beginner"],
  ["youtube","plumbing-basics","Plumbing Basics for Homeowners","YouTube (Roger Wakefield)","Plumbing dasar untuk perbaikan rumah.","https://www.youtube.com/@RogerWakefieldExpertPlumber",6,"en",0,4.6,"beginner"],
  ["coursera","solar-install","Solar Energy Basics","SUNY","Solar PV dari teori sampai instalasi.","https://www.coursera.org/learn/solar-energy-basics",25,"en",0,4.6,"intermediate"],
  ["youtube","welding-tips","Welding Fundamentals","YouTube (Welding Tips and Tricks)","Welding teknik MIG/TIG/Stick dari ekspert.","https://www.youtube.com/@weldingtipsandtricks",10,"en",0,4.7,"beginner"],
  ["skillacademy","otomotif","Belajar Teknik Otomotif Dasar","Skill Academy (Ruangguru)","Mekanika otomotif untuk SMK & hobiis.","https://www.skillacademy.com/all-classes",12,"id",150000,4.5,"beginner"],
  ["youtube","carpentry","Carpentry for Beginners","YouTube (Steve Ramsey)","Woodworking dari tools sampai project pertama.","https://www.youtube.com/@SteveRamsey",15,"en",0,4.7,"beginner"],
  ["coursera","hvac","HVAC Fundamentals","University of Colorado","HVAC system design + maintenance.","https://www.coursera.org/learn/hvac-fundamentals",20,"en",0,4.5,"beginner"],
  ["youtube","las-listrik","Belajar Las Listrik Dasar","YouTube (Las Indonesia)","Las listrik untuk pemula dengan instruktur Indonesia.","https://www.youtube.com/results?search_query=belajar+las+listrik",6,"id",0,4.5,"beginner"],
  ["youtube","plc-basics","PLC Programming Basics","YouTube (RealPars)","PLC untuk otomasi industri.","https://www.youtube.com/@realpars",12,"en",0,4.8,"intermediate"],
  ["arkademi","hidroponik","Belajar Pertanian Hidroponik","Arkademi","Hidroponik komersial dari nol.","https://arkademi.com/",8,"id",200000,4.6,"beginner"],
  ["coursera","aquaponics","Aquaponics: Sustainable Food Production","University of Maryland","Aquaponic system dari teori sampai praktik.","https://www.coursera.org/learn/aquaponics",15,"en",0,4.5,"intermediate"],
  ["arkademi","ternak-ayam","Belajar Beternak Ayam Petelur","Arkademi","Manajemen ayam petelur skala kecil-menengah.","https://arkademi.com/",6,"id",150000,4.4,"beginner"],
  ["edx","automotive-eng","Automotive Engineering: Electric Vehicles","Delft University of Technology","EV dari sistem batere sampai motor listrik.","https://www.edx.org/learn/automotive-engineering",40,"en",0,4.6,"intermediate"],
  ["coursera","construction-safety","Construction Safety and Health","Georgia Tech","Standar keselamatan kerja konstruksi.","https://www.coursera.org/learn/construction-safety",12,"en",0,4.6,"beginner"],

  // ─── Healthcare + Biology (15) ───
  ["coursera","anatomy-spec","Anatomy Specialization","University of Michigan","4-kursus anatomi manusia lengkap.","https://www.coursera.org/specializations/anatomy",60,"en",0,4.8,"beginner"],
  ["coursera","yale-psychology","Introduction to Psychology","Yale University (Paul Bloom)","Psikologi pengantar oleh Paul Bloom.","https://www.coursera.org/learn/introduction-psychology",16,"en",0,4.9,"beginner"],
  ["coursera","nutrition-science","The Science of Nutrition","Stanford University","Nutrisi berbasis sains dari Stanford.","https://www.coursera.org/learn/nutrition-science",18,"en",0,4.8,"beginner"],
  ["coursera","vital-signs","Vital Signs: Understanding What the Body Is Telling Us","University of Pennsylvania","Membaca tanda vital tubuh manusia.","https://www.coursera.org/learn/vital-signs",12,"en",0,4.7,"beginner"],
  ["coursera","public-health-basics","Foundations of Public Health Practice","Johns Hopkins","Pengantar kesehatan masyarakat.","https://www.coursera.org/specializations/foundations-of-public-health-practice",14,"en",0,4.8,"beginner"],
  ["skillacademy","p3k","Pertolongan Pertama (P3K)","Skill Academy (Ruangguru)","Skill dasar P3K untuk umum.","https://www.skillacademy.com/all-classes",4,"id",75000,4.7,"beginner"],
  ["coursera","mental-health-healthcare","Mental Health and Resilience for Healthcare Workers","Johns Hopkins","Mental wellbeing untuk tenaga kesehatan.","https://www.coursera.org/learn/manage-health-and-wellbeing",12,"en",0,4.8,"beginner"],
  ["edx","mit-genetics","Introduction to Biology - The Secret of Life","MIT","Biologi molekuler dari MIT.","https://www.edx.org/learn/biology/massachusetts-institute-of-technology-introduction-to-biology-the-secret-of-life",30,"en",0,4.7,"intermediate"],
  ["coursera","stanford-food-health","Stanford Introduction to Food and Health","Stanford University","Hubungan makanan, kesehatan, dan budaya.","https://www.coursera.org/learn/food-and-health",7,"en",0,4.7,"beginner"],
  ["arkademi","kebidanan","Belajar Dasar Kebidanan & Kesehatan Reproduksi","Arkademi","Kesehatan reproduksi dari sudut pandang kebidanan.","https://arkademi.com/",12,"id",200000,4.5,"intermediate"],
  ["coursera","ai-medical-diagnosis","AI for Medical Diagnosis","DeepLearning.AI","ML applied untuk medical imaging diagnosis.","https://www.coursera.org/learn/ai-for-medical-diagnosis",20,"en",0,4.7,"advanced"],
  ["coursera","vaccines","Vaccines","University of Pennsylvania","Sejarah, sains, dan policy vaksin.","https://www.coursera.org/learn/vaccines",18,"en",0,4.8,"beginner"],
  ["coursera","drug-discovery","Drug Discovery","UC San Diego","Bagaimana obat baru ditemukan dan dikembangkan.","https://www.coursera.org/learn/drug-discovery",30,"en",0,4.6,"intermediate"],
  ["pahamify","anatomi","Anatomi Manusia untuk Pemula","Pahamify","Anatomi dasar untuk siswa IPA SMA.","https://pahamify.com/",20,"id",250000,4.6,"beginner"],
  ["arkademi","farmasi","Belajar Farmasi Dasar","Arkademi","Pengantar ilmu farmasi.","https://arkademi.com/",10,"id",200000,4.5,"beginner"],

  // ─── Indonesian-specific (15) ───
  ["edukasi","pancasila","Pendidikan Pancasila untuk Generasi Muda","Edukasi.com","Pancasila dalam konteks Indonesia modern.","https://edukasi.com/",8,"id",0,4.6,"beginner"],
  ["youtube","sejarah-id","Sejarah Indonesia Lengkap","YouTube (Studi Sejarah)","Sejarah Indonesia dari prasejarah ke reformasi.","https://www.youtube.com/results?search_query=sejarah+indonesia+lengkap",20,"id",0,4.7,"beginner"],
  ["skillacademy","ebi","Bahasa Indonesia EBI (Ejaan Bahasa Indonesia)","Skill Academy (Ruangguru)","EBI + PUEBI untuk tulisan profesional.","https://www.skillacademy.com/all-classes",6,"id",75000,4.6,"beginner"],
  ["edukasi","kewarganegaraan","Kewarganegaraan dan Konstitusi RI","Edukasi.com","PPKn untuk SMA, fokus konstitusi.","https://edukasi.com/",6,"id",0,4.5,"beginner"],
  ["arkademi","aksara-jawa","Belajar Aksara Jawa dan Sunda","Arkademi","Aksara daerah Nusantara untuk pelestarian budaya.","https://arkademi.com/",8,"id",100000,4.5,"beginner"],
  ["edukasi","sastra-id","Sastra Indonesia Klasik","Edukasi.com","Pengantar sastra klasik Indonesia.","https://edukasi.com/",12,"id",0,4.4,"intermediate"],
  ["youtube","adat-nusantara","Adat Istiadat Nusantara","YouTube (Indonesia Kaya)","Eksplorasi budaya 38 provinsi.","https://www.youtube.com/@indonesiakaya",10,"id",0,4.7,"beginner"],
  ["pahamify","geografi-id","Geografi Indonesia & Persebarannya","Pahamify","Geografi fisik + sosial Indonesia.","https://pahamify.com/",18,"id",200000,4.5,"beginner"],
  ["pahamify","utbk-prep","Persiapan UTBK SBMPTN","Pahamify","Persiapan UTBK lengkap semua subtest.","https://pahamify.com/",80,"id",350000,4.7,"intermediate"],
  ["arkademi","membatik","Belajar Membatik Tradisional","Arkademi","Teknik batik tulis dari pengrajin.","https://arkademi.com/",8,"id",250000,4.6,"beginner"],
  ["youtube","tari-tradisional","Tari Tradisional Indonesia","YouTube (Indonesia Kaya)","Tari klasik dari Aceh sampai Papua.","https://www.youtube.com/@indonesiakaya",15,"id",0,4.5,"beginner"],
  ["arkademi","gamelan","Musik Gamelan untuk Pemula","Arkademi","Pengantar gamelan Jawa + Bali.","https://arkademi.com/",10,"id",200000,4.5,"beginner"],
  ["pahamify","sma-english","Bahasa Inggris untuk Siswa SMA","Pahamify","English curriculum SMA sesuai kurikulum nasional.","https://pahamify.com/",25,"id",200000,4.6,"beginner"],
  ["pahamify","tps","Persiapan Tes Potensi Skolastik (TPS)","Pahamify","TPS UTBK: PU, PBM, PPU, PK.","https://pahamify.com/",30,"id",250000,4.6,"intermediate"],
  ["skillacademy","kewirausahaan-sma","Kewirausahaan untuk Siswa SMA","Skill Academy (Ruangguru)","Dasar bisnis + mindset entrepreneur untuk SMA.","https://www.skillacademy.com/all-classes",8,"id",100000,4.5,"beginner"],
];

console.log(`Loaded ${COURSES.length} curated courses.\n`);

// Sanity check: per-cluster distribution
const summary = {};
for (const c of COURSES) {
  const src = c[0];
  summary[src] = (summary[src] || 0) + 1;
}
console.table(Object.entries(summary).map(([source, n]) => ({ source, n })));

// ─────────────────────────────────────────────────────────────────────────
// Wipe + insert
// ─────────────────────────────────────────────────────────────────────────
console.log("\n[1/2] Wiping existing course_catalog + course_skill_tags …");
await client.execute(`DELETE FROM course_skill_tags`);
await client.execute(`DELETE FROM course_catalog`);

console.log(`[2/2] Inserting ${COURSES.length} courses …`);
const BATCH = 50;
for (let i = 0; i < COURSES.length; i += BATCH) {
  const slice = COURSES.slice(i, i + BATCH);
  const stmts = slice.map(c => ({
    sql: `INSERT INTO course_catalog
            (id, source, external_id, title, provider, description, url,
             duration_hours, language, price_idr, rating, level)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [newId("crs"), ...c],
  }));
  await client.batch(stmts, "write");
  process.stdout.write(`  ${Math.min(i + BATCH, COURSES.length)}/${COURSES.length}\r`);
}
console.log("");

const totals = await client.execute(`
  SELECT
    (SELECT COUNT(*) FROM course_catalog) AS courses,
    (SELECT COUNT(*) FROM course_skill_tags) AS tags
`);
console.log("\n✓ Done.");
console.table(totals.rows[0]);
await client.close();
