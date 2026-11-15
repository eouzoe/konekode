import { number, object, safeParse, string, type InferOutput } from 'valibot';

const prefix = 'cp:draft:';
const draftSchema = object({ cursor: number(), text: string() });

type Draft = InferOutput<typeof draftSchema>;

const decode = (raw: string): Draft => {
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = safeParse(draftSchema, value);
    if (parsed.success) {
      return parsed.output;
    }
  } catch {
    return { cursor: 0, text: raw };
  }
  return { cursor: 0, text: raw };
};

const readDraft = (name: string): Draft | null => {
  try {
    const raw = localStorage.getItem(`${prefix}${name}`);
    if (raw === null) {
      return null;
    }
    return decode(raw);
  } catch {
    return null;
  }
};

const writeDraft = (name: string, draft: Draft): boolean => {
  try {
    localStorage.setItem(`${prefix}${name}`, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

const clearDraft = (name: string): void => {
  try {
    localStorage.removeItem(`${prefix}${name}`);
  } catch {
    writeDraft(name, { cursor: 0, text: '' });
  }
};

export { clearDraft, readDraft, writeDraft, type Draft };
