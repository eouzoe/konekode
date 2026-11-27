import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { object, record, string, type infer as Infer } from 'zod';

import type { AstroIntegration } from 'astro';
import type { IncomingMessage, ServerResponse } from 'node:http';

const editSchema = object({
  id: string().min(1),
  locale: string().regex(/^[A-Za-z-]+$/u),
  text: string().trim().min(1),
  unit: string().regex(/^[a-z-]+$/u),
});
const sentencesSchema = record(string(), string());

type Edit = Infer<typeof editSchema>;

interface Files {
  readonly log: string;
  readonly text: string;
}

const route = '/__text';
const saved = 204;
const refused = 400;
const indent = 2;

const logChange = async (file: string, change: Record<string, string>): Promise<void> => {
  if (file !== '') {
    const line = { ...change, at: new Date().toISOString() };
    await appendFile(file, `${JSON.stringify(line)}\n`);
  }
};

const saveSentence = async (files: Files, { id, locale, text, unit }: Edit): Promise<void> => {
  const sentences = sentencesSchema.parse(JSON.parse(await readFile(files.text, 'utf8')));
  const before = sentences[id];
  if (before === undefined) {
    throw new Error(`no sentence called ${id}`);
  }
  if (before === text) {
    return;
  }
  const next = { ...sentences, [id]: text };
  await writeFile(files.text, `${JSON.stringify(next, null, indent)}\n`);
  await logChange(files.log, { after: text, before, id, locale, unit });
};

const filesFor = ({ locale, unit }: Edit): Files => ({
  log: process.env.TEXT_LOG ?? '',
  text: fileURLToPath(new URL(`packages/course/src/text/${locale}/${unit}.json`, import.meta.url)),
});

const bodyOf = async (request: IncomingMessage): Promise<string> => {
  request.setEncoding('utf8');
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
  }
  return body;
};

const isOurs = (request: IncomingMessage): boolean =>
  request.method === 'POST' && request.headers['sec-fetch-site'] === 'same-origin';

const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  try {
    if (!isOurs(request)) {
      throw new Error('only the page itself may save text');
    }
    const edit = editSchema.parse(JSON.parse(await bodyOf(request)));
    await saveSentence(filesFor(edit), edit);
    response.writeHead(saved).end();
  } catch (error) {
    response.writeHead(refused, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error));
  }
};

const textEditing = (): AstroIntegration => ({
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use(route, (request, response) => {
        void handle(request, response);
      });
    },
  },
  name: 'text-editing',
});

export { saveSentence, textEditing };
