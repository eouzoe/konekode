import { Option, Schema } from 'effect';

import { report } from '@/lib/fault/fault';

const prefix = 'cp:draft:';
const draftSchema = Schema.Struct({ cursor: Schema.Finite, text: Schema.String });
const decodeStored = Schema.decodeUnknownOption(draftSchema);

type Draft = typeof draftSchema.Type;

const decode = (raw: string): Draft => {
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = decodeStored(value);
    if (Option.isSome(parsed)) {
      return parsed.value;
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
  } catch (error) {
    report('storage.local', 'draft', error);
    return null;
  }
};

const writeDraft = (name: string, draft: Draft): boolean => {
  try {
    localStorage.setItem(`${prefix}${name}`, JSON.stringify(draft));
    return true;
  } catch (error) {
    report('storage.local', 'draft', error);
    return false;
  }
};

const clearDraft = (name: string): void => {
  try {
    localStorage.removeItem(`${prefix}${name}`);
  } catch (error) {
    report('storage.local', 'draft', error);
    writeDraft(name, { cursor: 0, text: '' });
  }
};

export { clearDraft, readDraft, writeDraft, type Draft };
