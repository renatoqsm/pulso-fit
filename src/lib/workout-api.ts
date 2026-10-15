import type { PrismaClient, User, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError } from './http-error';
import { authorship, studentAccess, professional, assignmentTargets } from './workflow-access';
import { canAccessStudent } from './access';
const txt = z.string().trim();
const id = txt.min(1).max(100);
const int = z.number().int().min(0).max(10000);
const kg = z.number().finite().min(0).max(10000).nullable().optional();
export const setInput = z
  .object({
    repsMin: int.nullable().optional(),
    repsMax: int.nullable().optional(),
    targetKg: kg,
    durationSeconds: int.nullable().optional(),
    restSeconds: z.number().int().min(0).max(3600).default(60),
    kind: z.enum(['WARMUP', 'WORKING', 'TIMED', 'FAILURE']).default('WORKING'),
    cadence: txt.max(80).nullable().optional(),
    rpe: z.number().min(0).max(10).nullable().optional(),
    rir: z.number().int().min(0).max(20).nullable().optional(),
    unilateral: z.boolean().default(false),
    technique: txt.max(120).nullable().optional(),
  })
  .strict()
  .refine(
    (s) => s.repsMin == null || s.repsMax == null || s.repsMax >= s.repsMin,
    'Intervalo de repetições inválido.',
  );
const exerciseInput = z
  .object({
    exerciseId: id,
    notes: txt.max(1000).default(''),
    groupKey: txt.max(60).nullable().optional(),
    sets: z.array(setInput).min(1).max(30),
  })
  .strict();
export const workoutInput = z
  .object({
    objective: txt.max(1000).default(''),
    notes: txt.max(3000).default(''),
    validFrom: z.iso.datetime().nullable().optional(),
    validUntil: z.iso.datetime().nullable().optional(),
    days: z
      .array(
        z
          .object({
            name: txt.min(1).max(100),
            notes: txt.max(1000).default(''),
            suggestedDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
            exercises: z.array(exerciseInput).min(1).max(60),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine((v) => !v.validFrom || !v.validUntil || v.validFrom <= v.validUntil, 'Período inválido.');
const ordered = {
  days: {
    orderBy: { position: 'asc' as const },
    include: {
      exercises: {
        orderBy: { position: 'asc' as const },
        include: { sets: { orderBy: { position: 'asc' as const } } },
      },
    },
  },
};
const sessionIncludes = {
  version: { include: { program: true } },
  day: {
    include: {
      exercises: {
        orderBy: { position: 'asc' as const },
        include: { sets: { orderBy: { position: 'asc' as const } } },
      },
    },
  },
  exercises: { include: { sets: true } },
  feedbackReplies: { orderBy: { createdAt: 'asc' as const } },
};
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
const conflict = () =>
  new HttpError(409, 'Registro alterado em outra conexão. Recarregue para continuar.');
export async function workoutGet(db: PrismaClient, user: User, path: string, req: NextRequest) {
  const parts = path.split('/');
  if (path === 'workouts') {
    const own = await db.workoutProgram.findMany({
      where: { authorId: user.id },
      include: { versions: { orderBy: { number: 'desc' }, include: ordered } },
      orderBy: { createdAt: 'desc' },
    });
    const assigned =
      user.role === 'STUDENT'
        ? await db.workoutAssignment.findMany({
            where: { studentId: user.id },
            include: { version: { include: { ...ordered, program: true } } },
          })
        : [];
    const available = [];
    for (const a of assigned) {
      if (
        a.version.program.authorId === user.id ||
        (await canAccessStudent(db, a.version.program.authorId, user.id, 'TRAINING'))
      )
        available.push(a);
    }
    const links =
      user.role === 'PROFESSIONAL'
        ? await db.professionalStudentLink.findMany({
            where: {
              professionalId: user.id,
              area: 'TRAINING',
              status: 'ACTIVE',
              consents: { some: { scope: 'TRAINING_HISTORY', revokedAt: null } },
            },
            include: { student: { select: { id: true, profile: { select: { name: true } } } } },
          })
        : [];
    const enabled =
      user.role === 'STUDENT' ||
      !!(await db.professionalCredential.findFirst({
        where: { professionalId: user.id, area: 'TRAINING', status: 'VERIFIED' },
      }));
    const now = new Date();
    const effective = available.filter(
      (a) =>
        (!a.version.validFrom || a.version.validFrom <= now) &&
        (!a.version.validUntil || a.version.validUntil >= now),
    );
    const latest = effective.filter(
      (a) =>
        !effective.some(
          (b) => b.version.programId === a.version.programId && b.version.number > a.version.number,
        ),
    );
    return json({
      own,
      assigned: latest,
      archived: assigned.filter((a) => !latest.some((b) => b.id === a.id)),
      students: links.map((l) => l.student),
      enabled,
      role: user.role,
    });
  }
  if (path.startsWith('workouts/version/')) {
    const version = await db.workoutVersion.findUnique({
      where: { id: parts[2] },
      include: { ...ordered, program: true, assignments: { where: { studentId: user.id } } },
    });
    if (
      !version ||
      (version.program.authorId !== user.id &&
        !(user.role === 'STUDENT' && version.publishedAt && version.assignments.length))
    )
      throw new HttpError(404, 'Ficha não encontrada.');
    return json(version);
  }
  if (path === 'sessions') {
    const studentId = req.nextUrl.searchParams.get('studentId') ?? user.id;
    await studentAccess(db, user, studentId, 'TRAINING');
    return json(
      await db.workoutSession.findMany({
        where: { studentId },
        include: {
          day: { select: { name: true } },
          version: { select: { number: true, program: { select: { name: true } } } },
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    );
  }
  if (path.startsWith('sessions/')) {
    const session = await db.workoutSession.findUnique({
      where: { id: parts[1] },
      include: sessionIncludes,
    });
    if (!session) throw new HttpError(404, 'Sessão não encontrada.');
    await studentAccess(db, user, session.studentId, 'TRAINING');
    const previous = await db.workoutSessionExercise.findMany({
      where: {
        session: { studentId: session.studentId, status: 'COMPLETED', id: { not: session.id } },
        OR: [
          {
            substituteId: null,
            prescription: { exerciseId: { in: session.day.exercises.map((e) => e.exerciseId) } },
          },
          { substituteId: { in: session.day.exercises.map((e) => e.exerciseId) } },
        ],
      },
      include: {
        prescription: true,
        sets: { where: { completedAt: { not: null } }, include: { prescription: true } },
        session: { select: { endedAt: true } },
      },
      orderBy: { session: { endedAt: 'desc' } },
      take: 100,
    });
    return json({ ...session, previous });
  }
  if (path === 'progress') {
    const studentId = req.nextUrl.searchParams.get('studentId') ?? user.id;
    await studentAccess(db, user, studentId, 'TRAINING');
    const filter = req.nextUrl.searchParams.get('exerciseId');
    const entries = await db.workoutSession.findMany({
      where: { studentId, status: 'COMPLETED' },
      include: {
        exercises: {
          where: filter
            ? { OR: [{ prescription: { exerciseId: filter } }, { substituteId: filter }] }
            : {},
          include: { prescription: true, sets: { where: { completedAt: { not: null } } } },
        },
      },
      orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
    return json(
      entries.reverse().map((s) => ({
        id: s.id,
        date: s.endedAt,
        durationSeconds: s.endedAt
          ? Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000))
          : 0,
        exercises: s.exercises
          .filter((e) => e.status !== 'SKIPPED')
          .map((e) => ({
            exerciseId: e.substituteId ?? e.prescription.exerciseId,
            snapshot: e.substituteSnapshot ?? e.prescription.snapshot,
            sets: e.sets.map((set) => ({
              reps: set.actualReps,
              kg: set.actualKg,
              seconds: set.actualSeconds,
            })),
            volume: e.sets.reduce(
              (sum, set) => sum + (set.actualReps ?? 0) * Number(set.actualKg ?? 0),
              0,
            ),
          })),
      })),
    );
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
async function dayData(db: PrismaClient, user: User, data: z.infer<typeof workoutInput>) {
  const available = await db.exercise.findMany({
    where: {
      id: { in: [...new Set(data.days.flatMap((day) => day.exercises.map((e) => e.exerciseId)))] },
      active: true,
      OR: [{ source: 'WGER' }, { source: 'CUSTOM', ownerId: user.id }],
    },
  });
  const byId = new Map(available.map((source) => [source.id, source]));
  const days = [];
  for (const [position, day] of data.days.entries()) {
    const exercises = [];
    for (const [index, e] of day.exercises.entries()) {
      const source = byId.get(e.exerciseId);
      if (!source) throw new HttpError(400, 'Exercício indisponível para este autor.');
      exercises.push({
        exerciseId: source.id,
        position: index,
        notes: e.notes,
        groupKey: e.groupKey,
        snapshot: {
          name: source.name,
          instructions: source.instructions,
          provenance: source.provenance,
        } as Prisma.InputJsonValue,
        sets: { create: e.sets.map((s, position) => ({ ...s, position })) },
      });
    }
    days.push({
      name: day.name,
      notes: day.notes,
      suggestedDays: day.suggestedDays,
      position,
      exercises: { create: exercises },
    });
  }
  return days;
}
export async function workoutPost(db: PrismaClient, user: User, path: string, body: unknown) {
  const parts = path.split('/');
  if (path === 'workouts/create') {
    await authorship(db, user, 'TRAINING');
    const { name, template } = z
      .object({ name: txt.min(2).max(150), template: z.boolean().default(false) })
      .strict()
      .parse(body);
    const program = await db.workoutProgram.create({
      data: { authorId: user.id, name, template, versions: { create: { number: 1 } } },
      include: { versions: true },
    });
    return json({
      message: 'Programa criado.',
      programId: program.id,
      versionId: program.versions[0].id,
    });
  }
  if (parts[0] === 'workouts' && parts.length === 3) {
    await authorship(db, user, 'TRAINING');
    const version = await db.workoutVersion.findUnique({
      where: { id: parts[1] },
      include: { program: true, ...ordered },
    });
    if (!version || version.program.authorId !== user.id)
      throw new HttpError(404, 'Rascunho não encontrado.');
    if (parts[2] === 'save') {
      if (version.publishedAt)
        throw new HttpError(409, 'Ficha publicada é imutável. Crie uma revisão.');
      const { revision, data } = z
        .object({ revision: z.number().int().min(0), data: workoutInput })
        .strict()
        .parse(body);
      const days = await dayData(db, user, data);
      await db.$transaction(async (tx) => {
        const changed = await tx.workoutVersion.updateMany({
          where: { id: version.id, publishedAt: null, draftRevision: revision },
          data: {
            draftRevision: { increment: 1 },
            objective: data.objective,
            notes: data.notes,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
          },
        });
        if (!changed.count) throw conflict();
        await tx.workoutDay.deleteMany({ where: { versionId: version.id } });
        await tx.workoutVersion.update({
          where: { id: version.id },
          data: { days: { create: days } },
        });
      });
      return json({ message: 'Rascunho salvo.', revision: revision + 1 });
    }
    if (parts[2] === 'publish') {
      const { studentIds, revision } = z
        .object({ studentIds: z.array(id).max(100).default([]), revision: z.number().int().min(0) })
        .strict()
        .parse(body);
      if (!version.days.length || version.days.some((d) => !d.exercises.length))
        throw new HttpError(400, 'Adicione exercícios antes de publicar.');
      const targets = user.role === 'STUDENT' ? [user.id] : [...new Set(studentIds)];
      await assignmentTargets(db, user, targets, 'TRAINING');
      await db.$transaction(async (tx) => {
        const changed = await tx.workoutVersion.updateMany({
          where: { id: version.id, publishedAt: null, draftRevision: revision },
          data: { publishedAt: new Date() },
        });
        if (!changed.count) throw conflict();
        for (const studentId of targets)
          await tx.workoutAssignment.create({ data: { versionId: version.id, studentId } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'WORKOUT_PUBLISHED', resourceId: version.id },
        });
      });
      return json({ message: 'Ficha publicada com histórico preservado.' });
    }
    if (parts[2] === 'revise' || parts[2] === 'duplicate') {
      z.object({}).strict().parse(body);
      const result = await db.$transaction(async (tx) => {
        const last = await tx.workoutVersion.findFirst({
          where: { programId: version.programId },
          orderBy: { number: 'desc' },
        });
        let programId = version.programId;
        let number = (last?.number ?? 0) + 1;
        if (parts[2] === 'duplicate') {
          const program = await tx.workoutProgram.create({
            data: {
              authorId: user.id,
              name: `${version.program.name} (cópia)`,
              template: version.program.template,
            },
          });
          programId = program.id;
          number = 1;
        }
        const copiedDays = version.days.map((d) => ({
          name: d.name,
          notes: d.notes,
          suggestedDays: d.suggestedDays,
          position: d.position,
          exercises: {
            create: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              snapshot: e.snapshot as Prisma.InputJsonValue,
              notes: e.notes,
              groupKey: e.groupKey,
              position: e.position,
              sets: {
                create: e.sets.map((s) => ({
                  position: s.position,
                  repsMin: s.repsMin,
                  repsMax: s.repsMax,
                  targetKg: s.targetKg,
                  durationSeconds: s.durationSeconds,
                  restSeconds: s.restSeconds,
                  kind: s.kind,
                  cadence: s.cadence,
                  rpe: s.rpe,
                  rir: s.rir,
                  unilateral: s.unilateral,
                  technique: s.technique,
                })),
              },
            })),
          },
        }));
        return tx.workoutVersion.create({
          data: {
            programId,
            number,
            objective: version.objective,
            notes: version.notes,
            validFrom: version.validFrom,
            validUntil: version.validUntil,
            days: { create: copiedDays },
          },
        });
      });
      return json({ message: 'Nova cópia em rascunho.', versionId: result.id });
    }
  }
  if (path === 'sessions/start') {
    if (user.role !== 'STUDENT') throw new HttpError(403, 'Sessões são executadas pelo aluno.');
    const data = z.object({ id: z.uuid(), dayId: id }).strict().parse(body);
    const existing = await db.workoutSession.findUnique({ where: { id: data.id } });
    if (existing) {
      if (existing.studentId !== user.id || existing.dayId !== data.dayId) throw conflict();
      return json(existing);
    }
    const day = await db.workoutDay.findUnique({
      where: { id: data.dayId },
      include: {
        version: { include: { program: true, assignments: { where: { studentId: user.id } } } },
        exercises: true,
      },
    });
    if (!day?.version.publishedAt || !day.version.assignments.length)
      throw new HttpError(404, 'Treino não atribuído.');
    if (
      day.version.program.authorId !== user.id &&
      !(await canAccessStudent(db, day.version.program.authorId, user.id, 'TRAINING'))
    )
      throw new HttpError(403, 'Vínculo encerrado ou habilitação indisponível.');
    if (
      (day.version.validFrom && day.version.validFrom > new Date()) ||
      (day.version.validUntil && day.version.validUntil < new Date())
    )
      throw new HttpError(409, 'Treino fora do período de validade.');
    const newer = await db.workoutAssignment.findFirst({
      where: {
        studentId: user.id,
        version: {
          programId: day.version.programId,
          number: { gt: day.version.number },
          publishedAt: { not: null },
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
          ],
        },
      },
    });
    if (newer)
      throw new HttpError(
        409,
        'Existe uma versão mais recente desta ficha. Consulte o treino atual.',
      );
    const active = await db.workoutSession.findFirst({
      where: { studentId: user.id, status: 'IN_PROGRESS' },
    });
    if (active) return json({ ...active, message: 'Recupere sua sessão em andamento.' });
    try {
      return json(
        await db.workoutSession.create({
          data: {
            id: data.id,
            studentId: user.id,
            versionId: day.versionId,
            dayId: day.id,
            exercises: { create: day.exercises.map((e) => ({ prescriptionExerciseId: e.id })) },
          },
        }),
      );
    } catch (e) {
      const raced = await db.workoutSession.findFirst({
        where: { studentId: user.id, status: 'IN_PROGRESS' },
      });
      if (raced) return json(raced);
      throw e;
    }
  }
  if (parts[0] === 'sessions' && parts.length === 3) {
    const session = await db.workoutSession.findUnique({
      where: { id: parts[1] },
      include: sessionIncludes,
    });
    if (!session) throw new HttpError(404, 'Sessão não encontrada.');
    if (parts[2] === 'reply') {
      await studentAccess(db, user, session.studentId, 'TRAINING');
      await professional(db, user, 'TRAINING');
      const { text } = z
        .object({ text: txt.min(1).max(2000) })
        .strict()
        .parse(body);
      await db.workoutReply.create({ data: { sessionId: session.id, authorId: user.id, text } });
      return json({ message: 'Orientação enviada.' });
    }
    if (user.id !== session.studentId || user.role !== 'STUDENT')
      throw new HttpError(403, 'Somente o aluno pode registrar sua sessão.');
    if (parts[2] === 'sets') {
      const data = z
        .object({
          revision: z.number().int().min(0),
          prescriptionSetId: id,
          actualReps: int.nullable().optional(),
          actualKg: kg,
          actualSeconds: int.nullable().optional(),
          rpe: z.number().min(0).max(10).nullable().optional(),
          rir: z.number().int().min(0).max(20).nullable().optional(),
          completed: z.boolean(),
        })
        .strict()
        .parse(body);
      const prescribed = session.day.exercises.find((e) =>
        e.sets.some((s) => s.id === data.prescriptionSetId),
      );
      const executed = session.exercises.find((e) => e.prescriptionExerciseId === prescribed?.id);
      if (!executed) throw new HttpError(400, 'Série não pertence à sessão.');
      const { revision, prescriptionSetId, completed, ...values } = data;
      if (completed && values.actualReps == null && values.actualSeconds == null)
        throw new HttpError(400, 'Informe repetições ou duração executada.');
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.workoutSession.updateMany({
              where: { id: session.id, status: 'IN_PROGRESS', revision },
              data: { revision: { increment: 1 } },
            })
          ).count
        )
          throw conflict();
        await tx.workoutSessionExercise.update({
          where: { id: executed.id },
          data: { status: 'EXECUTED' },
        });
        await tx.workoutSessionSet.upsert({
          where: {
            sessionExerciseId_prescriptionSetId: {
              sessionExerciseId: executed.id,
              prescriptionSetId,
            },
          },
          create: {
            sessionExerciseId: executed.id,
            prescriptionSetId,
            ...values,
            completedAt: completed ? new Date() : null,
          },
          update: { ...values, completedAt: completed ? new Date() : null },
        });
      });
      return json({ message: 'Série salva.', revision: revision + 1 });
    }
    if (parts[2] === 'exercise') {
      const data = z
        .object({
          revision: z.number().int().min(0),
          prescriptionExerciseId: id,
          status: z.enum(['PLANNED', 'SKIPPED', 'SUBSTITUTED']),
          substituteId: id.nullable().optional(),
          notes: txt.max(1000).default(''),
        })
        .strict()
        .parse(body);
      const executed = session.exercises.find(
        (e) => e.prescriptionExerciseId === data.prescriptionExerciseId,
      );
      if (!executed) throw new HttpError(400, 'Exercício inválido.');
      const substitute =
        data.status === 'SUBSTITUTED'
          ? await db.exercise.findFirst({
              where: { id: data.substituteId ?? '', active: true, source: 'WGER' },
            })
          : null;
      if (data.status === 'SUBSTITUTED' && !substitute)
        throw new HttpError(400, 'Selecione uma substituição do catálogo global.');
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.workoutSession.updateMany({
              where: { id: session.id, status: 'IN_PROGRESS', revision: data.revision },
              data: { revision: { increment: 1 } },
            })
          ).count
        )
          throw conflict();
        await tx.workoutSessionExercise.update({
          where: { id: executed.id },
          data: {
            status: data.status,
            notes: data.notes,
            substituteId: substitute?.id ?? null,
            substituteSnapshot: substitute
              ? ({
                  name: substitute.name,
                  instructions: substitute.instructions,
                  provenance: substitute.provenance,
                } as Prisma.InputJsonValue)
              : undefined,
          },
        });
      });
      return json({ message: 'Exercício atualizado.', revision: data.revision + 1 });
    }
    if (parts[2] === 'finish') {
      const data = z
        .object({
          revision: z.number().int().min(0),
          status: z.enum(['COMPLETED', 'INTERRUPTED']),
          effort: z.number().int().min(1).max(10).nullable().optional(),
          difficulty: z.number().int().min(1).max(10).nullable().optional(),
          feedback: txt.max(3000).default(''),
          discomfort: txt.max(1000).default(''),
          technicalDifficulty: z.boolean().default(false),
          rating: z.number().int().min(1).max(5).nullable().optional(),
        })
        .strict()
        .parse(body);
      if (session.status !== 'IN_PROGRESS') {
        if (session.status === data.status) return json({ message: 'Sessão já encerrada.' });
        throw conflict();
      }
      if (
        data.status === 'COMPLETED' &&
        !session.exercises.some((e) => e.status !== 'SKIPPED' && e.sets.some((s) => s.completedAt))
      )
        throw new HttpError(400, 'Registre uma série antes de concluir.');
      const { revision, ...values } = data;
      const endedAt = new Date();
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.workoutSession.updateMany({
              where: { id: session.id, status: 'IN_PROGRESS', revision },
              data: { ...values, endedAt, revision: { increment: 1 } },
            })
          ).count
        )
          throw conflict();
        if (data.status === 'COMPLETED')
          await tx.activityOutbox.create({
            data: {
              id: crypto.randomUUID(),
              sessionId: session.id,
              payload: {
                userId: user.id,
                sessionId: session.id,
                type: 'TRAINING',
                date: endedAt.toISOString(),
                durationSeconds: Math.round(
                  (endedAt.getTime() - session.startedAt.getTime()) / 1000,
                ),
                status: 'COMPLETED',
              },
            },
          });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'WORKOUT_SESSION_FINISHED', resourceId: session.id },
        });
      });
      return json({ message: 'Sessão encerrada. Histórico preservado.' });
    }
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
