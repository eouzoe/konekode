import { currentVersion, isEvent, type Kind, type LearningEvent } from './events';

const eventsKey = 'cp:events:v1';
const deviceKey = 'cp:device';
const draftPrefix = 'cp:draft:';

const readText = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeText = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const readEvents = (): LearningEvent[] => {
  try {
    const parsed: unknown = JSON.parse(readText(eventsKey) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => isEvent(item));
  } catch {
    return [];
  }
};

const deviceId = (): string => {
  const existing = readText(deviceKey);
  if (existing !== null) {
    return existing;
  }
  const created = crypto.randomUUID();
  writeText(deviceKey, created);
  return created;
};

const record = (kind: Kind, unit: string, ref: string): boolean => {
  const event: LearningEvent = {
    at: Date.now(),
    device: deviceId(),
    id: crypto.randomUUID(),
    kind,
    ref,
    unit,
    version: currentVersion,
  };
  return writeText(eventsKey, JSON.stringify([...readEvents(), event]));
};

const readDraft = (name: string): string | null => readText(`${draftPrefix}${name}`);

const writeDraft = (name: string, text: string): boolean =>
  writeText(`${draftPrefix}${name}`, text);

const clearDraft = (name: string): void => {
  try {
    localStorage.removeItem(`${draftPrefix}${name}`);
  } catch {
    writeText(`${draftPrefix}${name}`, '');
  }
};

export { clearDraft, readDraft, readEvents, record, writeDraft };
