const kept = new Set(['dev', 'prod']);
const listed = /^Konekode\/(?<stage>[^/]+)\/$/u;

const stagesIn = (listing: string): string[] =>
  listing
    .split('\n')
    .map((line) => listed.exec(line.trim())?.groups?.stage)
    .filter((stage): stage is string => stage !== undefined);

const previewsIn = (listing: string): string[] =>
  stagesIn(listing).filter((stage) => !kept.has(stage));

const run = async (command: readonly string[]): Promise<string> => {
  const child = Bun.spawn([...command], { stderr: 'inherit', stdout: 'pipe' });
  const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) {
    throw new Error(`${command.join(' ')} exited with ${String(code)}`);
  }
  return out;
};

const destroy = (stage: string): Promise<string> =>
  run(['bun', 'x', 'alchemy', 'destroy', '--stage', stage, '--yes', '--no-input']);

const clean = async (): Promise<void> => {
  const previews = previewsIn(
    await run(['bun', 'x', 'alchemy', 'state', 'ls', 'Konekode', '--no-input']),
  );
  process.stdout.write(`previews to destroy: ${previews.join(', ') || 'none'}\n`);
  await previews.reduce<Promise<unknown>>(async (before, stage) => {
    await before;
    return destroy(stage);
  }, Promise.resolve());
};

if (import.meta.main) {
  await clean();
}

export { previewsIn, stagesIn };
