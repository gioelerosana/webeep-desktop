/*
 * Tool dei file: `read_file`. Legge solo file di WeBeep (pluginfile.php), con il token del server.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { htmlToText } from '@webeep/moodle-api';
import { z } from 'zod';
import { downloadWebeepFile, parseFileUrl, type WebeepDownload } from '../download.js';
import type { McpDeps } from '../index.js';
import { formatBytes, lines, MAX_OUTPUT_CHARS, truncate } from '../format.js';
import { textBlock, type ToolContent } from '../tool-runner.js';
import { defineTool } from './define.js';

const FILE_URL_MAX_CHARS = 2048;
const LAST_SEGMENT = -1;
const PATH_SEPARATOR = '/';
const FALLBACK_FILE_NAME = 'file';
const BASE64_CHUNK_BYTES = 8192;
const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const HTML_MIME_TYPE = 'text/html';
const JSON_MIME_TYPE = 'application/json';
const TEXT_MIME_PREFIX = 'text/';

const READ_FILE_DESCRIPTION =
  'Legge il contenuto di un file di WeBeep (dispense, consegne, pagine allegate). fileUrl si prende dal campo ' +
  'fileUrl di get_course_contents o get_page. Restituisce il testo (le pagine HTML convertite in testo), ' +
  "le immagini, o un file binario come risorsa. Massimo 10 MB.";

// Nome nell'intestazione Content-Disposition in forma RFC 5987 (`filename*=UTF-8''…`).
// Accetta: `attachment; filename*=UTF-8''dispense%201.pdf`. Non accetta: `attachment; filename="dispense.pdf"`.
// https://regex101.com/?regex=filename%5C*%3DUTF-8''(%5B%5E%3B%5D%2B)&testString=attachment%3B%20filename*%3DUTF-8''dispense%25201.pdf%0Aattachment%3B%20filename%3D%22dispense.pdf%22&flavor=javascript&flags=i
const ENCODED_FILENAME = /filename\*=UTF-8''([^;]+)/i;
// Nome semplice nell'intestazione Content-Disposition (`filename="…"`, con o senza virgolette).
// Accetta: `attachment; filename="dispense.pdf"`. Non accetta: `inline` (nessun nome).
// https://regex101.com/?regex=filename%3D%22%3F(%5B%5E%22%3B%5D%2B)%22%3F&testString=attachment%3B%20filename%3D%22dispense.pdf%22%0Ainline&flavor=javascript&flags=i
const PLAIN_FILENAME = /filename="?([^";]+)"?/i;

/** Decodifica un percorso o un nome codificato; se la codifica è errata, si tiene il testo com'è. */
const decodeSafely = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    // Codifica non valida: meglio il nome grezzo che nessun nome.
    return text;
  }
};

const nameFromDisposition = (header: string | null): string | undefined => {
  if (header === null) return undefined;
  const encoded = ENCODED_FILENAME.exec(header)?.[1];
  if (encoded !== undefined) return decodeSafely(encoded.trim());
  const plain = PLAIN_FILENAME.exec(header)?.[1]?.trim();
  return plain === undefined || plain.length === 0 ? undefined : plain;
};

const fileNameOf = (download: WebeepDownload): string => {
  const fromHeader = nameFromDisposition(download.contentDisposition);
  if (fromHeader !== undefined) return fromHeader;
  const lastSegment = new URL(download.requestedUrl).pathname.split(PATH_SEPARATOR).filter((part) => part.length > 0).at(LAST_SEGMENT);
  return decodeSafely(lastSegment ?? FALLBACK_FILE_NAME);
};

/** Base64 a blocchi: `btoa` regge solo stringhe binarie, e lo spread su un array enorme supererebbe lo stack. */
const toBase64 = (bytes: Uint8Array): string => {
  const chunkCount = Math.ceil(bytes.byteLength / BASE64_CHUNK_BYTES);
  const binary = Array.from({ length: chunkCount }, (_, index) =>
    String.fromCharCode(...bytes.subarray(index * BASE64_CHUNK_BYTES, (index + 1) * BASE64_CHUNK_BYTES)),
  ).join('');
  return btoa(binary);
};

const isTextual = (mimeType: string): boolean => mimeType.startsWith(TEXT_MIME_PREFIX) || mimeType === JSON_MIME_TYPE;

/** Contenuto per il modello secondo il tipo: testo, immagine o risorsa binaria (docs/SERVER.md §6.4.8). */
const contentOf = (download: WebeepDownload): ToolContent => {
  const mimeType = download.contentType;
  const header = lines([
    `Nome: ${fileNameOf(download)}`,
    `Tipo: ${mimeType}`,
    `Dimensione: ${formatBytes(download.bytes.byteLength)}`,
  ]);
  if (isTextual(mimeType)) {
    const decoded = new TextDecoder('utf-8').decode(download.bytes);
    const body = mimeType === HTML_MIME_TYPE ? htmlToText(decoded) : decoded;
    return textBlock(lines([header, '', truncate(body, MAX_OUTPUT_CHARS)]));
  }
  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return [
      ...textBlock(header),
      { type: 'image', data: toBase64(download.bytes), mimeType },
    ];
  }
  return [
    ...textBlock(header),
    {
      type: 'resource',
      resource: { uri: download.requestedUrl, mimeType, blob: toBase64(download.bytes) },
    },
  ];
};

export const registerFileTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'read_file',
    description: READ_FILE_DESCRIPTION,
    schema: z.object({
      fileUrl: z.string().max(FILE_URL_MAX_CHARS),
    }),
    run: async ({ fileUrl }, { session }) => {
      const url = parseFileUrl(fileUrl);
      const download = await downloadWebeepFile(url, session.token);
      return contentOf(download);
    },
  });
};
