import { type Html } from '@effect/ui/html';

import { type ProgressOptions } from '@/eui/contract';

const Progress = <Msg>(h: Html.H<Msg>, options: ProgressOptions) =>
  h.div
    .class('part-progress')
    .attr('data-part', 'progress')
    .attr('data-state', options.state)
    .attr('role', 'progressbar')
    .attr('aria-valuenow', String(options.percent))
    .attr('aria-label', options.label)
    .attr('style', `--progress: ${String(options.percent)}%`)
    .children(h.span.attr('data-slot', 'label').children(options.label));

export { Progress };
