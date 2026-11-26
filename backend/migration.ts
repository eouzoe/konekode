const flatDirectory = 'migrations';
const drizzleDirectory = 'drizzle';
const numbered = /^(?<number>\d{4})_/u;
const width = 4;
const argumentsStart = 2;

const nextNumber = (files: ReadonlyArray<string>): string => {
  const used = files.map((file) => Number(numbered.exec(file)?.groups?.number ?? '0'));
  return String(Math.max(0, ...used) + 1).padStart(width, '0');
};

const flatName = (files: ReadonlyArray<string>, name: string): string =>
  `${nextNumber(files)}_${name}.sql`;

const newestFor = (directories: ReadonlyArray<string>, name: string): string | undefined => {
  const [newest] = directories
    .filter((directory) => directory.endsWith(`_${name}`))
    .toSorted()
    .toReversed();
  return newest;
};

const entries = (directory: string): Array<string> => [
  ...new Bun.Glob('*').scanSync({ cwd: directory, onlyFiles: false }),
];

const generate = async (name: string): Promise<void> => {
  const child = Bun.spawn(['bun', 'x', 'drizzle-kit', 'generate', '--name', name], {
    stderr: 'inherit',
    stdout: 'inherit',
  });
  if ((await child.exited) !== 0) {
    throw new Error('drizzle-kit generate failed');
  }
};

const add = async (name: string): Promise<string> => {
  await generate(name);
  const generated = newestFor(entries(drizzleDirectory), name);
  if (generated === undefined) {
    throw new Error(`no schema change: nothing was generated for ${name}`);
  }
  const target = `${flatDirectory}/${flatName(entries(flatDirectory), name)}`;
  await Bun.write(target, Bun.file(`${drizzleDirectory}/${generated}/migration.sql`));
  return target;
};

if (import.meta.main) {
  const [name = ''] = Bun.argv.slice(argumentsStart);
  if (!/^[a-z][a-z0-9_]*$/u.test(name)) {
    throw new Error('name the migration in snake_case, e.g. add_device_key');
  }
  process.stdout.write(`${await add(name)}\n`);
}

export { flatName, newestFor, nextNumber };
