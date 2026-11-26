import type { SnippetOptions } from '@/eui/contract';
import type { Html } from '@effect/ui/html';

const Snippet = <Msg>(h: Html.H<Msg>, options: SnippetOptions) =>
  h.pre.class('part-snippet').attr('data-part', 'snippet').children(options.text);

export { Snippet };
