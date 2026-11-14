const prefix = 'cp:draft:';

const readDraft = (name: string): string | null => {
  try {
    return localStorage.getItem(`${prefix}${name}`);
  } catch {
    return null;
  }
};

const writeDraft = (name: string, text: string): boolean => {
  try {
    localStorage.setItem(`${prefix}${name}`, text);
    return true;
  } catch {
    return false;
  }
};

const clearDraft = (name: string): void => {
  try {
    localStorage.removeItem(`${prefix}${name}`);
  } catch {
    writeDraft(name, '');
  }
};

export { clearDraft, readDraft, writeDraft };
