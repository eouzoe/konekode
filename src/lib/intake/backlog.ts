const backlogLimit = 30_000;

const isOverfull = (frames: number, busy: boolean): boolean => !busy && frames > backlogLimit;

export { backlogLimit, isOverfull };
