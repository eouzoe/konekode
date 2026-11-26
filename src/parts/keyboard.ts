import type { KeyboardOptions } from '@/eui/contract';
import type { Html } from '@effect/ui/html';

const Keyboard = <Msg>(h: Html.H<Msg>, options: KeyboardOptions) =>
  h.div
    .class('part-keyboard')
    .attr('data-part', 'keyboard')
    .attr('aria-hidden', 'true')
    .children(
      h.p.attr('data-slot', 'mode').children(options.mode),
      options.rows.map((row, at) =>
        h.div
          .key(String(at))
          .class('row')
          .children(
            row.map((cap, place) =>
              h.span
                .key(`${cap.key}-${String(place)}`)
                .class('key')
                .attr('data-key', cap.key)
                .attr('data-state', cap.state)
                .attr('data-wide', String(cap.wide))
                .children(cap.label),
            ),
          ),
      ),
    );

export { Keyboard };
