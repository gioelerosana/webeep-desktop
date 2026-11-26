import { describe, expect, it } from 'vitest';
import { toCoursePage } from './course-page.js';
import type { Page } from './schemas.js';

const FILE_URL = 'https://webeep.polimi.it/webservice/pluginfile.php/1/mod_page/intro/a.pdf';
const TOKEN = 'segreto-456';
const COURSE_MODULE_ID = 9010;
const PAGE_TIME = 1700000000;

const page: Page = {
  id: 7001,
  coursemodule: COURSE_MODULE_ID,
  course: 101,
  name: 'Programma',
  intro: `<p>Benvenuti</p><a href="${FILE_URL}?token=${TOKEN}">programma</a>`,
  introfiles: [{ filename: 'a.pdf', filepath: '/', filesize: 10, fileurl: `${FILE_URL}?token=${TOKEN}`, timemodified: PAGE_TIME, mimetype: 'application/pdf' }],
  content: '<p>Testo</p>',
  contentfiles: [
    { filename: 'a.pdf', filepath: '/', filesize: 10, fileurl: `${FILE_URL}?token=${TOKEN}`, timemodified: PAGE_TIME, mimetype: 'application/pdf' },
    { filename: 'senza-url.pdf', filepath: '/', filesize: 0 },
  ],
  timemodified: PAGE_TIME,
};

describe('toCoursePage', () => {
  it('toglie il token da HTML e URL dei file, senza duplicati e senza file senza URL', () => {
    const coursePage = toCoursePage(page);

    expect(coursePage.moduleId).toBe(COURSE_MODULE_ID);
    expect(coursePage.introHtml).not.toContain(TOKEN);
    expect(coursePage.files.map((file) => file.fileurl)).toEqual([FILE_URL]);
    expect(JSON.stringify(coursePage)).not.toContain(TOKEN);
  });
});
