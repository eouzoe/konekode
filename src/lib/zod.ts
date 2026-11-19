import { config } from 'zod';

config({ jitless: true });

export {
  array,
  boolean,
  int,
  literal,
  nullable,
  number,
  object,
  record,
  string,
  union,
  type infer,
  type ZodType,
} from 'zod';
