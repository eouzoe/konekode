const progressKinds = ['beat.reached', 'check.passed', 'item.unlocked', 'unit.restarted'] as const;
const modelKinds = ['beat.reached', 'step.tried', 'task.entered'] as const;
const keptKinds: ReadonlySet<string> = new Set([...progressKinds, ...modelKinds]);

export { keptKinds, modelKinds, progressKinds };
