/** Offline targeted gate. Default compiler is the installed project TypeScript. */
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiler = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (process.argv.length > 3 || !existsSync(compiler)) {
  console.error('Install the pinned dev dependencies with npm ci, then run npm run test:m3.');
  console.error('An isolated check may specify one explicit TypeScript compiler path. No dependency is downloaded automatically.');
  process.exitCode = 1;
} else {
  const temporary = mkdtempSync(join(tmpdir(), 'dead-mall-m3-'));
  const run = (args, env = process.env) => {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
    if (result.error) console.error(result.error.message);
    return result.status ?? 1;
  };
  try {
    const types = join(temporary, 'empty-types');
    mkdirSync(types);
    writeFileSync(join(temporary, 'package.json'), '{"type":"commonjs"}\n');
    const config = join(temporary, 'tsconfig.json');
    writeFileSync(config, JSON.stringify({
      compilerOptions: {
        strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
        isolatedModules: true, target: 'ES2022', module: 'CommonJS',
        typeRoots: [types], outDir: temporary,
      },
      files: [join(root, 'src/sim/shops/transactions.ts')],
    }));
    process.exitCode = run([compiler, '--project', config]);
    if (process.exitCode === 0) {
      process.exitCode = run(['--test', join(root, 'tests/contracts/shop-transactions.contract.cjs')], {
        ...process.env, M3_SHOP_TRANSACTIONS_MODULE: join(temporary, 'transactions.js'),
      });
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
