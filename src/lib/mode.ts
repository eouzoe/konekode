type Mode = 'dev' | 'live';

const siteMode = (): Mode => {
  if (import.meta.env.PUBLIC_MODE === 'dev') {
    return 'dev';
  }
  return 'live';
};

export { siteMode, type Mode };
