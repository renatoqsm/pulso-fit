import type { PrismaClient } from '@prisma/client';
import dataset from '../../data/wger/catalog.json';
import { digest } from './crypto';
import { normalizeSearch } from './search-normalize';
export const snapshot = {
  revision: dataset.revision,
  count: dataset.exercises.length,
  notes: dataset.notes,
};
export { normalizeSearch } from './search-normalize';
export async function importExercises(db: PrismaClient, actorId?: string) {
  const job = await db.exerciseImportJob.create({
    data: {
      source: 'WGER',
      revision: dataset.revision,
      status: 'RUNNING',
      notes: dataset.notes,
      skipped: dataset.skipped.length,
    },
  });
  try {
    const counts = await db.$transaction(
      async (tx) => {
        const currentMuscles = new Map(
          (await tx.muscle.findMany()).map((value) => [value.id, value]),
        );
        const currentEquipment = new Map(
          (await tx.equipment.findMany()).map((value) => [value.id, value]),
        );
        await tx.exerciseImportJob.findUnique({ where: { id: job.id } });
        await tx.exercise.findMany({ where: { source: 'WGER' } });
        await tx.exerciseMuscle.findMany();
        await tx.exerciseEquipment.findMany();

        for (const [id, m] of Object.entries(dataset.muscles))
          if (
            currentMuscles.get(id)?.name !== m.name ||
            currentMuscles.get(id)?.alternateName !== m.name_en
          )
            await tx.muscle.upsert({
              where: { id },
              create: { id, name: m.name, alternateName: m.name_en },
              update: { name: m.name, alternateName: m.name_en },
            });
        for (const [id, e] of Object.entries(dataset.equipment))
          if (currentEquipment.get(id)?.name !== e.name)
            await tx.equipment.upsert({
              where: { id },
              create: { id, name: e.name },
              update: { name: e.name },
            });
        const counts = { imported: 0, updated: 0, unchanged: 0 };
        for (const item of dataset.exercises) {
          const hash = await digest(JSON.stringify(item));
          const existing = await tx.exercise.findUnique({
            where: { source_externalId: { source: 'WGER', externalId: item.externalId } },
          });
          if (existing?.contentHash === hash) {
            counts.unchanged++;
            continue;
          }
          const data = {
            name: item.name,
            aliases: item.aliases,
            description: item.description,
            instructions: item.instructions ?? item.description,
            searchText: normalizeSearch([item.name, ...item.aliases].join(' ')),
            sourceCategory: item.sourceCategory,
            provenance: item.provenance,
            contentHash: hash,
            sourceRevision: dataset.revision,
          };
          const exercise = await tx.exercise.upsert({
            where: { source_externalId: { source: 'WGER', externalId: item.externalId } },
            create: {
              id: 'wger-' + item.externalId,
              ...data,
              source: 'WGER',
              externalId: item.externalId,
            },
            update: data,
          });
          await tx.exerciseMuscle.deleteMany({ where: { exerciseId: exercise.id } });
          await tx.exerciseEquipment.deleteMany({ where: { exerciseId: exercise.id } });
          const muscles = [
            ...item.primaryMuscles.map((muscleId) => ({
              exerciseId: exercise.id,
              muscleId,
              role: 'PRIMARY' as const,
            })),
            ...item.secondaryMuscles.map((muscleId) => ({
              exerciseId: exercise.id,
              muscleId,
              role: 'SECONDARY' as const,
            })),
          ];
          if (muscles.length)
            await tx.exerciseMuscle.createMany({ data: muscles, skipDuplicates: true });
          if (item.equipment.length)
            await tx.exerciseEquipment.createMany({
              data: item.equipment.map((equipmentId) => ({ exerciseId: exercise.id, equipmentId })),
              skipDuplicates: true,
            });
          if (existing) counts.updated++;
          else counts.imported++;
        }
        await tx.exerciseImportJob.update({
          where: { id: job.id },
          data: { ...counts, status: 'SUCCESS', finishedAt: new Date() },
        });
        if (actorId)
          await tx.auditLog.create({
            data: { actorId, action: 'EXERCISES_IMPORTED', resourceId: job.id },
          });
        return counts;
      },
      { timeout: 60_000, maxWait: 60_000 },
    );
    return {
      ...counts,
      jobId: job.id,
      revision: dataset.revision,
      total: dataset.exercises.length,
    };
  } catch (error) {
    await db.exerciseImportJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        notes: ['Falha na importação; transação revertida.'],
      },
    });
    throw error;
  }
}
