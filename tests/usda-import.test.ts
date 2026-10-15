import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { D1Store } from '../src/lib/d1-store';
import { localD1 } from '../src/lib/local-d1';
import { basename } from 'node:path';
const run = promisify(execFile);
test('Importador CSV USDA: precisão, procedência, idempotência e rollback (fixture apenas de testes)', async () => {
  const url = process.env.TEST_DB_PATH;
  assert.equal(basename(url ?? 'invalid'), 'pulso_fit_test.sqlite');
  const db = new D1Store(await localD1(url!)).asClient();
  const dir = await mkdtemp(join(tmpdir(), 'pulso-usda-test-'));
  const id = String(900000000 + Math.floor(Math.random() * 90000000));
  const version = 'SYNTHETIC-TEST-' + crypto.randomUUID();
  const command = () =>
    run(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/import-usda.ts',
        '--directory',
        dir,
        '--version',
        version,
        '--reviewed-license',
      ],
      { env: { ...process.env, PULSO_DB_PATH: url }, maxBuffer: 1024 * 1024 },
    );
  try {
    await writeFile(
      join(dir, 'food.csv'),
      `fdc_id,data_type,description\n${id},foundation_food,"SYNTHETIC TEST ONLY, alimento"\n`,
    );
    await writeFile(
      join(dir, 'nutrient.csv'),
      'id,name,unit_name\n1008,Energy,KCAL\n1003,Protein,G\n',
    );
    await writeFile(
      join(dir, 'food_nutrient.csv'),
      `fdc_id,nutrient_id,amount\n${id},1008,110.1234\n${id},1003,0.1\n`,
    );
    await command();
    const original = await db.food.findUniqueOrThrow({
      where: { source_externalId: { source: 'USDA_FDC', externalId: id } },
    });
    assert.deepEqual(original.nutrients, { energy_kcal: '110.1234', protein_g: '0.1' });
    assert.equal(original.sourceVersion, version);
    assert.equal(original.referenceUnit, 'g');
    assert.equal((original.provenance as { reference: string }).reference, '100 g');
    await db.food.update({ where: { id: original.id }, data: { active: false } });
    await command();
    const repeat = await db.food.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(repeat.active, false);
    assert.equal(await db.food.count({ where: { source: 'USDA_FDC', externalId: id } }), 1);
    await writeFile(
      join(dir, 'food_nutrient.csv'),
      `fdc_id,nutrient_id,amount\n${id},1008,110.1234\n${id},1008,999\n`,
    );
    await assert.rejects(command());
    assert.deepEqual(
      (await db.food.findUniqueOrThrow({ where: { id: original.id } })).nutrients,
      original.nutrients,
    );
  } finally {
    await db.food.deleteMany({ where: { sourceVersion: version } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
});
