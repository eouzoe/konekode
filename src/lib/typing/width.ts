const fullWidthForm = /[\u3000\uFF01-\uFF5E]/u;

const isFullWidth = (text: string): boolean => fullWidthForm.test(text);

export { isFullWidth };
