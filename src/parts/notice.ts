import { type Html } from '@effect/ui/html';

import { type NoticeOptions } from '@/eui/contract';

const Notice = <Msg>(h: Html.H<Msg>, options: NoticeOptions) =>
  h.p
    .class('part-notice')
    .attr('data-part', 'notice')
    .attr('data-kind', options.kind)
    .attr('role', 'status')
    .children(options.text);

export { Notice };
