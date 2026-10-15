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

test('Limite PBKDF2 do Worker preserva hashes existentes e MFA', async (t) => {
  const { derivePasswordKey } = await import('../src/lib/crypto');
  const { encryptMfa, decryptMfa } = await import('../src/lib/mfa');
  const password = 'Fixture-password-210000!';
  const salt = '0123456789abcdef'.repeat(4);
  const expected = '196676bf691c6a914a157a1d5e2a87638c76b952a6d93dd5f1d017c40ee8895f';
  assert.equal(Buffer.from(await derivePasswordKey(password, salt)).toString('hex'), expected);
  const encrypted = await encryptMfa('MFA-FIXTURE', password, 'fixture-user');
  const mocked = t.mock.method(crypto.subtle, 'deriveBits', async () => {
    throw new DOMException(
      'Pbkdf2 failed: iteration counts above 100000 are not supported (requested 210000).',
      'NotSupportedError',
    );
  });
  assert.equal(await verifyPassword(password, `pbkdf2-sha512$210000$${salt}$${expected}`), true);
  assert.equal(await decryptMfa({ id: 'fixture-user', ...encrypted }, password), 'MFA-FIXTURE');
  const fallbackEncrypted = await encryptMfa('MFA-FIXTURE', password, 'fixture-user');
  mocked.mock.restore();
  assert.equal(
    await decryptMfa({ id: 'fixture-user', ...fallbackEncrypted }, password),
    'MFA-FIXTURE',
  );
});

test('Erros criptográficos diferentes do limite de iterações não acionam fallback', async (t) => {
  const { derivePasswordKey } = await import('../src/lib/crypto');
  const error = new DOMException('Fixture failure', 'OperationError');
  t.mock.method(crypto.subtle, 'deriveBits', async () => {
    throw error;
  });
  await assert.rejects(
    derivePasswordKey('fixture-password', 'fixture-salt'),
    (actual) => actual === error,
  );
});
