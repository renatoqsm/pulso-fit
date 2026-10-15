import type { PrismaClient, User } from '@prisma/client';
import { NextResponse } from 'next/server';
export async function workspace(db: PrismaClient, user: User) {
  const recentSessions = await db.workoutSession.findMany({
    where: { studentId: user.id },
    select: {
      id: true,
      studentId: true,
      dayId: true,
      endedAt: true,
      startedAt: true,
      status: true,
      day: { select: { name: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 12,
  });
  const assignments = await db.workoutAssignment.findMany({
    where: { studentId: user.id, version: { program: { authorId: user.id, removal: null } } },
    select: {
      version: {
        select: {
          id: true,
          programId: true,
          number: true,
          validFrom: true,
          validUntil: true,
          program: { select: { name: true } },
          days: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              suggestedDays: true,
              exercises: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  const now = new Date();
  const effective = assignments.filter(
    ({ version: v }) =>
      (!v.validFrom || v.validFrom <= now) && (!v.validUntil || v.validUntil >= now),
  );
  const latest = effective.filter(
    ({ version: v }) =>
      !effective.some(({ version: w }) => w.programId === v.programId && w.number > v.number),
  );
  return NextResponse.json(
    {
      modules: ['TRAINING'],
      role: user.role,
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        dayId: s.dayId,
        endedAt: s.endedAt,
        name: s.day.name,
        status: s.status,
        date: s.startedAt,
      })),
      days: latest.flatMap(({ version: v }) =>
        v.days.map((d) => ({
          id: d.id,
          name: d.name,
          suggestedDays: d.suggestedDays,
          exerciseCount: d.exercises.length,
          program: v.program.name,
        })),
      ),
      workoutPrograms: await db.workoutProgram.count({
        where: { authorId: user.id, removal: null },
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
