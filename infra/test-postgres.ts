import EmbeddedPostgres from 'embedded-postgres';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
const require = createRequire(import.meta.url);
export async function freeTestPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const a = server.address();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  if (!a || typeof a === 'string') throw Error('No loopback port');
  return a.port;
}
// On Windows embedded-postgres.stop uses taskkill /f. Use a native fast shutdown
// and wait for PostgreSQL to remove its pid file before taking any physical backup.
export class LocalPostgres extends EmbeddedPostgres {
  constructor(
    private config: ConstructorParameters<typeof EmbeddedPostgres>[0] & {
      databaseDir: string;
      port: number;
    },
  ) {
    super(config);
  }
  private async control(args: string[]) {
    const native = createRequire(require.resolve('embedded-postgres')).resolve(
      '@embedded-postgres/windows-x64',
    );
    const { pg_ctl } = await import(pathToFileURL(native).href);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pg_ctl, ['-D', this.config.databaseDir, '-w', '-t', '25', ...args], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 30000,
      });
      proc.once('error', reject);
      proc.once('exit', (code) =>
        code === 0 ? resolve() : reject(Error('pg_ctl ' + args.at(-1) + ' failed: ' + code)),
      );
    });
  }
  private running = false;
  override async start() {
    if (process.platform !== 'win32') await super.start();
    else
      await this.control([
        '-l',
        path.join(this.config.databaseDir, 'local-server.log'),
        '-o',
        '-h 127.0.0.1 -p ' + this.config.port,
        'start',
      ]);
    this.running = true;
  }
  override async createDatabase(name: string) {
    const client = this.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      await client.query('CREATE DATABASE ' + client.escapeIdentifier(name));
    } finally {
      await client.end();
    }
  }
  override async stop() {
    if (!this.running) return;
    this.running = false;
    if (process.platform === 'win32') await this.control(['-m', 'fast', 'stop']);
    else await super.stop();
    if (
      await access(path.join(this.config.databaseDir, 'postmaster.pid')).then(
        () => true,
        () => false,
      )
    )
      throw Error('Database shutdown was not confirmed; refusing cold backup');
  }
}
