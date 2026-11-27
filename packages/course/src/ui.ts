import strings from './text/zh-TW/ui.json' with { type: 'json' };

type UiKey = keyof typeof strings;

const ui: Readonly<Record<UiKey, string>> = strings;

const say = (key: UiKey, values: Readonly<Record<string, string>> = {}): string => {
  let text: string = ui[key];
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
};

export { say, ui, type UiKey };
