import type { NoticeOptions } from '@/eui/contract';
import type { Html } from '@effect/ui/html';

const Notice = <Msg>(h: Html.H<Msg>, options: NoticeOptions) =>
  h.p
    .class('part-notice')
    .attr('data-part', 'notice')
    .attr('data-kind', options.kind)
    .attr('role', 'status')
    .children(options.text);

export { Notice };
