interface CompileRequest {
  readonly source: string;
}

type CompileReply =
  | { readonly ok: true; readonly wasm: Uint8Array }
  | { readonly message: string; readonly ok: false };

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
  | { readonly kind: 'timeout' };

export type { CompileReply, CompileRequest, Outcome, RunReply, RunRequest };
