const startDev = async (): Promise<void> => {
  const { mountDevPanel } = await import('./panel');
  await mountDevPanel();
};

export { startDev };
