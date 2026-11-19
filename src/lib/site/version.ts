const versionPattern = /^[0-9a-z.-]{1,40}$/u;
const unknownVersion = 'dev';

const siteVersion = (): string => {
  const declared: unknown = import.meta.env.PUBLIC_SITE_VERSION;
  if (typeof declared === 'string' && versionPattern.test(declared)) {
    return declared;
  }
  return unknownVersion;
};

export { siteVersion, unknownVersion };
