import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, randomToken, digest } from '../src/lib/crypto';
import { scopeForArea } from '../src/lib/access';
test('Senha derivada com salt único, conferência e rejeição de senha incorreta', async () => {
  const a = await hashPassword('uma-senha-segura-123');
  const b = await hashPassword('uma-senha-segura-123');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('uma-senha-segura-123', a), true);
  assert.equal(await verifyPassword('outra-senha-segura', a), false);
  assert.equal(await verifyPassword('uma-senha-segura-123', 'corrompida'), false);
});
test('Token opaco de 256 bits e escopos separados por área', async () => {
  const token = randomToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(await digest(token), token);
  assert.equal(scopeForArea('TRAINING'), 'TRAINING_HISTORY');
  assert.equal(scopeForArea('NUTRITION'), 'NUTRITION_HISTORY');
});
