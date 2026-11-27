import { Button } from '@effect/ui-kit';
import { PressFeedback, type ActionOptions } from '@konekode/contracts/parts';

import type { Html } from '@effect/ui/html';

const Action = <Msg>(h: Html.H<Msg>, options: ActionOptions<Msg>) =>
  Button(h, { onPress: options.onPress, props: { disabled: options.disabled || options.busy } })
    .class('part-action')
    .attr('data-part', 'action')
    .attr('data-variant', options.variant)
    .attr('data-icon', options.icon ?? undefined)
    .attr('data-busy', String(options.busy))
    .attr('aria-label', options.label)
    .onMount(PressFeedback({ part: 'action', variant: options.variant }))
    .children(options.variant === 'icon' ? '' : options.label);

export { Action };
