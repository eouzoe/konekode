const compiler = '/usr/bin/g++';
const version = ' 13.3.0';
const flags = ['-std=c++17', '-O2', '-Wall', '-Wextra'];
const env = { PATH: '/usr/bin:/bin' };
const separator = '\u0000';

interface Ran {
  readonly code: number;
  readonly err: string;
  readonly out: string;
}

const run = async (command: readonly string[], input = ''): Promise<Ran> => {
  const child = Bun.spawn([...command], {
    env,
    stderr: 'pipe',
    stdin: new Blob([input]),
    stdout: 'pipe',
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, err, out };
};

const compilerVersion = async (): Promise<string> => {
  try {
    const { out } = await run([compiler, '--version']);
    return out.split('\n')[0] ?? '';
  } catch {
    return '';
  }
};

const hasContestCompiler = async (): Promise<boolean> => {
  const found = await compilerVersion();
  return found.endsWith(version);
};

const digestOf = (program: string, input: string): string =>
  new Bun.CryptoHasher('sha256').update(`${program}${separator}${input}`).digest('hex');

const build = async (program: string, base: string): Promise<void> => {
  await Bun.write(`${base}.cpp`, program);
  const built = await run([compiler, ...flags, `${base}.cpp`, '-o', `${base}.bin`]);
  await Bun.file(`${base}.cpp`).delete();
  if (built.code !== 0 || built.err.trim() !== '') {
    throw new Error(`the contest compiler rejected the program: ${built.err}`);
  }
};

const contestOutput = async (program: string, input: string): Promise<string> => {
  const base = `${Bun.env.TMPDIR ?? '/tmp'}/contest-${crypto.randomUUID()}`;
  await build(program, base);
  const ran = await run([`${base}.bin`], input);
  await Bun.file(`${base}.bin`).delete();
  if (ran.code !== 0) {
    throw new Error(`the program exited with ${String(ran.code)}`);
  }
  return ran.out;
};

export { compilerVersion, contestOutput, digestOf, hasContestCompiler };
