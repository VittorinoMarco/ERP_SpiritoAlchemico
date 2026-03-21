import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.setOptions({
  gfm: true,
  breaks: true
});

/**
 * Converte Markdown in HTML sanitizzato per {@html} nelle bolle chat.
 */
export function markdownToSafeHtml(src: string): string {
  const raw = marked.parse(src || '', { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    // consenti link esterni sicuri
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  });
}
