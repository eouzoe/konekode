import type { Html } from '@effect/ui/html';
import type { ChapterOptions } from '@konekode/contracts/parts';

const Chapter = <Msg>(h: Html.H<Msg>, options: ChapterOptions) =>
  h.p
    .class('part-chapter')
    .attr('data-part', 'chapter')
    .children(
      h.span.attr('data-slot', 'number').children(options.number),
      h.span.attr('data-slot', 'name').children(options.name),
    );

export { Chapter };
