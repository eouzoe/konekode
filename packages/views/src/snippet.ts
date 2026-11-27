import type { Html } from '@effect/ui/html';
import type { SnippetOptions } from '@konekode/contracts/parts';

const Snippet = <Msg>(h: Html.H<Msg>, options: SnippetOptions) =>
  h.pre.class('part-snippet').attr('data-part', 'snippet').children(options.text);

export { Snippet };
