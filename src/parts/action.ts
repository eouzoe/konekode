import { Button } from '@effect/ui-kit';
import { type Html } from '@effect/ui/html';

import { type ActionOptions } from '@/eui/contract';

const Action = <Msg>(h: Html.H<Msg>, options: ActionOptions<Msg>) =>
  Button(h, { onPress: options.onPress, props: { disabled: options.disabled } })
    .class('part-action')
    .attr('data-part', 'action')
    .attr('data-variant', options.variant)
    .children(options.label);

export { Action };
