interface CompileRequest {
  readonly source: string;
}

type CompileReply =
  | { readonly cause: 'compiler' | 'program'; readonly message: string; readonly ok: false }
  | { readonly ok: true; readonly wasm: Uint8Array };

type CompileMessage =
  | { readonly kind: 'alive' }
  | { readonly kind: 'done'; readonly reply: CompileReply }
  | { readonly kind: 'progress'; readonly percent: number };

type PrefetchMessage =
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'progress'; readonly percent: number };

interface RunRequest {
  readonly input: string;
  readonly wasm: Uint8Array;
}

interface RunReply {
  readonly exitCode: number;
  readonly output: string;
}

type Outcome =
  | { readonly exitCode: number; readonly kind: 'finished'; readonly output: string }
  | { readonly kind: 'compile-error'; readonly message: string }
  | { readonly kind: 'crashed'; readonly message: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'unavailable'; readonly message: string };

export type {
  CompileMessage,
  CompileReply,
  CompileRequest,
  Outcome,
  PrefetchMessage,
  RunReply,
  RunRequest,
};
