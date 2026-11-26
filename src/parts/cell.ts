import type { CellOptions } from '@/eui/contract';
import type { Html } from '@effect/ui/html';

const Cell = <Msg>(h: Html.H<Msg>, options: CellOptions) =>
  h.div
    .class('part-cell')
    .attr('data-part', 'cell')
    .attr('data-kind', options.kind)
    .attr('data-state', options.state)
    .children(
      h.p.attr('data-slot', 'label').children(options.label),
      options.status === '' ? null : h.p.attr('data-slot', 'status').children(options.status),
      h.pre.attr('data-slot', 'text').attr('data-role', options.kind).children(options.text),
    );

export { Cell };
