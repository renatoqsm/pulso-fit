import type { PrismaClient, User } from '@prisma/client';
import { NextResponse } from 'next/server';
export async function workspace(db: PrismaClient, user: User) {
  const links = await db.professionalStudentLink.findMany({
    where:
      user.role === 'STUDENT'
        ? { studentId: user.id, status: 'ACTIVE' }
        : { professionalId: user.id, status: 'ACTIVE' },
    include: {
      consents: { where: { revokedAt: null } },
      student: { select: { id: true, profile: { select: { name: true } } } },
    },
  });
  const credentials = await db.professionalCredential.findMany({
    where: { professionalId: user.id, status: 'VERIFIED' },
  });
  const modules =
    user.role === 'STUDENT'
      ? links.length
        ? [...new Set(links.filter((l) => l.consents.length).map((l) => l.area))]
        : ['TRAINING', 'NUTRITION']
      : user.role === 'PROFESSIONAL'
        ? credentials.map((c) => c.area)
        : [];
  const trainingIds =
    user.role === 'STUDENT'
      ? [user.id]
      : user.role === 'PROFESSIONAL'
        ? links
            .filter(
              (l) =>
                l.area === 'TRAINING' &&
                l.consents.some((c) => c.scope === 'TRAINING_HISTORY') &&
                modules.includes('TRAINING'),
            )
            .map((l) => l.studentId)
        : [];
  const nutritionIds =
    user.role === 'STUDENT'
      ? [user.id]
      : user.role === 'PROFESSIONAL'
        ? links
            .filter(
              (l) =>
                l.area === 'NUTRITION' &&
                l.consents.some((c) => c.scope === 'NUTRITION_HISTORY') &&
                modules.includes('NUTRITION'),
            )
            .map((l) => l.studentId)
        : [];
  const recentSessions = await db.workoutSession.findMany({
    where: { studentId: { in: trainingIds } },
    include: { day: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
    take: 12,
  });
  const recentMeals = await db.mealLog.findMany({
    where: { studentId: { in: nutritionIds }, consumedAt: { not: null } },
    select: { id: true, studentId: true, date: true, mealName: true, consumedAt: true },
    orderBy: { consumedAt: 'desc' },
    take: 12,
  });
  return NextResponse.json(
    {
      modules,
      role: user.role,
      students: links.map((l) => ({
        id: l.student.id,
        name: l.student.profile?.name,
        area: l.area,
      })),
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        name: s.day.name,
        status: s.status,
        date: s.startedAt,
        feedback: s.feedback,
      })),
      recentMeals,
      workoutPrograms: await db.workoutProgram.count({ where: { authorId: user.id } }),
      nutritionPlans: await db.nutritionPlan.count({ where: { authorId: user.id } }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
