import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleNutrients,
  totalNutrients,
  macroDistribution,
  differenceNutrients,
  multiplyQuantities,
} from '../src/lib/nutrition-math';
import { parseCsv } from '../src/lib/csv';
test('Cálculo nutricional mantém precisão decimal e nutrientes ausentes', () => {
  assert.deepEqual(scaleNutrients({ energy_kcal: '110.1234', fiber_g: null }, '50'), {
    energy_kcal: '55.0617',
    fiber_g: null,
  });
  assert.equal(totalNutrients([{ protein_g: '0.1' }, { protein_g: '0.2' }]).protein_g, '0.3');
  assert.equal(totalNutrients([{ fiber_g: '1' }, {}]).fiber_g, null);
  assert.equal(scaleNutrients({ protein_g: '0' }, '50').protein_g, '0');
  assert.equal(macroDistribution({ protein_g: '1', carbohydrate_g: null, fat_g: '1' }), null);
});
test('CSV conserva campos entre aspas, vírgulas, quebras de linha e aspas escapadas', () => {
  const csv = ['id,name', '1,"Feijão, cozido"', '2,"Arroz\ncozido"', '3,"A ""B"""'].join('\r\n');
  assert.deepEqual(parseCsv(csv), [
    { id: '1', name: 'Feijão, cozido' },
    { id: '2', name: 'Arroz\ncozido' },
    { id: '3', name: 'A "B"' },
  ]);
  assert.throws(() => parseCsv('id,name\n1,"aberto'));
});

test('Diferenças e medidas preservam decimais e ausência', () => {
  assert.deepEqual(
    differenceNutrients({ protein_g: '0.3', fiber_g: null }, { protein_g: '0.1', fiber_g: '1' }),
    { protein_g: '0.2', fiber_g: null },
  );
  assert.equal(multiplyQuantities('1.5', '50'), '75');
});
