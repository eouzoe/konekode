const actorKey = 'cp:device';

const newId = (): string => crypto.randomUUID();

const remember = (key: string, value: string): string => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return value;
  }
  return value;
};

const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const actorId = (): string => recall(actorKey) ?? remember(actorKey, newId());

const session = newId();

const sessionId = (): string => session;

export { actorId, newId, sessionId };
