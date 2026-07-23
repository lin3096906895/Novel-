import { spawn, type ChildProcess } from 'node:child_process';

const host = '127.0.0.1';
const port = process.env.NOVEL_FUNCTIONAL_TEST_PORT ?? '3401';
const apiBaseUrl = `http://${host}:${port}/api`;

async function main() {
  const server = startServer();
  try {
    await waitForHealth(server);
    const exitCode = await runFunctionalTests();
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await stopServer(server);
  }
}

function startServer() {
  return spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: host,
      PORT: port,
      WEB_ORIGIN: 'http://localhost:5300',
      ADMIN_ORIGIN: 'http://localhost:5301',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function waitForHealth(server: ChildProcess) {
  const timeoutAt = Date.now() + 30_000;
  while (Date.now() < timeoutAt) {
    if (server.exitCode !== null) {
      throw new Error(`Functional test API stopped before becoming healthy (exit code ${server.exitCode}).`);
    }

    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The Nest process is still starting.
    }

    await delay(250);
  }

  throw new Error(`Functional test API did not become healthy within 30 seconds: ${apiBaseUrl}/health`);
}

async function runFunctionalTests() {
  const options = {
    cwd: process.cwd(),
    env: { ...process.env, NOVEL_API_BASE_URL: apiBaseUrl },
    stdio: 'inherit' as const,
    windowsHide: true,
  };
  const tests =
    process.platform === 'win32'
      ? spawn(
          process.env.ComSpec ?? 'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            'corepack pnpm exec tsx --test --test-concurrency=1 test/**/*.functional.test.ts',
          ],
          options,
        )
      : spawn(
          'corepack',
          ['pnpm', 'exec', 'tsx', '--test', '--test-concurrency=1', 'test/**/*.functional.test.ts'],
          options,
        );

  return waitForExit(tests);
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null || server.killed) {
    return;
  }

  server.kill();
  await Promise.race([waitForExit(server), delay(5_000)]);
}

function waitForExit(process: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', (code) => resolve(code ?? 1));
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

void main();
