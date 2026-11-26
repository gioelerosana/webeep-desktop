/*
 * Tool sui corsi: `list_courses`, `search_courses`, `get_course_contents`.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import {
  getCourseContents,
  getCourses,
  htmlToText,
  type Course,
  type CourseModule,
  type CourseSection,
  type ModuleContent,
} from '@webeep/moodle-api';
import { z } from 'zod';
import type { McpDeps } from '../index.js';
import { formatBytes, formatIsoRome, lines, MAX_DESCRIPTION_CHARS, truncate, yesNo } from '../format.js';
import { textBlock } from '../tool-runner.js';
import { defineTool } from './define.js';

const COURSE_ID_MIN = 1;
const NO_RESULTS = 'nessun risultato';

const LIST_COURSES_DESCRIPTION =
  'Elenca i corsi iscritti su WeBeep con id, nome, nome breve e se sono tra i preferiti. ' +
  "Usalo per trovare l'id di un corso da passare agli altri tool. La classificazione sceglie il gruppo: " +
  'inprogress (in corso, predefinito), past (passati), future (futuri), all (tutti).';

const COURSE_CONTENTS_DESCRIPTION =
  "Mostra le sezioni e i materiali di un corso: per ogni modulo cmid, tipo, nome, descrizione in testo e i file " +
  'con dimensione, data e mimetype. Il campo fileUrl di un file (URL senza token) è quello da passare a read_file ' +
  "per leggerne il contenuto. Usalo dopo list_courses per l'id del corso.";

const CLASSIFICATION_LABELS: Readonly<Record<'inprogress' | 'past' | 'future' | 'all', string>> = {
  inprogress: 'in corso',
  past: 'passati',
  future: 'futuri',
  all: 'tutti',
};

const courseLine = (course: Course): string =>
  `- id ${course.id}: ${course.fullname} (${course.shortname}) · preferito: ${yesNo(course.isfavourite)}`;

const fileLine = (file: ModuleContent): string => {
  const details = [
    file.filesize > 0 ? formatBytes(file.filesize) : undefined,
    file.timemodified !== undefined ? formatIsoRome(file.timemodified) : undefined,
    file.mimetype,
    file.fileurl !== undefined ? `fileUrl: ${file.fileurl}` : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return `  - ${[`${file.filename} (${file.type})`, ...details].join(' · ')}`;
};

const moduleBlock = (module: CourseModule): readonly string[] => {
  const description = htmlToText(module.description ?? '');
  const descriptionRow = description.length > 0 ? [`  Descrizione: ${truncate(description, MAX_DESCRIPTION_CHARS)}`] : [];
  const fileRows = module.contents.map(fileLine);
  return [`- cmid ${module.id} · ${module.modname}: ${module.name}`, ...descriptionRow, ...fileRows];
};

const sectionBlock = (section: CourseSection, position: number): readonly string[] => {
  const sectionNumber = section.section ?? position;
  const modules = section.modules.filter((module) => module.uservisible).flatMap(moduleBlock);
  return [`Sezione ${sectionNumber}: ${section.name}`, ...modules];
};

export const registerCourseTools = (server: McpServer, deps: McpDeps): void => {
  defineTool(server, deps, {
    name: 'list_courses',
    description: LIST_COURSES_DESCRIPTION,
    schema: z.object({
      classification: z.enum(['inprogress', 'past', 'future', 'all']).default('inprogress'),
    }),
    run: async ({ classification }, { client }) => {
      const courses = await getCourses(client, classification);
      if (courses.length === 0) return textBlock(NO_RESULTS);
      return textBlock(
        lines([`Corsi (${CLASSIFICATION_LABELS[classification]}): ${courses.length}`, ...courses.map(courseLine)]),
      );
    },
  });

  defineTool(server, deps, {
    name: 'get_course_contents',
    description: COURSE_CONTENTS_DESCRIPTION,
    schema: z.object({
      courseId: z.number().int().min(COURSE_ID_MIN),
    }),
    run: async ({ courseId }, { client }) => {
      const sections = await getCourseContents(client, courseId);
      if (sections.length === 0) return textBlock(NO_RESULTS);
      const body = sections.flatMap((section, position) => sectionBlock(section, position));
      return textBlock(lines([`Corso ${courseId}: ${sections.length} sezioni`, ...body]));
    },
  });
};
