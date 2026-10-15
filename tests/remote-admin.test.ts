import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyPassword } from '../src/lib/crypto';
test('Credencial do operador D1 é compatível com autenticação do aplicativo', async () => {
  const run = promisify(execFile);
  const password = 'Fixture-operador-local-12345';
  const { stdout } = await run(
    'python3',
    [
      '-c',
      'import importlib.util; spec=importlib.util.spec_from_file_location("operator_admin","scripts/create-d1-admin.py"); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); print(module.hash_password("Fixture-operador-local-12345"))',
    ],
    { env: { ...process.env, PYTHONPATH: 'scripts' } },
  );
  const hash = stdout.trim();
  assert.match(hash, /^pbkdf2-sha512\$210000\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(password + 'incorreta', hash), false);
});
