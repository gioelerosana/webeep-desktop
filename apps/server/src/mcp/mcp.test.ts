import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCourseContents,
  getCourseModule,
  getCourses,
  getNotifications,
  getPages,
  getSiteInfo,
  getUpcomingEvents,
  MoodleApiError,
  MoodleNetworkError,
  searchCourses,
  type CourseSection,
  type SiteInfo,
} from '@webeep/moodle-api';
import packageJson from '../../package.json';
import { loadConfig, type Config } from '../config.js';
import { createMcpHandler, type McpDeps } from './index.js';
import { createStateManager, type StateManager } from '../state/manager.js';
import type { StateStore } from '../state/store.js';
import { NOT_CONNECTED_TEXT, SESSION_EXPIRED_TEXT, UNREACHABLE_TEXT } from './errors.js';

// Solo le funzioni che i tool chiamano sono finte; errori e costanti di moodle-api restano reali.
vi.mock('@webeep/moodle-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@webeep/moodle-api')>();
  return {
    ...actual,
    getSiteInfo: vi.fn(),
    getCourses: vi.fn(),
    getCourseContents: vi.fn(),
    getCourseModule: vi.fn(),
    getPages: vi.fn(),
    getUpcomingEvents: vi.fn(),
    getNotifications: vi.fn(),
    searchCourses: vi.fn(),
  };
});

const FAKE_TOKEN = 'token-finto-di-prova-0123456789';
const SESSION_KEY = Buffer.alloc(32, 9);
const JSON_RPC_VERSION = '2.0';
const WEBEEP_FILE_URL = 'https://webeep.polimi.it/webservice/pluginfile.php/10/mod_resource/content/1/dispense.txt';
const WEBEEP_FILE_URL_WITH_TOKEN = `${WEBEEP_FILE_URL}?token=${FAKE_TOKEN}`;
const NOW_SECONDS = 1_800_000_000;

const siteInfo: SiteInfo = {
  sitename: 'WeBeep',
  siteurl: 'https://webeep.polimi.it',
  username: 'mario.rossi',
  firstname: 'Mario',
  lastname: 'Rossi',
  fullname: 'Mario Rossi',
  userid: 42,
  userpictureurl: 'https://webeep.polimi.it/pix/u/f1.png',
};

const createConfig = (): Config =>
  loadConfig({
    WEBEEP_PUBLIC_URL: 'https://server.example.it',
    WEBEEP_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    WEBEEP_OIDC_ISSUER: 'https://auth.example.it/application/o/webeep',
    WEBEEP_OIDC_CLIENT_ID: 'webeep-server-di-prova',
    WEBEEP_OIDC_CLIENT_SECRET: 'segreto-client-di-prova',
  });

const createMemoryStore = (): StateStore => {
  let stored: Uint8Array | null = null;
  return {
    get: async () => stored,
    put: async (bytes) => {
      stored = bytes;
    },
  };
};

const createStore = async (connected: boolean): Promise<StateManager> => {
  const store = await createStateManager({ store: createMemoryStore(), secretKey: SESSION_KEY });
  if (connected) {
    await store.update((state) => ({
      ...state,
      webeep: { siteUrl: 'https://webeep.polimi.it', token: FAKE_TOKEN },
    }));
  }
  return store;
};

type ToolResult = {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly isError?: boolean;
};

let requestId = 0;

const rpc = async (handler: ReturnType<typeof createMcpHandler>, method: string, params: unknown): Promise<Response> => {
  requestId += 1;
  const request = new Request('https://server.example.it/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id: requestId, method, params }),
  });
  return handler.handle(request);
};

const callTool = async (
  handler: ReturnType<typeof createMcpHandler>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> => {
  const response = await rpc(handler, 'tools/call', { name, arguments: args });
  const body = (await response.json()) as { result: ToolResult };
  return body.result;
};

const textOf = (result: ToolResult): string =>
  result.content.map((block) => block.text ?? '').join('\n');

const courseSections: readonly CourseSection[] = [
  {
    id: 1,
    name: 'Introduzione',
    section: 0,
    summary: '',
    visible: true,
    uservisible: true,
    modules: [
      {
        id: 45,
        name: 'Dispense',
        modname: 'resource',
        visible: true,
        uservisible: true,
        description: '<p>Le <b>dispense</b> della lezione</p>',
        contents: [
          {
            type: 'file',
            filename: 'dispense.txt',
            filesize: 2048,
            fileurl: WEBEEP_FILE_URL_WITH_TOKEN,
            timemodified: NOW_SECONDS,
            mimetype: 'text/plain',
          },
        ],
      },
    ],
  },
];

describe('server MCP', () => {
  let handler: ReturnType<typeof createMcpHandler>;
  let store: StateManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = await createStore(true);
    handler = createMcpHandler({ config: createConfig(), store } as McpDeps);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('risponde a initialize con nome, versione e capacità tool', async () => {
    const response = await rpc(handler, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    });
    const body = (await response.json()) as { result: { serverInfo: { name: string; version: string }; capabilities: { tools?: unknown } } };
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.result.serverInfo).toEqual({ name: 'webeep', version: packageJson.version });
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('elenca gli otto tool, tutti di sola lettura, con schema di input', async () => {
    const response = await rpc(handler, 'tools/list', {});
    const body = (await response.json()) as {
      result: { tools: readonly { name: string; annotations?: { readOnlyHint?: boolean }; inputSchema: unknown }[] };
    };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      'whoami',
      'list_courses',
      'get_course_contents',
      'get_upcoming_deadlines',
      'list_notifications',
      'search_courses',
      'get_page',
      'read_file',
    ]);
    body.result.tools.forEach((tool) => {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema).toBeDefined();
    });
  });

  it('risponde 202 senza corpo alle notifiche', async () => {
    const request = new Request('https://server.example.it/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: JSON_RPC_VERSION, method: 'notifications/initialized' }),
    });
    const response = await handler.handle(request);
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  it('risponde 405 a GET su /mcp', async () => {
    const response = await handler.handle(new Request('https://server.example.it/mcp', { method: 'GET' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('whoami restituisce il profilo senza il token', async () => {
    vi.mocked(getSiteInfo).mockResolvedValue(siteInfo);
    const result = await callTool(handler, 'whoami');
    const text = textOf(result);
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Mario Rossi');
    expect(text).toContain('Stato: collegato');
    expect(text).not.toContain(FAKE_TOKEN);
  });

  it('senza accoppiamento ogni tool risponde con l errore dedicato', async () => {
    const disconnected = await createStore(false);
    const offline = createMcpHandler({ config: createConfig(), store: disconnected } as McpDeps);
    const result = await callTool(offline, 'whoami');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(NOT_CONNECTED_TEXT);
    expect(getSiteInfo).not.toHaveBeenCalled();
  });

  it('list_courses elenca i corsi in corso con id e preferito', async () => {
    vi.mocked(getCourses).mockResolvedValue([
      { id: 7, fullname: 'Analisi 1', shortname: 'AM1', summary: '', isfavourite: true, hidden: false },
    ]);
    const result = await callTool(handler, 'list_courses');
    expect(getCourses).toHaveBeenCalledWith(expect.anything(), 'inprogress');
    expect(textOf(result)).toContain('id 7: Analisi 1 (AM1) · preferito: sì');
  });

  it('parametri non validi danno il nome del campo, non il valore', async () => {
    const result = await callTool(handler, 'get_course_contents', { courseId: 'valore-segreto' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('parametri non validi: courseId');
    expect(textOf(result)).not.toContain('valore-segreto');
  });

  it('get_course_contents mostra descrizioni in testo e fileUrl senza token', async () => {
    vi.mocked(getCourseContents).mockResolvedValue(courseSections);
    const result = await callTool(handler, 'get_course_contents', { courseId: 3 });
    const text = textOf(result);
    expect(result.isError).toBeFalsy();
    expect(text).toContain('cmid 45 · resource: Dispense');
    expect(text).toContain('Le dispense della lezione');
    expect(text).toContain(`fileUrl: ${WEBEEP_FILE_URL}`);
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).not.toContain('<b>');
  });

  it('get_upcoming_deadlines scarta le scadenze oltre la finestra', async () => {
    const now = Math.floor(Date.now() / 1000);
    const inWindow = now + 3_600;
    const outside = now + 30 * 86_400;
    vi.mocked(getUpcomingEvents).mockResolvedValue([
      { id: 1, name: 'Consegna 1', eventtype: 'due', timestart: inWindow, timeduration: 0, overdue: false, description: '', course: { id: 7, fullname: 'Analisi 1' } },
      { id: 2, name: 'Consegna lontana', eventtype: 'due', timestart: outside, timeduration: 0, overdue: false, description: '' },
    ]);
    const result = await callTool(handler, 'get_upcoming_deadlines', { days: 7 });
    const text = textOf(result);
    expect(text).toContain('Consegna 1');
    expect(text).toContain('Analisi 1');
    expect(text).not.toContain('Consegna lontana');
  });

  it('list_notifications non chiama le funzioni di scrittura', async () => {
    vi.mocked(getNotifications).mockResolvedValue({
      unreadcount: 1,
      notifications: [
        {
          id: 1,
          subject: 'Nuovo messaggio',
          smallmessage: '<p>Anteprima</p>',
          read: false,
          timecreated: NOW_SECONDS,
          timeread: null,
          componentlabel: 'Forum',
        },
      ],
    });
    const result = await callTool(handler, 'list_notifications', { unreadOnly: true });
    expect(textOf(result)).toContain('Nuovo messaggio');
    expect(textOf(result)).toContain('Anteprima');
    expect(getNotifications).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 42 }));
  });

  it('search_courses segnala se il corso è già iscritto', async () => {
    vi.mocked(searchCourses).mockResolvedValue({
      total: 1,
      courses: [
        {
          id: 7,
          fullname: 'Analisi 1',
          shortname: 'AM1',
          displayname: undefined,
          courseimage: undefined,
          categoryid: 1,
          categoryname: undefined,
          summary: '',
          contacts: [],
          enrollmentmethods: [],
        },
      ],
    });
    vi.mocked(getCourses).mockResolvedValue([{ id: 7, fullname: 'Analisi 1', shortname: 'AM1', summary: '', isfavourite: false, hidden: false }]);
    const result = await callTool(handler, 'search_courses', { query: 'analisi' });
    expect(textOf(result)).toContain('risultati totali: 1');
    expect(textOf(result)).toContain('iscritto');
  });

  it('get_page rifiuta un modulo che non è una pagina', async () => {
    vi.mocked(getCourseModule).mockResolvedValue({
      id: 5,
      course: 3,
      module: 1,
      name: 'Compito',
      modname: 'assign',
      visible: true,
      uservisible: true,
    });
    const result = await callTool(handler, 'get_page', { cmid: 5 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('il modulo indicato non è una pagina');
    expect(getPages).not.toHaveBeenCalled();
  });

  it('un token scaduto cancella la sessione e chiede di ricollegare', async () => {
    vi.mocked(getSiteInfo).mockRejectedValue(new MoodleApiError('invalidtoken', 'Invalid token', 'core_webservice_get_site_info'));
    const result = await callTool(handler, 'whoami');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(SESSION_EXPIRED_TEXT);
    expect((await store.read()).webeep).toBeNull();
  });

  it('WeBeep non raggiungibile dà il messaggio dedicato, senza dettagli', async () => {
    vi.mocked(getSiteInfo).mockRejectedValue(new MoodleNetworkError(`Impossibile contattare https://x?token=${FAKE_TOKEN}`, undefined));
    const result = await callTool(handler, 'whoami');
    expect(textOf(result)).toBe(UNREACHABLE_TEXT);
    expect(textOf(result)).not.toContain(FAKE_TOKEN);
  });

  it('read_file rifiuta URL esterni senza fare alcuna richiesta', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callTool(handler, 'read_file', { fileUrl: 'https://esempio.org/pluginfile.php/1/a.pdf' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('URL non valido: sono accettati solo file di WeBeep (pluginfile.php)');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('read_file rifiuta URL con token nella query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callTool(handler, 'read_file', { fileUrl: WEBEEP_FILE_URL_WITH_TOKEN });
    expect(textOf(result)).toContain('URL non valido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('read_file restituisce il testo di un file di WeBeep', async () => {
    const fetchMock = vi.fn(async (_input: string, _init: RequestInit) =>
      new Response('Ciao dalle dispense', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await callTool(handler, 'read_file', { fileUrl: WEBEEP_FILE_URL });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('Ciao dalle dispense');
    expect(textOf(result)).toContain('Tipo: text/plain');
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain(`token=${FAKE_TOKEN}`);
  });

  it('read_file interrompe lo stream oltre 10 MB anche senza Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(oversized, { status: 200, headers: { 'Content-Type': 'application/pdf' } })));
    const result = await callTool(handler, 'read_file', { fileUrl: WEBEEP_FILE_URL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('file troppo grande (massimo 10 MB)');
  });

  it('read_file non segue un redirect verso un altro host', async () => {
    const fetchMock = vi.fn(async (_input: string, _init: RequestInit) =>
      new Response(null, { status: 302, headers: { Location: 'https://altro.example.org/file.pdf?token=' + FAKE_TOKEN } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await callTool(handler, 'read_file', { fileUrl: WEBEEP_FILE_URL });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('WeBeep ha reindirizzato il file fuori dal sito: operazione annullata');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(textOf(result)).not.toContain(FAKE_TOKEN);
  });
});
