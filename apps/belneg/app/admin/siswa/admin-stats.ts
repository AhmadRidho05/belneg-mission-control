// Server-side aggregator for the /admin/siswa dashboard — full LMS data.
import { qAll, qGet } from "../../api/v1/_lib";

export type SiswaStats = {
  hero: {
    total_users: number;
    total_schools: number;
    active_programs: number;
    total_courses: number;
    total_enrollments: number;
    total_completed: number;
    completion_rate: number;
    total_certificates: number;
  };
  users: {
    id: string;
    fullname: string;
    email: string;
    phone: string | null;
    isActive: number;
    createdAt: string | null;
    n_enrollments: number;
  }[];
  organizations: {
    id: string;
    name: string;
    isActive: number;
    n_courses: number;
    n_programs: number;
  }[];
  programs: {
    id: string;
    name: string;
    programStartDate: string | null;
    programEndDate: string | null;
    registrationStartDate: string | null;
    registrationEndDate: string | null;
    maxParticipants: number | null;
    isActive: number;
    n_pending: number;
    n_accepted: number;
    n_rejected: number;
  }[];
  enrollment_by_course: {
    course_id: string;
    title: string;
    n_enrolled: number;
    n_completed: number;
    total_enrollments: number;
    completion_rate: number;
  }[];
};

export async function getSiswaStats(): Promise<SiswaStats> {
  const [heroRow, userRows, orgRows, programRows, courseEnrollRows] = await Promise.all([
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM lms_users)                               AS total_users,
        (SELECT COUNT(*) FROM lms_schools)                             AS total_schools,
        (SELECT COUNT(*) FROM lms_programs WHERE isActive = 1)         AS active_programs,
        (SELECT COUNT(*) FROM lms_courses)                             AS total_courses,
        (SELECT COUNT(*) FROM lms_enrollments)                         AS total_enrollments,
        (SELECT COUNT(*) FROM lms_enrollments WHERE status = 'COMPLETED') AS total_completed,
        (SELECT COUNT(*) FROM lms_certificates)                        AS total_certificates
    `),

    qAll<any>(`
      SELECT u.id, u.fullname, u.email, u.phone, u.isActive, u.createdAt,
        COALESCE(
          (SELECT COUNT(*) FROM lms_enrollments e WHERE e.studentId = u.id), 0
        ) AS n_enrollments
      FROM lms_users u
      ORDER BY u.createdAt DESC
    `),

    qAll<any>(`
      SELECT o.id, o.name, o.isActive,
        COALESCE((SELECT COUNT(*) FROM lms_courses c WHERE c.organizationId = o.id), 0) AS n_courses,
        COALESCE((SELECT COUNT(*) FROM lms_programs p WHERE p.organizationId = o.id), 0) AS n_programs
      FROM lms_organizations o
      ORDER BY n_courses DESC
    `),

    qAll<any>(`
      SELECT p.id, p.name, p.programStartDate, p.programEndDate,
        p.registrationStartDate, p.registrationEndDate, p.maxParticipants, p.isActive,
        COALESCE(SUM(CASE WHEN pa.status = 'PENDING'  THEN 1 ELSE 0 END), 0) AS n_pending,
        COALESCE(SUM(CASE WHEN pa.status = 'ACCEPTED' THEN 1 ELSE 0 END), 0) AS n_accepted,
        COALESCE(SUM(CASE WHEN pa.status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS n_rejected
      FROM lms_programs p
      LEFT JOIN lms_program_applications pa ON pa.programId = p.id
      GROUP BY p.id
      ORDER BY p.isActive DESC, p.programStartDate ASC
    `),

    qAll<any>(`
      SELECT c.id AS course_id, c.title,
        COALESCE(SUM(CASE WHEN e.status = 'ENROLLED'  THEN 1 ELSE 0 END), 0) AS n_enrolled,
        COALESCE(SUM(CASE WHEN e.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS n_completed
      FROM lms_courses c
      LEFT JOIN lms_enrollments e ON e.courseId = c.id
      GROUP BY c.id, c.title
      HAVING n_enrolled + n_completed > 0
      ORDER BY n_enrolled + n_completed DESC
      LIMIT 20
    `),
  ]);

  const total_enrollments = Number(heroRow?.total_enrollments ?? 0);
  const total_completed   = Number(heroRow?.total_completed   ?? 0);

  return {
    hero: {
      total_users:        Number(heroRow?.total_users        ?? 0),
      total_schools:      Number(heroRow?.total_schools      ?? 0),
      active_programs:    Number(heroRow?.active_programs    ?? 0),
      total_courses:      Number(heroRow?.total_courses      ?? 0),
      total_enrollments,
      total_completed,
      completion_rate:    total_enrollments > 0
        ? Math.round((total_completed / total_enrollments) * 100)
        : 0,
      total_certificates: Number(heroRow?.total_certificates ?? 0),
    },

    users: userRows.map(u => ({
      id:            String(u.id),
      fullname:      String(u.fullname  ?? "—"),
      email:         String(u.email     ?? "—"),
      phone:         u.phone ? String(u.phone) : null,
      isActive:      Number(u.isActive  ?? 0),
      createdAt:     u.createdAt ? String(u.createdAt) : null,
      n_enrollments: Number(u.n_enrollments ?? 0),
    })),

    organizations: orgRows.map(o => ({
      id:         String(o.id),
      name:       String(o.name    ?? "—"),
      isActive:   Number(o.isActive ?? 0),
      n_courses:  Number(o.n_courses  ?? 0),
      n_programs: Number(o.n_programs ?? 0),
    })),

    programs: programRows.map(p => ({
      id:                    String(p.id),
      name:                  String(p.name ?? "—"),
      programStartDate:      p.programStartDate      ? String(p.programStartDate)      : null,
      programEndDate:        p.programEndDate        ? String(p.programEndDate)        : null,
      registrationStartDate: p.registrationStartDate ? String(p.registrationStartDate) : null,
      registrationEndDate:   p.registrationEndDate   ? String(p.registrationEndDate)   : null,
      maxParticipants:       p.maxParticipants != null ? Number(p.maxParticipants) : null,
      isActive:              Number(p.isActive ?? 0),
      n_pending:             Number(p.n_pending  ?? 0),
      n_accepted:            Number(p.n_accepted ?? 0),
      n_rejected:            Number(p.n_rejected ?? 0),
    })),

    enrollment_by_course: courseEnrollRows.map(c => {
      const enrolled  = Number(c.n_enrolled  ?? 0);
      const completed = Number(c.n_completed ?? 0);
      const total     = enrolled + completed;
      return {
        course_id:         String(c.course_id),
        title:             String(c.title ?? "—"),
        n_enrolled:        enrolled,
        n_completed:       completed,
        total_enrollments: total,
        completion_rate:   total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    }),
  };
}
