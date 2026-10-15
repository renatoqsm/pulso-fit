import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import dataset from '../data/wger/catalog.json';
import content from '../data/wger/pt-BR/content.json';

test('Catálogo PT-BR: cobertura, original pesquisável, números e atribuições preservados', () => {
  assert.equal(dataset.exercises.length, 934);
  assert.equal(new Set(dataset.exercises.map((item) => item.externalId)).size, 934);
  let localized = 0;
  for (const item of dataset.exercises) {
    assert.ok(item.provenance.displayLanguage.startsWith('pt'), item.name);
    if (item.instructions.trim())
      assert.ok(item.provenance.instructionsLanguage.startsWith('pt'), item.name);
    assert.ok(item.provenance.base.license);
    assert.ok(item.provenance.translations.length);
    const provenance = item.provenance as typeof item.provenance & {
      localization?: {
        original: { name: string; description?: string; instructions?: string };
        technicalReview: string;
      };
    };
    if (!provenance.localization) continue;
    localized++;
    const original = provenance.localization.original;
    if (original.name !== item.name) assert.ok(item.aliases.includes(original.name));
    assert.equal(provenance.localization.technicalReview, 'not-professionally-reviewed');
    for (const field of ['description', 'instructions'] as const) {
      if (!original[field]) continue;
      const hash = createHash('sha256').update(original[field]).digest('hex');
      const translated = (content as Record<string, { source: string; text: string }>)[hash];
      assert.equal(translated.source, original[field]);
      assert.equal(translated.text, item[field]);
      assert.deepEqual(
        item[field].match(/https?:\/\/[^\s<>]+/g) ?? [],
        original[field].match(/https?:\/\/[^\s<>]+/g) ?? [],
        item.name,
      );
      assert.deepEqual(
        (item[field].match(/\d+/g) ?? []).sort(),
        (original[field].match(/\d+/g) ?? []).sort(),
        item.name,
      );
    }
  }
  assert.equal(localized, 866);
  assert.equal(dataset.exercises.filter((item) => item.instructions.trim()).length, 913);
  const findOriginal = (name: string) =>
    dataset.exercises.find((item) => item.aliases.includes(name));
  assert.equal(findOriginal('Zottman curl')?.name, 'Rosca Zottman');
  assert.equal(findOriginal('Bench Press')?.name, 'Supino reto');
  assert.equal(findOriginal('Standing Calf Raises')?.name, 'Panturrilha em pé');
});
