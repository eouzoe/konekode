import type { DialogueOptions } from '@/eui/contract';
import type { Html } from '@effect/ui/html';

const Dialogue = <Msg>(h: Html.H<Msg>, options: DialogueOptions<Msg>) =>
  h.div
    .class('part-dialogue')
    .attr('data-part', 'dialogue')
    .attr('data-state', options.state)
    .on('click', options.onPress)
    .children(
      h.span.class('who').attr('data-slot', 'who').children(options.who),
      h.div
        .class('words')
        .attr('data-slot', 'words')
        .children(
          options.lines.map((line) =>
            h.p.key(line.id).attr('data-beat-id', line.id).children(line.text),
          ),
        ),
      options.more
        ? h.span.class('more').attr('data-slot', 'more').attr('aria-hidden', 'true').children('▼')
        : null,
      h.p
        .class('note')
        .attr('data-slot', 'note')
        .attr('aria-live', 'polite')
        .children(options.note),
    );

export { Dialogue };
