import type { Prisma, PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './admin-permissions';
import { HttpError } from './http-error';
import { importExercises, normalizeSearch, snapshot } from './exercise-import';
const category = z.enum(['STRENGTH', 'CARDIO', 'MOBILITY', 'OTHER']);
const text = z.string().trim();
const input = z
  .object({
    name: text.min(2).max(150),
    aliases: z.array(text.min(1).max(150)).max(20).default([]),
    description: text.max(4000).default(''),
    instructions: text.max(6000).default(''),
    category: category.default('OTHER'),
    movementType: text.max(120).nullable().optional(),
    technicalLevel: text.max(120).nullable().optional(),
    muscleIds: z.array(text.min(1).max(40)).max(20).default([]),
    secondaryMuscleIds: z.array(text.min(1).max(40)).max(20).default([]),
    equipmentIds: z.array(text.min(1).max(40)).max(20).default([]),
  })
  .strict();
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
function visibility(user: User, includeInactive = false): Prisma.ExerciseWhereInput {
  return {
    OR: [
      { source: 'WGER', ...(user.role === 'ADMIN' && includeInactive ? {} : { active: true }) },
      { source: 'CUSTOM', ownerId: user.id, ...(includeInactive ? {} : { active: true }) },
    ],
  };
}
const relations = (userId: string) => ({
  muscles: { include: { muscle: true } },
  equipment: { include: { equipment: true } },
  favorites: { where: { userId }, select: { userId: true } },
});
async function trainer(db: PrismaClient, user: User) {
  if (
    user.role !== 'PROFESSIONAL' ||
    !(await db.professionalCredential.findFirst({
      where: { professionalId: user.id, area: 'TRAINING', status: 'VERIFIED' },
    }))
  )
    throw new HttpError(403, 'Uma habilitação de treinamento verificada é necessária.');
}
export async function exerciseGet(db: PrismaClient, user: User, path: string, req: NextRequest) {
  if (path === 'exercises/meta') {
    const [muscles, equipment] = await Promise.all([
      db.muscle.findMany({ orderBy: { name: 'asc' } }),
      db.equipment.findMany({ orderBy: { name: 'asc' } }),
    ]);
    const trainerEnabled =
      user.role === 'PROFESSIONAL' &&
      !!(await db.professionalCredential.findFirst({
        where: { professionalId: user.id, area: 'TRAINING', status: 'VERIFIED' },
      }));
    return json({
      muscles,
      equipment,
      trainerEnabled,
      snapshot,
      jobs:
        user.role === 'ADMIN'
          ? await db.exerciseImportJob.findMany({ orderBy: { startedAt: 'desc' }, take: 10 })
          : undefined,
    });
  }
  if (path === 'exercises') {
    const params = z
      .object({
        q: text.max(100).default(''),
        muscle: text.max(40).optional(),
        equipment: text.max(40).optional(),
        category: category.optional(),
        favorite: z.enum(['true', 'false']).optional(),
        includeInactive: z.enum(['true', 'false']).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const where: Prisma.ExerciseWhereInput = {
      AND: [visibility(user, params.includeInactive === 'true')],
      ...(params.q ? { searchText: { contains: normalizeSearch(params.q) } } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.muscle ? { muscles: { some: { muscleId: params.muscle } } } : {}),
      ...(params.equipment ? { equipment: { some: { equipmentId: params.equipment } } } : {}),
      ...(params.favorite === 'true' ? { favorites: { some: { userId: user.id } } } : {}),
    };
    const [items, total] = await Promise.all([
      db.exercise.findMany({
        where,
        include: relations(user.id),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (params.page - 1) * 20,
        take: 20,
      }),
      db.exercise.count({ where }),
    ]);
    return json({ items, total, page: params.page, pages: Math.ceil(total / 20) });
  }
  const id = path.split('/')[1];
  if (path.split('/').length !== 2) throw new HttpError(404, 'Recurso não encontrado.');
  const exercise = await db.exercise.findFirst({
    where: { id, AND: [visibility(user, true)] },
    include: relations(user.id),
  });
  if (!exercise) throw new HttpError(404, 'Exercício não encontrado.');
  return json(exercise);
}
export async function exercisePost(db: PrismaClient, user: User, path: string, body: unknown) {
  if (path === 'admin/import-exercises') {
    requireAdmin(user, 'MANAGE_CATALOG');
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(body);
    return json({
      message: 'Catálogo sincronizado com o snapshot oficial.',
      result: await importExercises(db, user.id),
    });
  }
  if (path === 'exercises/create') {
    await trainer(db, user);
    const data = input.parse(body);
    await taxonomy(db, data);
    const { muscleIds, secondaryMuscleIds, equipmentIds, ...fields } = data;
    const exercise = await db.$transaction(async (tx) => {
      const exercise = await tx.exercise.create({
        data: {
          ...fields,
          source: 'CUSTOM',
          ownerId: user.id,
          provenance: { source: 'Cadastro personalizado', author: user.id },
          searchText: normalizeSearch([fields.name, ...fields.aliases].join(' ')),
          muscles: {
            create: [
              ...muscleIds.map((muscleId) => ({ muscleId, role: 'PRIMARY' as const })),
              ...secondaryMuscleIds.map((muscleId) => ({ muscleId, role: 'SECONDARY' as const })),
            ],
          },
          equipment: { create: equipmentIds.map((equipmentId) => ({ equipmentId })) },
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'CUSTOM_EXERCISE_CREATED', resourceId: exercise.id },
      });
      return exercise;
    });
    return json({ message: 'Exercício personalizado criado.', id: exercise.id });
  }
  const parts = path.split('/');
  if (parts.length !== 3) throw new HttpError(404, 'Recurso não encontrado.');
  const [, id, action] = parts;
  const exercise = await db.exercise.findFirst({ where: { id, AND: [visibility(user, true)] } });
  if (!exercise) throw new HttpError(404, 'Exercício não encontrado.');
  if (action === 'favorite') {
    const { favorite } = z.object({ favorite: z.boolean() }).strict().parse(body);
    if (!exercise.active) throw new HttpError(409, 'Exercício desativado.');
    if (favorite)
      await db.exerciseFavorite.upsert({
        where: { userId_exerciseId: { userId: user.id, exerciseId: id } },
        create: { userId: user.id, exerciseId: id },
        update: {},
      });
    else await db.exerciseFavorite.deleteMany({ where: { userId: user.id, exerciseId: id } });
    return json({ message: favorite ? 'Exercício favoritado.' : 'Favorito removido.' });
  }
  if (exercise.source === 'CUSTOM') {
    await trainer(db, user);
    if (exercise.ownerId !== user.id) throw new HttpError(403, 'Exercício de outro profissional.');
  } else requireAdmin(user, 'MANAGE_CATALOG');
  if (action === 'status') {
    const { active } = z.object({ active: z.boolean() }).strict().parse(body);
    await db.$transaction(async (tx) => {
      await tx.exercise.update({ where: { id }, data: { active } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: active ? 'EXERCISE_ACTIVATED' : 'EXERCISE_DEACTIVATED',
          resourceId: id,
        },
      });
    });
    return json({ message: active ? 'Exercício ativado.' : 'Exercício desativado.' });
  }
  if (action === 'update') {
    if (exercise.source !== 'CUSTOM')
      throw new HttpError(403, 'Crie um exercício personalizado para complementar a fonte global.');
    const data = input.parse(body);
    await taxonomy(db, data);
    const { muscleIds, secondaryMuscleIds, equipmentIds, ...fields } = data;
    await db.$transaction(async (tx) => {
      await tx.exerciseMuscle.deleteMany({ where: { exerciseId: id } });
      await tx.exerciseEquipment.deleteMany({ where: { exerciseId: id } });
      await tx.exercise.update({
        where: { id },
        data: {
          ...fields,
          searchText: normalizeSearch([fields.name, ...fields.aliases].join(' ')),
          muscles: {
            create: [
              ...muscleIds.map((muscleId) => ({ muscleId, role: 'PRIMARY' as const })),
              ...secondaryMuscleIds.map((muscleId) => ({ muscleId, role: 'SECONDARY' as const })),
            ],
          },
          equipment: { create: equipmentIds.map((equipmentId) => ({ equipmentId })) },
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'CUSTOM_EXERCISE_UPDATED', resourceId: id },
      });
    });
    return json({ message: 'Exercício atualizado.' });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
async function taxonomy(db: PrismaClient, data: z.infer<typeof input>) {
  const muscles = [...data.muscleIds, ...data.secondaryMuscleIds];
  const equipment = data.equipmentIds;
  if (new Set(muscles).size !== muscles.length || new Set(equipment).size !== equipment.length)
    throw new HttpError(400, 'Seleções duplicadas.');
  if (
    (await db.muscle.count({ where: { id: { in: muscles } } })) !== muscles.length ||
    (await db.equipment.count({ where: { id: { in: equipment } } })) !== equipment.length
  )
    throw new HttpError(400, 'Músculo ou equipamento inválido.');
}
