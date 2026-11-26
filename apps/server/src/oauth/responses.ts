/*
 * Risposte del modulo OAuth. Gli errori dei percorsi OAuth seguono RFC 6749 §5.2
 * (`{ error, error_description }`); ogni risposta porta `Cache-Control: no-store`.
 */
import { emptyResponse, jsonResponse } from '../http/responses.js';

export const oauthError = (status: number, error: string, description: string): Response =>
  jsonResponse(status, { error, error_description: description });

/** Risposta HTML con le intestazioni di sicurezza della pagina di autorizzazione. */
export const htmlResponse = (status: number, body: string, contentSecurityPolicy: string): Response =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': contentSecurityPolicy,
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    },
  });

/** Redirect 302 verso `redirect_uri` (RFC 6749 §4.1.2). */
export const redirectResponse = (location: string): Response =>
  emptyResponse(302, { Location: location });

export const methodNotAllowed = (allow: string): Response => emptyResponse(405, { Allow: allow });
