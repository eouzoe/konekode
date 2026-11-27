import { rmSync } from 'node:fs';

const stage = 'e2e';

for (const path of ['.alchemy/local', `.alchemy/state/Konekode/${stage}`]) {
  rmSync(path, { force: true, recursive: true });
}

export { stage };
