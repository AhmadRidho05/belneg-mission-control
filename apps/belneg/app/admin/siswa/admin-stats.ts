// Server-side aggregator for the /admin/siswa dashboard. Single Promise.all
// of all queries to keep page-load fast.
import { qAll, qGet } from "../../api/v1/_lib";

export type SiswaStats = {
  hero: {
    total_users: number;
    new_users_7d: number;
    new_users_30d: number;
    new_users_90d: number;
    dau: number;
    wau: number;
    mau: number;
    m6_active: number;
    m12_active: number;
    assessments_done: number;
    paths_generated: number;
    courses_started: number;
    courses_completed: number;
    avg_readiness_score: number;
  };
  geographic: {
    by_provinsi: { name: string; n: number }[];
    by_kab: { name: string; n: number }[];
    by_school: { npsn: string; nama: string; provinsi: string; n: number }[];
  };
  trend: {
    signup_90d: { date: string; n: number }[];
    dau_90d: { date: string; n: number }[];
  };
  riasec: {
    avg_per_dim: { R: number; I: number; A: number; S: number; E: number; C: number };
    top_codes: { code: string; n: number }[];
    by_gender: { gender: "L" | "P"; R: number; I: number; A: number; S: number; E: number; C: number }[];
    by_class: { school_class: string; R: number; I: number; A: number; S: number; E: number; C: number }[];
    by_provinsi: { provinsi: string; R: number; I: number; A: number; S: number; E: number; C: number; n: number }[];
  };
  career: {
    top_primary: { onet_soc_code: string; title: string; n: number }[];
    top_per_provinsi: { provinsi: string; onet_soc_code: string; title: string; n: number }[];
    top_per_gender: { gender: string; onet_soc_code: string; title: string; n: number }[];
    top_per_top_code: { top_code: string; onet_soc_code: string; title: string; n: number }[];
  };
  funnel: {
    signup: number;
    assessment_done: number;
    career_picked: number;
    self_assess_done: number;
    path_generated: number;
    first_course_started: number;
    first_course_completed: number;
  };
};

export async function getSiswaStats(): Promise<SiswaStats> {
  const [
    heroRow, newRow, dauRows,
    coursesRow,
    provinsiRows, kabRows, schoolRows,
    signupTrend, dauTrend,
    avgDimRow, topCodeRows,
    byGenderRows, byClassRows, byProvinsiRows,
    topPrimaryRows, topPerProvinsiRows, topPerGenderRows, topPerTopCodeRows,
    funnelRows,
    readinessRow,
  ] = await Promise.all([
    qGet<any>(`SELECT COUNT(*) AS total FROM siswa_users WHERE deleted_at IS NULL`),
    qGet<any>(`
      SELECT
        SUM(CASE WHEN created_at >= datetime('now','-7 days')   THEN 1 ELSE 0 END) AS n7,
        SUM(CASE WHEN created_at >= datetime('now','-30 days')  THEN 1 ELSE 0 END) AS n30,
        SUM(CASE WHEN created_at >= datetime('now','-90 days')  THEN 1 ELSE 0 END) AS n90
      FROM siswa_users WHERE deleted_at IS NULL`),
    qAll<{ d: string; n: number }>(`
      SELECT DATE(created_at) AS d, COUNT(DISTINCT user_id) AS n
      FROM siswa_activity_log
      WHERE created_at >= datetime('now','-1 days')
      GROUP BY DATE(created_at)`),
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM siswa_assessments) AS assessments,
        (SELECT COUNT(*) FROM siswa_learning_paths) AS paths,
        (SELECT COUNT(*) FROM siswa_course_progress WHERE started_at IS NOT NULL) AS started,
        (SELECT COUNT(*) FROM siswa_course_progress WHERE status = 'selesai') AS completed`),
    qAll<{ name: string; n: number }>(`
      SELECT s.provinsi AS name, COUNT(*) AS n
      FROM siswa_users u JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
      WHERE u.deleted_at IS NULL
      GROUP BY s.provinsi ORDER BY n DESC LIMIT 38`),
    qAll<{ name: string; n: number }>(`
      SELECT s.kab_kota AS name, COUNT(*) AS n
      FROM siswa_users u JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
      WHERE u.deleted_at IS NULL
      GROUP BY s.kab_kota ORDER BY n DESC LIMIT 20`),
    qAll<{ npsn: string; nama: string; provinsi: string; n: number }>(`
      SELECT s.npsn, s.nama, s.provinsi, COUNT(*) AS n
      FROM siswa_users u JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
      WHERE u.deleted_at IS NULL
      GROUP BY s.npsn ORDER BY n DESC LIMIT 20`),
    qAll<{ date: string; n: number }>(`
      SELECT DATE(created_at) AS date, COUNT(*) AS n
      FROM siswa_users
      WHERE deleted_at IS NULL AND created_at >= datetime('now','-90 days')
      GROUP BY DATE(created_at) ORDER BY date ASC`),
    qAll<{ date: string; n: number }>(`
      SELECT DATE(created_at) AS date, COUNT(DISTINCT user_id) AS n
      FROM siswa_activity_log
      WHERE created_at >= datetime('now','-90 days')
      GROUP BY DATE(created_at) ORDER BY date ASC`),
    qGet<any>(`
      SELECT
        ROUND(AVG(riasec_realistic),    1) AS R,
        ROUND(AVG(riasec_investigative),1) AS I,
        ROUND(AVG(riasec_artistic),     1) AS A,
        ROUND(AVG(riasec_social),       1) AS S,
        ROUND(AVG(riasec_enterprising), 1) AS E,
        ROUND(AVG(riasec_conventional), 1) AS C
      FROM siswa_assessments`),
    qAll<{ code: string; n: number }>(`
      SELECT top_code AS code, COUNT(*) AS n
      FROM siswa_assessments
      WHERE top_code IS NOT NULL
      GROUP BY top_code ORDER BY n DESC LIMIT 10`),
    qAll<any>(`
      SELECT u.gender,
        ROUND(AVG(a.riasec_realistic),    1) AS R,
        ROUND(AVG(a.riasec_investigative),1) AS I,
        ROUND(AVG(a.riasec_artistic),     1) AS A,
        ROUND(AVG(a.riasec_social),       1) AS S,
        ROUND(AVG(a.riasec_enterprising), 1) AS E,
        ROUND(AVG(a.riasec_conventional), 1) AS C
      FROM siswa_assessments a JOIN siswa_users u ON u.id = a.user_id
      WHERE u.gender IN ('L','P')
      GROUP BY u.gender`),
    qAll<any>(`
      SELECT u.school_class,
        ROUND(AVG(a.riasec_realistic),    1) AS R,
        ROUND(AVG(a.riasec_investigative),1) AS I,
        ROUND(AVG(a.riasec_artistic),     1) AS A,
        ROUND(AVG(a.riasec_social),       1) AS S,
        ROUND(AVG(a.riasec_enterprising), 1) AS E,
        ROUND(AVG(a.riasec_conventional), 1) AS C
      FROM siswa_assessments a JOIN siswa_users u ON u.id = a.user_id
      WHERE u.school_class IN ('10','11','12')
      GROUP BY u.school_class ORDER BY u.school_class ASC`),
    qAll<any>(`
      SELECT s.provinsi,
        ROUND(AVG(a.riasec_realistic),    1) AS R,
        ROUND(AVG(a.riasec_investigative),1) AS I,
        ROUND(AVG(a.riasec_artistic),     1) AS A,
        ROUND(AVG(a.riasec_social),       1) AS S,
        ROUND(AVG(a.riasec_enterprising), 1) AS E,
        ROUND(AVG(a.riasec_conventional), 1) AS C,
        COUNT(*) AS n
      FROM siswa_assessments a
      JOIN siswa_users u ON u.id = a.user_id
      JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
      GROUP BY s.provinsi ORDER BY n DESC LIMIT 10`),
    qAll<{ onet_soc_code: string; title: string; n: number }>(`
      SELECT u.primary_career_onet AS onet_soc_code, o.title, COUNT(*) AS n
      FROM siswa_users u
      JOIN onet_occupations o ON o.onet_soc_code = u.primary_career_onet
      WHERE u.primary_career_onet IS NOT NULL AND u.deleted_at IS NULL
      GROUP BY u.primary_career_onet ORDER BY n DESC LIMIT 20`),
    qAll<any>(`
      WITH ranked AS (
        SELECT s.provinsi, u.primary_career_onet, o.title, COUNT(*) AS n,
               ROW_NUMBER() OVER (PARTITION BY s.provinsi ORDER BY COUNT(*) DESC) AS rn
        FROM siswa_users u
        JOIN onet_occupations o ON o.onet_soc_code = u.primary_career_onet
        JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
        WHERE u.primary_career_onet IS NOT NULL
        GROUP BY s.provinsi, u.primary_career_onet
      )
      SELECT provinsi, primary_career_onet AS onet_soc_code, title, n
      FROM ranked WHERE rn = 1 ORDER BY n DESC LIMIT 15`),
    qAll<any>(`
      WITH ranked AS (
        SELECT u.gender, u.primary_career_onet, o.title, COUNT(*) AS n,
               ROW_NUMBER() OVER (PARTITION BY u.gender ORDER BY COUNT(*) DESC) AS rn
        FROM siswa_users u
        JOIN onet_occupations o ON o.onet_soc_code = u.primary_career_onet
        WHERE u.primary_career_onet IS NOT NULL AND u.gender IN ('L','P')
        GROUP BY u.gender, u.primary_career_onet
      )
      SELECT gender, primary_career_onet AS onet_soc_code, title, n
      FROM ranked WHERE rn <= 3 ORDER BY gender, n DESC`),
    qAll<any>(`
      WITH ranked AS (
        SELECT u.riasec_top_code, u.primary_career_onet, o.title, COUNT(*) AS n,
               ROW_NUMBER() OVER (PARTITION BY u.riasec_top_code ORDER BY COUNT(*) DESC) AS rn
        FROM siswa_users u
        JOIN onet_occupations o ON o.onet_soc_code = u.primary_career_onet
        WHERE u.primary_career_onet IS NOT NULL AND u.riasec_top_code IS NOT NULL
        GROUP BY u.riasec_top_code, u.primary_career_onet
      )
      SELECT riasec_top_code AS top_code, primary_career_onet AS onet_soc_code, title, n
      FROM ranked WHERE rn = 1 ORDER BY n DESC LIMIT 15`),
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM siswa_users WHERE deleted_at IS NULL) AS signup,
        (SELECT COUNT(DISTINCT user_id) FROM siswa_assessments) AS assessment_done,
        (SELECT COUNT(*) FROM siswa_users WHERE deleted_at IS NULL AND primary_career_onet IS NOT NULL) AS career_picked,
        (SELECT COUNT(DISTINCT user_id) FROM siswa_self_assessments) AS self_assess_done,
        (SELECT COUNT(DISTINCT user_id) FROM siswa_learning_paths) AS path_generated,
        (SELECT COUNT(DISTINCT user_id) FROM siswa_course_progress WHERE started_at IS NOT NULL) AS first_course_started,
        (SELECT COUNT(DISTINCT user_id) FROM siswa_course_progress WHERE completed_at IS NOT NULL) AS first_course_completed
    `),
    // Naive avg_readiness — simply % of users who have completed at least 1
    // course as a proxy; the real per-user score is computed in /readiness-score
    // and aggregating that across 500+ users would mean 500 round-trips.
    qGet<any>(`
      SELECT
        ROUND(100.0 * (
          SELECT COUNT(DISTINCT user_id) FROM siswa_course_progress WHERE status = 'selesai'
        ) / NULLIF((SELECT COUNT(*) FROM siswa_users WHERE deleted_at IS NULL), 0), 0) AS pct
    `),
  ]);

  // Active users via single query (DAU/WAU/MAU/M6/M12)
  const activeRows = await qGet<any>(`
    SELECT
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-1 days')   THEN user_id END) AS dau,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-7 days')   THEN user_id END) AS wau,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-30 days')  THEN user_id END) AS mau,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-180 days') THEN user_id END) AS m6,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','-365 days') THEN user_id END) AS m12
    FROM siswa_activity_log
    WHERE created_at >= datetime('now','-365 days')
  `);

  return {
    hero: {
      total_users:         Number(heroRow?.total ?? 0),
      new_users_7d:        Number(newRow?.n7 ?? 0),
      new_users_30d:       Number(newRow?.n30 ?? 0),
      new_users_90d:       Number(newRow?.n90 ?? 0),
      dau:                 Number(activeRows?.dau ?? 0),
      wau:                 Number(activeRows?.wau ?? 0),
      mau:                 Number(activeRows?.mau ?? 0),
      m6_active:           Number(activeRows?.m6 ?? 0),
      m12_active:          Number(activeRows?.m12 ?? 0),
      assessments_done:    Number(coursesRow?.assessments ?? 0),
      paths_generated:     Number(coursesRow?.paths ?? 0),
      courses_started:     Number(coursesRow?.started ?? 0),
      courses_completed:   Number(coursesRow?.completed ?? 0),
      avg_readiness_score: Number(readinessRow?.pct ?? 0),
    },
    geographic: { by_provinsi: provinsiRows, by_kab: kabRows, by_school: schoolRows },
    trend:      { signup_90d: signupTrend, dau_90d: dauTrend },
    riasec: {
      avg_per_dim: {
        R: Number(avgDimRow?.R ?? 0), I: Number(avgDimRow?.I ?? 0),
        A: Number(avgDimRow?.A ?? 0), S: Number(avgDimRow?.S ?? 0),
        E: Number(avgDimRow?.E ?? 0), C: Number(avgDimRow?.C ?? 0),
      },
      top_codes:    topCodeRows,
      by_gender:    byGenderRows,
      by_class:     byClassRows,
      by_provinsi:  byProvinsiRows,
    },
    career: {
      top_primary:        topPrimaryRows,
      top_per_provinsi:   topPerProvinsiRows,
      top_per_gender:     topPerGenderRows,
      top_per_top_code:   topPerTopCodeRows,
    },
    funnel: {
      signup:                  Number(funnelRows?.signup ?? 0),
      assessment_done:         Number(funnelRows?.assessment_done ?? 0),
      career_picked:           Number(funnelRows?.career_picked ?? 0),
      self_assess_done:        Number(funnelRows?.self_assess_done ?? 0),
      path_generated:          Number(funnelRows?.path_generated ?? 0),
      first_course_started:    Number(funnelRows?.first_course_started ?? 0),
      first_course_completed:  Number(funnelRows?.first_course_completed ?? 0),
    },
  };
}
