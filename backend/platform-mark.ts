import strings from '@konekode/course/text/zh-TW/ui.json' with { type: 'json' };

import { fullscreenKeys, platformOf, type Platform } from '../src/lib/site/device';

const ok = 200;

const platformOfRequest = (request: Request): Platform =>
  platformOf({
    agent: request.headers.get('user-agent') ?? '',
    finePointer: true,
    hint: (request.headers.get('sec-ch-ua-platform') ?? '').replaceAll('"', ''),
    touchPoints: 0,
  });

const markRoot = (platform: Platform): HTMLRewriterTypes.HTMLRewriterElementContentHandlers => ({
  element: (element) => {
    const mark = `on-${platform}`;
    const had = element.getAttribute('class');
    if (had === null || had === '') {
      element.setAttribute('class', mark);
      return;
    }
    element.setAttribute('class', `${had} ${mark}`);
  },
});

const nameKey = (platform: Platform): HTMLRewriterTypes.HTMLRewriterElementContentHandlers => ({
  element: (element) => {
    if (platform !== 'touch') {
      element.setInnerContent(strings[fullscreenKeys[platform]]);
    }
  },
});

const markPlatform = (request: Request, page: Response): Response => {
  const html = (page.headers.get('content-type') ?? '').startsWith('text/html');
  if (page.status !== ok || !html) {
    return page;
  }
  const platform = platformOfRequest(request);
  const marked = new HTMLRewriter()
    .on('html', markRoot(platform))
    .on('[data-fullscreen-key]', nameKey(platform))
    .transform(page);
  const headers = new Headers(marked.headers);
  headers.delete('etag');
  headers.append('vary', 'User-Agent, Sec-CH-UA-Platform');
  return new Response(marked.body, {
    headers,
    status: marked.status,
    statusText: marked.statusText,
  });
};

export { markPlatform, platformOfRequest };
