const fitSlot = (slot: HTMLElement): void => {
  const stage = slot.parentElement;
  if (stage === null || slot.offsetParent === null) {
    return;
  }
  slot.style.zoom = '1';
  const need = slot.scrollHeight;
  const have = stage.clientHeight;
  if (have > 0 && need > have) {
    slot.style.zoom = String(have / need);
  }
};

const fitStage = (root: HTMLElement): void => {
  for (const slot of root.querySelectorAll<HTMLElement>('.drill-slot, .run-slot')) {
    fitSlot(slot);
  }
};

const watchStage = (root: HTMLElement): void => {
  fitStage(root);
  const watcher = new ResizeObserver(() => {
    fitStage(root);
  });
  for (const part of root.querySelectorAll<HTMLElement>('.run-slot > *, .drill-slot > *')) {
    watcher.observe(part);
  }
};

export { fitStage, watchStage };
