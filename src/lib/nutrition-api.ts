import { assignmentTargets } from './workflow-access';
import Decimal from 'decimal.js';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { HttpError } from './http-error';
import { authorship, studentAccess, professional } from './workflow-access';
import { canAccessStudent } from './access';
import { normalizeSearch } from './search-normalize';
import {
  scaleNutrients,
  totalNutrients,
  macroDistribution,
  differenceNutrients,
  type Nutrients,
} from './nutrition-math';
const txt = z.string().trim();
const id = txt.min(1).max(100);
const quantity = z
  .union([z.string().regex(/^\d+(\.\d{1,8})?$/), z.number().finite().min(0)])
  .transform(String)
  .refine((v) => new Decimal(v).gte(0) && new Decimal(v).lte(1000000));
const unit = z.enum(['g', 'ml']);
const nutrientKey = z.string().regex(/^[a-z][a-z0-9_]*_(g|mg|ug|kcal)$/);
const nutrients = z
  .record(nutrientKey, quantity.nullable())
  .refine((v) => Object.keys(v).length <= 100);
const foodInput = z
  .object({
    name: txt.min(2).max(200),
    aliases: z.array(txt.max(150)).max(20).default([]),
    preparation: txt.max(200).default(''),
    referenceUnit: unit,
    nutrients,
    provenance: txt.min(3).max(1000),
    measures: z
      .array(
        z
          .object({ name: txt.min(1).max(80), quantity, unit, provenance: txt.min(3).max(500) })
          .strict(),
      )
      .max(30)
      .default([]),
  })
  .strict();
const item = z.object({ foodId: id, quantity, unit, measureId: id.optional() }).strict();
const planInput = z
  .object({
    objective: txt.max(1000).default(''),
    notes: txt.max(3000).default(''),
    validFrom: z.iso.datetime().nullable().optional(),
    meals: z
      .array(
        z
          .object({
            name: txt.min(1).max(100),
            time: txt
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
              .nullable()
              .optional(),
            notes: txt.max(1000).default(''),
            items: z
              .array(item.extend({ substitutions: z.array(item).max(20).default([]) }))
              .min(1)
              .max(40),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();
const ordered = {
  meals: {
    orderBy: { position: 'asc' as const },
    include: { items: { orderBy: { position: 'asc' as const } } },
  },
};
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
const foodWhere = (user: User, active = true): Prisma.FoodWhereInput => ({
  ...(active ? { active: true } : {}),
  OR: [{ ownerId: null }, { ownerId: user.id }],
});
type AvailableFood = Prisma.FoodGetPayload<{ include: { measures: true } }>;
async function foodCatalog(db: PrismaClient, user: User, items: { foodId: string }[]) {
  const foods = await db.food.findMany({
    where: { ...foodWhere(user), id: { in: [...new Set(items.map((i) => i.foodId))] } },
    include: { measures: true },
  });
  return new Map(foods.map((f) => [f.id, f]));
}
async function resolveItem(
  db: PrismaClient,
  user: User,
  data: z.infer<typeof item>,
  allowedSnapshots: unknown[] = [],
  catalog?: Map<string, AvailableFood>,
) {
  const food = catalog
    ? catalog.get(data.foodId)
    : await db.food.findFirst({
        where: { id: data.foodId, ...foodWhere(user) },
        include: { measures: true },
      });
  // Assigned plans allow their exact private-food snapshots in the patient's diary.
  const allowed = allowedSnapshots.find(
    (v) => !!v && typeof v === 'object' && 'foodId' in v && v.foodId === data.foodId,
  ) as
    | {
        foodId: string;
        name: string;
        referenceUnit: string;
        nutrients: Nutrients;
        provenance: Prisma.JsonValue;
      }
    | undefined;
  if (!food && !allowed) throw new HttpError(400, 'Alimento indisponível.');
  const source = food ?? allowed!;
  let selectedMeasure:
    { id: string; name: string; quantity: string; unit: string; provenance: string } | undefined;
  let resolvedQuantity = new Decimal(data.quantity);
  let resolvedUnit = data.unit;
  if (data.measureId) {
    const measure = food?.measures.find((m) => m.id === data.measureId);
    if (!measure) throw new HttpError(400, 'Medida caseira sem equivalência para este alimento.');
    selectedMeasure = {
      id: measure.id,
      name: measure.name,
      quantity: measure.quantity.toString(),
      unit: measure.unit,
      provenance: measure.provenance,
    };
    resolvedQuantity = resolvedQuantity.mul(measure.quantity.toString());
    resolvedUnit = measure.unit as 'g' | 'ml';
  }
  if (resolvedUnit !== source.referenceUnit)
    throw new HttpError(400, 'Massa e volume não podem ser convertidos sem densidade conhecida.');
  if (
    resolvedQuantity.lte(0) ||
    resolvedQuantity.gt(1000000) ||
    resolvedQuantity.decimalPlaces() > 4
  )
    throw new HttpError(400, 'Informe uma quantidade positiva.');
  return {
    foodId: data.foodId,
    quantity: resolvedQuantity.toString(),
    unit: resolvedUnit,
    snapshot: {
      foodId: data.foodId,
      name: source.name,
      referenceUnit: source.referenceUnit,
      nutrients: source.nutrients,
      provenance: source.provenance,
      measure: selectedMeasure
        ? { ...selectedMeasure, enteredQuantity: String(data.quantity) }
        : null,
    } as Prisma.InputJsonValue,
  };
}
const itemTotals = (v: { quantity: Decimal; snapshot: Prisma.JsonValue }) =>
  scaleNutrients((v.snapshot as { nutrients: Nutrients }).nutrients, v.quantity.toString());
export async function nutritionGet(db: PrismaClient, user: User, path: string, req: NextRequest) {
  const parts = path.split('/');
  if (path === 'foods') {
    const params = z
      .object({
        q: txt.max(100).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      ...foodWhere(user),
      ...(params.q ? { searchText: { contains: normalizeSearch(params.q) } } : {}),
    };
    const [items, total] = await Promise.all([
      db.food.findMany({
        where,
        include: { measures: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 30,
        skip: (params.page - 1) * 30,
      }),
      db.food.count({ where }),
    ]);
    return json({ items, total, page: params.page });
  }
  if (path === 'nutrition') {
    const own = await db.nutritionPlan.findMany({
      where: { authorId: user.id },
      include: { versions: { include: ordered, orderBy: { number: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const assigned =
      user.role === 'STUDENT'
        ? await db.nutritionAssignment.findMany({
            where: { studentId: user.id },
            include: { version: { include: { ...ordered, plan: true } } },
          })
        : [];
    const available = [];
    for (const a of assigned)
      if (
        a.version.plan.authorId === user.id ||
        (await canAccessStudent(db, a.version.plan.authorId, user.id, 'NUTRITION'))
      )
        available.push(a);
    const links =
      user.role === 'PROFESSIONAL'
        ? await db.professionalStudentLink.findMany({
            where: {
              professionalId: user.id,
              area: 'NUTRITION',
              status: 'ACTIVE',
              consents: { some: { scope: 'NUTRITION_HISTORY', revokedAt: null } },
            },
            include: { student: { select: { id: true, profile: { select: { name: true } } } } },
          })
        : [];
    const enabled =
      user.role === 'STUDENT' ||
      !!(await db.professionalCredential.findFirst({
        where: { professionalId: user.id, area: 'NUTRITION', status: 'VERIFIED' },
      }));
    const current = available.filter(
      (a) => !a.version.validFrom || a.version.validFrom <= new Date(),
    );
    const latest = current.filter(
      (a) =>
        !current.some(
          (b) => b.version.planId === a.version.planId && b.version.number > a.version.number,
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
  if (path.startsWith('nutrition/version/')) {
    const version = await db.nutritionVersion.findUnique({
      where: { id: parts[2] },
      include: { plan: true, ...ordered, assignments: { where: { studentId: user.id } } },
    });
    if (
      !version ||
      (version.plan.authorId !== user.id &&
        !(user.role === 'STUDENT' && version.publishedAt && version.assignments.length))
    )
      throw new HttpError(404, 'Plano não encontrado.');
    return json({
      ...version,
      totals: totalNutrients(version.meals.flatMap((m) => m.items.map(itemTotals))),
    });
  }
  if (path === 'meals') {
    const studentId = req.nextUrl.searchParams.get('studentId') ?? user.id;
    await studentAccess(db, user, studentId, 'NUTRITION');
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(req.nextUrl.searchParams.get('date'));
    const logs = await db.mealLog.findMany({
      where: { studentId, date },
      include: { items: true, replies: { orderBy: { createdAt: 'asc' } } },
      orderBy: { consumedAt: 'asc' },
    });
    const totals = totalNutrients(
      logs.filter((l) => l.consumedAt).flatMap((l) => l.items.map(itemTotals)),
    );
    const enriched = [];
    for (const log of logs) {
      const meal = log.prescribedMealId
        ? await db.nutritionMeal.findUnique({
            where: { id: log.prescribedMealId },
            include: {
              items: true,
              version: { include: { assignments: { where: { studentId } } } },
            },
          })
        : null;
      const prescribed = meal?.version.assignments.length
        ? { name: meal.name, items: meal.items, totals: totalNutrients(meal.items.map(itemTotals)) }
        : null;
      enriched.push({
        ...log,
        prescribed,
        differences: prescribed
          ? differenceNutrients(totalNutrients(log.items.map(itemTotals)), prescribed.totals)
          : null,
      });
    }
    return json({ logs: enriched, totals, macros: macroDistribution(totals) });
  }
  if (path.startsWith('foods/')) {
    const food = await db.food.findFirst({
      where: { id: parts[1], ...foodWhere(user, false) },
      include: { measures: true },
    });
    if (!food) throw new HttpError(404, 'Alimento não encontrado.');
    return json(food);
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
export async function nutritionPost(db: PrismaClient, user: User, path: string, body: unknown) {
  const parts = path.split('/');
  if (path === 'foods/create') {
    await authorship(db, user, 'NUTRITION');
    const data = foodInput.parse(body);
    if (
      data.measures.some(
        (m) =>
          m.unit !== data.referenceUnit ||
          new Decimal(m.quantity).lte(0) ||
          new Decimal(m.quantity).decimalPlaces() > 4,
      )
    )
      throw new HttpError(
        400,
        'Medidas devem ter equivalências positivas na unidade de referência.',
      );
    const { measures, provenance, ...fields } = data;
    const food = await db.food.create({
      data: {
        ...fields,
        source: 'CUSTOM',
        ownerId: user.id,
        searchText: normalizeSearch([data.name, ...data.aliases].join(' ')),
        provenance: {
          source: provenance,
          author: user.id,
          accuracy: 'Informado pelo usuário; valores estimados.',
        },
        measures: { create: measures },
      },
    });
    return json({ message: 'Alimento cadastrado com procedência.', id: food.id });
  }
  if (path === 'foods/recipe') {
    await authorship(db, user, 'NUTRITION');
    const data = z
      .object({
        name: txt.min(2).max(200),
        yieldQuantity: quantity,
        yieldUnit: unit,
        ingredients: z.array(item).min(1).max(50),
        provenance: txt.min(3).max(1000),
      })
      .strict()
      .parse(body);
    if (new Decimal(data.yieldQuantity).lte(0))
      throw new HttpError(400, 'Rendimento deve ser positivo.');
    const catalog = await foodCatalog(db, user, data.ingredients);
    const ingredients = [];
    for (const i of data.ingredients) ingredients.push(await resolveItem(db, user, i, [], catalog));
    const total = totalNutrients(
      ingredients.map((i) =>
        scaleNutrients((i.snapshot as { nutrients: Nutrients }).nutrients, i.quantity),
      ),
    );
    const normalized = Object.fromEntries(
      Object.entries(total).map(([k, v]) => [
        k,
        v == null ? null : new Decimal(v).div(data.yieldQuantity).mul(100).toString(),
      ]),
    );
    const food = await db.food.create({
      data: {
        source: 'CUSTOM',
        ownerId: user.id,
        name: data.name,
        searchText: normalizeSearch(data.name),
        referenceUnit: data.yieldUnit,
        nutrients: normalized,
        provenance: {
          source: data.provenance,
          author: user.id,
          type: 'RECIPE',
          yieldQuantity: data.yieldQuantity,
          yieldUnit: data.yieldUnit,
          ingredients,
          accuracy: 'Estimativa a partir dos ingredientes; rendimento informado.',
        } as Prisma.InputJsonValue,
      },
    });
    return json({ message: 'Receita calculada e salva.', id: food.id });
  }
  if (parts[0] === 'foods' && parts[2] === 'update') {
    await authorship(db, user, 'NUTRITION');
    const food = await db.food.findFirst({
      where: { id: parts[1], ownerId: user.id, source: 'CUSTOM' },
    });
    if (!food) throw new HttpError(404, 'Alimento personalizado não encontrado.');
    if ((food.provenance as { type?: string }).type === 'RECIPE')
      throw new HttpError(
        409,
        'Crie uma variação da receita por ingredientes para recalcular nutrientes.',
      );
    const data = foodInput.parse(body);
    if (
      data.measures.some(
        (m) =>
          m.unit !== data.referenceUnit ||
          new Decimal(m.quantity).lte(0) ||
          new Decimal(m.quantity).decimalPlaces() > 4,
      )
    )
      throw new HttpError(400, 'Medida incompatível.');
    const { measures, provenance, ...fields } = data;
    await db.$transaction(async (tx) => {
      await tx.foodMeasure.deleteMany({ where: { foodId: food.id } });
      await tx.food.update({
        where: { id: food.id },
        data: {
          ...fields,
          searchText: normalizeSearch([data.name, ...data.aliases].join(' ')),
          provenance: {
            source: provenance,
            author: user.id,
            accuracy: 'Dados informados; valores estimados.',
          },
          measures: { create: measures },
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'CUSTOM_FOOD_UPDATED', resourceId: food.id },
      });
    });
    return json({
      message: 'Alimento atualizado; prescrições e registros anteriores preservados.',
    });
  }
  if (parts[0] === 'foods' && parts[2] === 'status') {
    const food = await db.food.findFirst({ where: { id: parts[1], ownerId: user.id } });
    if (!food) throw new HttpError(404, 'Alimento personalizado não encontrado.');
    const { active } = z.object({ active: z.boolean() }).strict().parse(body);
    await db.food.update({ where: { id: food.id }, data: { active } });
    return json({ message: 'Status atualizado. Históricos preservados.' });
  }
  if (path === 'nutrition/create') {
    await authorship(db, user, 'NUTRITION');
    const { name } = z
      .object({ name: txt.min(2).max(150) })
      .strict()
      .parse(body);
    const plan = await db.nutritionPlan.create({
      data: { authorId: user.id, name, versions: { create: { number: 1 } } },
      include: { versions: true },
    });
    return json({
      message: user.role === 'STUDENT' ? 'Planejamento pessoal criado.' : 'Plano criado.',
      versionId: plan.versions[0].id,
    });
  }
  if (parts[0] === 'nutrition' && parts.length === 3) {
    await authorship(db, user, 'NUTRITION');
    const version = await db.nutritionVersion.findUnique({
      where: { id: parts[1] },
      include: { plan: true, ...ordered },
    });
    if (!version || version.plan.authorId !== user.id)
      throw new HttpError(404, 'Plano não encontrado.');
    if (parts[2] === 'save') {
      if (version.publishedAt)
        throw new HttpError(409, 'Plano publicado é imutável. Crie uma revisão.');
      const { revision, data } = z
        .object({ revision: z.number().int().min(0), data: planInput })
        .strict()
        .parse(body);
      const catalog = await foodCatalog(
        db,
        user,
        data.meals.flatMap((m) => m.items.flatMap((i) => [i, ...i.substitutions])),
      );
      const meals: Prisma.NutritionMealCreateWithoutVersionInput[] = [];
      for (const [position, meal] of data.meals.entries()) {
        const items = [];
        for (const [index, i] of meal.items.entries()) {
          const resolved = await resolveItem(db, user, i, [], catalog);
          const substitutions = [];
          for (const alternative of i.substitutions)
            substitutions.push(await resolveItem(db, user, alternative, [], catalog));
          items.push({
            ...resolved,
            position: index,
            substitutions: substitutions as Prisma.InputJsonValue,
          });
        }
        meals.push({
          name: meal.name,
          time: meal.time,
          position,
          notes: meal.notes,
          items: { create: items },
        });
      }
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.nutritionVersion.updateMany({
              where: { id: version.id, publishedAt: null, draftRevision: revision },
              data: {
                objective: data.objective,
                notes: data.notes,
                validFrom: data.validFrom,
                draftRevision: { increment: 1 },
              },
            })
          ).count
        )
          throw new HttpError(409, 'Rascunho alterado; recarregue.');
        await tx.nutritionMeal.deleteMany({ where: { versionId: version.id } });
        await tx.nutritionVersion.update({
          where: { id: version.id },
          data: { meals: { create: meals } },
        });
      });
      return json({ message: 'Rascunho salvo.', revision: revision + 1 });
    }
    if (parts[2] === 'publish') {
      const { revision, studentIds } = z
        .object({ revision: z.number().int().min(0), studentIds: z.array(id).max(100).default([]) })
        .strict()
        .parse(body);
      if (!version.meals.length) throw new HttpError(400, 'Adicione refeições antes de publicar.');
      const targets = user.role === 'STUDENT' ? [user.id] : [...new Set(studentIds)];
      await assignmentTargets(db, user, targets, 'NUTRITION');
      await db.$transaction(async (tx) => {
        if (
          !(
            await tx.nutritionVersion.updateMany({
              where: { id: version.id, publishedAt: null, draftRevision: revision },
              data: { publishedAt: new Date() },
            })
          ).count
        )
          throw new HttpError(409, 'Plano já publicado ou alterado.');
        for (const studentId of targets)
          await tx.nutritionAssignment.create({ data: { versionId: version.id, studentId } });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'NUTRITION_PUBLISHED', resourceId: version.id },
        });
      });
      return json({
        message: user.role === 'STUDENT' ? 'Planejamento pessoal salvo.' : 'Plano publicado.',
      });
    }
    if (parts[2] === 'revise') {
      z.object({}).strict().parse(body);
      const copiedMeals = version.meals.map((m) => ({
        name: m.name,
        time: m.time,
        position: m.position,
        notes: m.notes,
        items: {
          create: m.items.map((i) => ({
            position: i.position,
            foodId: i.foodId,
            quantity: i.quantity,
            unit: i.unit,
            snapshot: i.snapshot as Prisma.InputJsonValue,
            substitutions: i.substitutions as Prisma.InputJsonValue,
          })),
        },
      }));
      const copy = await db.$transaction(async (tx) => {
        const last = await tx.nutritionVersion.findFirst({
          where: { planId: version.planId },
          orderBy: { number: 'desc' },
        });
        return tx.nutritionVersion.create({
          data: {
            planId: version.planId,
            number: (last?.number ?? 0) + 1,
            objective: version.objective,
            notes: version.notes,
            validFrom: version.validFrom,
            meals: { create: copiedMeals },
          },
        });
      });
      return json({ message: 'Revisão criada.', versionId: copy.id });
    }
  }
  if (path === 'meals/save') {
    if (user.role !== 'STUDENT') throw new HttpError(403, 'O diário alimentar pertence ao aluno.');
    const data = z
      .object({
        id: z.uuid(),
        revision: z.number().int().min(0),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mealName: txt.min(1).max(100),
        prescribedMealId: id.nullable().optional(),
        consumed: z.boolean(),
        notes: txt.max(2000).default(''),
        items: z.array(item).min(1).max(40),
      })
      .strict()
      .parse(body);
    if (
      Number.isNaN(new Date(data.date + 'T00:00:00Z').getTime()) ||
      new Date(data.date + 'T00:00:00Z').toISOString().slice(0, 10) !== data.date
    )
      throw new HttpError(400, 'Data inválida.');
    const existing = await db.mealLog.findUnique({ where: { id: data.id } });
    if (existing && existing.studentId !== user.id)
      throw new HttpError(404, 'Registro não encontrado.');
    if (
      existing &&
      data.prescribedMealId !== undefined &&
      data.prescribedMealId !== existing.prescribedMealId
    )
      throw new HttpError(
        409,
        'A prescrição de origem não pode ser trocada em um registro existente.',
      );
    const prescribedMealId = existing?.prescribedMealId ?? data.prescribedMealId;
    let allowed: unknown[] = [];
    if (prescribedMealId) {
      const meal = await db.nutritionMeal.findUnique({
        where: { id: prescribedMealId },
        include: {
          items: true,
          version: { include: { assignments: { where: { studentId: user.id } } } },
        },
      });
      if (!meal?.version.publishedAt || !meal.version.assignments.length)
        throw new HttpError(403, 'Refeição não atribuída.');
      allowed = meal.items.flatMap((i) => [
        i.snapshot,
        ...(i.substitutions as { snapshot: unknown }[]).map((v) => v.snapshot),
      ]);
    }
    const catalog = await foodCatalog(db, user, data.items);
    const resolved: Awaited<ReturnType<typeof resolveItem>>[] = [];
    for (const i of data.items) resolved.push(await resolveItem(db, user, i, allowed, catalog));
    await db.$transaction(async (tx) => {
      if (existing) {
        if (
          !(
            await tx.mealLog.updateMany({
              where: { id: data.id, studentId: user.id, revision: data.revision },
              data: {
                revision: { increment: 1 },
                date: data.date,
                mealName: data.mealName,
                notes: data.notes,
                consumedAt: data.consumed ? new Date() : null,
              },
            })
          ).count
        )
          throw new HttpError(409, 'Registro alterado; recarregue.');
        await tx.mealLogItem.deleteMany({ where: { logId: data.id } });
        await tx.mealLog.update({ where: { id: data.id }, data: { items: { create: resolved } } });
      } else {
        if (data.revision !== 0) throw new HttpError(409, 'Registro não encontrado.');
        await tx.mealLog.create({
          data: {
            id: data.id,
            studentId: user.id,
            date: data.date,
            mealName: data.mealName,
            prescribedMealId: data.prescribedMealId,
            notes: data.notes,
            consumedAt: data.consumed ? new Date() : null,
            revision: 1,
            items: { create: resolved },
          },
        });
      }
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'MEAL_LOG_SAVED', resourceId: data.id },
      });
    });
    return json({
      message: 'Consumo registrado sem alterar a prescrição.',
      revision: data.revision + 1,
    });
  }
  if (parts[0] === 'meals' && parts[2] === 'reply') {
    const log = await db.mealLog.findUnique({ where: { id: parts[1] } });
    if (!log) throw new HttpError(404, 'Registro não encontrado.');
    await professional(db, user, 'NUTRITION');
    await studentAccess(db, user, log.studentId, 'NUTRITION');
    const { text } = z
      .object({ text: txt.min(1).max(2000) })
      .strict()
      .parse(body);
    await db.nutritionReply.create({ data: { logId: log.id, authorId: user.id, text } });
    return json({ message: 'Comentário enviado.' });
  }
  throw new HttpError(404, 'Recurso não encontrado.');
}
