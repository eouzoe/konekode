import type { PaperOptions } from '@/eui/contract';
import type { View } from '@effect/ui';
import type { Html } from '@effect/ui/html';

const Paper = <Msg, Body extends View.Children<Msg>>(h: Html.H<Msg>, options: PaperOptions<Body>) =>
  h.section
    .class('part-paper')
    .attr('data-part', 'paper')
    .attr('data-state', options.state)
    .attr('data-owner', options.owner)
    .children(
      h.p.attr('data-slot', 'title').children(options.title),
      h.div.attr('data-slot', 'body').children(options.body),
      h.p.attr('data-slot', 'mode').children(options.mode),
      options.hint === '' ? null : h.p.attr('data-slot', 'hint').children(options.hint),
    );

export { Paper };
