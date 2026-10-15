import test from 'node:test';
import assert from 'node:assert/strict';
import { totp, matchingCounter, encryptMfa, decryptMfa, newMfaSecret } from '../src/lib/mfa';
test('TOTP segue vetor RFC 6238 e janela de validade', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(await totp(secret, 1), '287082');
  assert.equal(await matchingCounter(secret, '287082', 59000), 1);
  assert.equal(await matchingCounter(secret, '287082', 150000), null);
  assert.equal(await matchingCounter(secret, 'abc123', 59000), null);
  assert.match(newMfaSecret(), /^[A-Z2-7]{32}$/);
});
test('Segredo MFA criptografado vincula senha e usuário', async () => {
  const secret = newMfaSecret();
  const encrypted = await encryptMfa(secret, 'senha-segura-12345', 'usuario-a');
  assert.equal(await decryptMfa({ id: 'usuario-a', ...encrypted }, 'senha-segura-12345'), secret);
  assert.notEqual(encrypted.mfaCipher, secret);
  await assert.rejects(decryptMfa({ id: 'usuario-a', ...encrypted }, 'senha-incorreta'));
  await assert.rejects(decryptMfa({ id: 'usuario-b', ...encrypted }, 'senha-segura-12345'));
});
