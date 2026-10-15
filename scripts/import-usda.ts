import Decimal from 'decimal.js';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCsv } from '../src/lib/csv';
import { normalizeSearch } from '../src/lib/exercise-import';
import { getDb } from '../src/lib/db';
const { values } = parseArgs({
  options: {
    directory: { type: 'string' },
    version: { type: 'string' },
    limit: { type: 'string', default: '500' },
    'reviewed-license': { type: 'boolean' },
  },
});
if (!values.directory || !values.version || !values['reviewed-license'])
  throw new Error(
    'Forneça --directory, --version e --reviewed-license após verificar os direitos do dataset oficial USDA.',
  );
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
  throw new Error('Limite entre 1 e 10000 alimentos por execução.');
const read = async (file: string) =>
  parseCsv(await readFile(resolve(values.directory!, file), 'utf8'));
const [foods, definitions, records] = await Promise.all([
  read('food.csv'),
  read('nutrient.csv'),
  read('food_nutrient.csv'),
]);
const selected = foods
  .filter((f) => ['sr_legacy_food', 'foundation_food'].includes(f.data_type))
  .slice(0, limit);
if (!selected.length) throw new Error('Nenhum alimento SR Legacy/Foundation encontrado.');
const codes = new Set(selected.map((f) => f.fdc_id));
const defs = new Map(definitions.map((d) => [d.id, d]));
const byFood = new Map<string, Record<string, string>>();
const macro: Record<string, string> = {
  protein: 'protein_g',
  'total lipid (fat)': 'fat_g',
  'carbohydrate, by difference': 'carbohydrate_g',
  'fiber, total dietary': 'fiber_g',
  'sugars, total including nlea': 'sugar_g',
  'sugars, total': 'sugar_g',
  'sodium, na': 'sodium_mg',
  'calcium, ca': 'calcium_mg',
  'iron, fe': 'iron_mg',
  energy: 'energy_kcal',
};
let skipped = 0;
for (const record of records) {
  if (!codes.has(record.fdc_id) || record.amount.trim() === '') continue;
  const def = defs.get(record.nutrient_id);
  if (!def) {
    skipped++;
    continue;
  }
  const unit = def.unit_name.toLowerCase().replace('µ', 'u').replace('μ', 'u');
  if (!['g', 'mg', 'ug', 'kcal', 'iu'].includes(unit)) {
    skipped++;
    continue;
  }
  let value: Decimal;
  try {
    value = new Decimal(record.amount);
  } catch {
    throw new Error('Valor nutricional inválido no dataset.');
  }
  if (!value.isFinite() || value.isNegative()) throw new Error('Nutriente negativo/não finito.');
  const mapped = Object.hasOwn(macro, def.name.toLowerCase())
    ? macro[def.name.toLowerCase()]
    : undefined;
  const key = mapped && mapped.endsWith('_' + unit) ? mapped : `nutrient_${def.id}_${unit}`;
  const nutrients = byFood.get(record.fdc_id) ?? {};
  if (nutrients[key] !== undefined && nutrients[key] !== value.toString())
    throw new Error('Valores conflitantes para o mesmo nutriente/alimento; revise a fonte.');
  nutrients[key] = value.toString();
  byFood.set(record.fdc_id, nutrients);
}
const db = await getDb();
try {
  let imported = 0,
    updated = 0;
  for (let offset = 0; offset < selected.length; offset += 40) {
    const chunk = selected.slice(offset, offset + 40);
    await db.$transaction(
      async (tx) => {
        await tx.food.findMany({
          where: { source: 'USDA_FDC', externalId: { in: chunk.map((row) => row.fdc_id) } },
        });
        for (const row of chunk) {
          const existing = await tx.food.findUnique({
            where: { source_externalId: { source: 'USDA_FDC', externalId: row.fdc_id } },
          });
          const data = {
            name: row.description,
            searchText: normalizeSearch(row.description),
            referenceUnit: 'g',
            nutrients: byFood.get(row.fdc_id) ?? {},
            sourceVersion: values.version!,
            provenance: {
              source: 'USDA FoodData Central',
              sourceUrl: `https://fdc.nal.usda.gov/food-details/${row.fdc_id}/nutrients`,
              license: 'CC0 / domínio público conforme dataset revisado',
              version: values.version!,
              dataType: row.data_type,
              reference: '100 g',
              originalLanguage: 'en',
              accuracy: 'Composição da fonte; valores estimados, ausência preservada.',
            },
          };
          await tx.food.upsert({
            where: { source_externalId: { source: 'USDA_FDC', externalId: row.fdc_id } },
            create: {
              id: 'usda-fdc-' + row.fdc_id,
              ...data,
              source: 'USDA_FDC',
              externalId: row.fdc_id,
            },
            update: data,
          });
          if (existing) updated++;
          else imported++;
        }
      },
      { timeout: 120000 },
    );
  }
  console.log({ imported, updated, skippedNutrientRecords: skipped, version: values.version });
} finally {
  await db.$disconnect();
}
