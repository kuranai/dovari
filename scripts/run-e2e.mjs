import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const varsPath = resolve(process.cwd(), '.dev.vars');
const hadVarsFile = existsSync(varsPath);
const originalVars = hadVarsFile ? readFileSync(varsPath, 'utf8') : undefined;
const localVars = originalVars
  ? /^DOVARI_ENV=.*$/m.test(originalVars)
    ? originalVars.replace(/^DOVARI_ENV=.*$/m, 'DOVARI_ENV=local')
    : `DOVARI_ENV=local\n${originalVars}`
  : 'DOVARI_ENV=local\n';

writeFileSync(varsPath, localVars);

let cleanedUp = false;
function restoreVarsFile() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  if (originalVars === undefined) {
    unlinkSync(varsPath);
  } else {
    writeFileSync(varsPath, originalVars);
  }
}

function run(command, args) {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    });

    const forwardSignal = (signal) => {
      child.kill(signal);
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    child.on('error', (error) => {
      console.error(error);
      resolveResult(1);
    });
    child.on('exit', (code) => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
      resolveResult(code ?? 1);
    });
  });
}

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('npm_execpath is required to run the browser tests.');
  }

  const migrationCode = await run(process.execPath, [npmCli, 'run', 'db:migrate:local']);
  const buildCode = migrationCode === 0 ? await run(process.execPath, [npmCli, 'run', 'build']) : 1;
  const testCode =
    buildCode === 0
      ? await run(process.execPath, [
          npmCli,
          'exec',
          '--',
          'playwright',
          'test',
          '--config',
          'playwright.config.ts',
        ])
      : 1;
  process.exitCode = testCode;
} finally {
  restoreVarsFile();
}
