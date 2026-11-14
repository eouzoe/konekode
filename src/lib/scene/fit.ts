const fitStage = (root: HTMLElement): void => {
  const slot = root.querySelector<HTMLElement>('.drill-slot');
  const stage = slot?.parentElement;
  if (slot === null || stage === null || stage === undefined) {
    return;
  }
  slot.style.zoom = '1';
  const need = slot.scrollHeight;
  const have = stage.clientHeight;
  if (have > 0 && need > have) {
    slot.style.zoom = String(have / need);
  }
};

export { fitStage };
