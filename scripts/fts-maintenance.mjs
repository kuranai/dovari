import { spawnSync } from 'node:child_process';

const [operation, ...flags] = process.argv.slice(2);
const supportedOperations = new Set(['rebuild', 'integrity']);
const remote = flags.includes('--remote');

if (
  !operation ||
  !supportedOperations.has(operation) ||
  flags.some((flag) => flag !== '--remote')
) {
  console.error('Usage: npm run db:fts:rebuild | npm run db:fts:integrity [-- --remote]');
  process.exitCode = 1;
} else {
  const statement =
    operation === 'rebuild'
      ? "INSERT INTO pages_fts(pages_fts) VALUES ('rebuild')"
      : "INSERT INTO pages_fts(pages_fts) VALUES ('integrity-check')";
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const target = remote ? '--remote' : '--local';
  const result = spawnSync(
    npx,
    ['--no-install', 'wrangler', 'd1', 'execute', 'DB', target, '--command', statement, '--json'],
    { stdio: 'inherit' },
  );

  if (result.error) {
    console.error(`Could not run Wrangler: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
