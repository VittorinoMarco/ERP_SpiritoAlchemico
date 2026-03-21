<script lang="ts">
  import { markdownToSafeHtml } from '$lib/utils/renderMarkdown';

  /** Testo Markdown (risposta assistente). */
  export let content = '';

  $: html = markdownToSafeHtml(content);
</script>

<div class="assistant-markdown">
  {@html html}
</div>

<style>
  .assistant-markdown :global(p) {
    margin: 0.4em 0;
  }
  .assistant-markdown :global(p:first-child) {
    margin-top: 0;
  }
  .assistant-markdown :global(p:last-child) {
    margin-bottom: 0;
  }
  .assistant-markdown :global(ul),
  .assistant-markdown :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.35rem;
  }
  .assistant-markdown :global(li) {
    margin: 0.2em 0;
  }
  .assistant-markdown :global(strong) {
    font-weight: 600;
  }
  .assistant-markdown :global(a) {
    color: #b8860b;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .assistant-markdown :global(code) {
    font-size: 0.88em;
    background: rgba(0, 0, 0, 0.07);
    padding: 0.12em 0.4em;
    border-radius: 0.25rem;
  }
  .assistant-markdown :global(pre) {
    margin: 0.5em 0;
    padding: 0.65rem 0.85rem;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 0.5rem;
    overflow-x: auto;
    font-size: 0.85em;
  }
  .assistant-markdown :global(pre code) {
    background: none;
    padding: 0;
  }
  .assistant-markdown :global(h1),
  .assistant-markdown :global(h2),
  .assistant-markdown :global(h3) {
    font-weight: 700;
    margin: 0.65em 0 0.35em;
    line-height: 1.25;
  }
  .assistant-markdown :global(h1) {
    font-size: 1.05em;
  }
  .assistant-markdown :global(h2) {
    font-size: 1em;
  }
  .assistant-markdown :global(h3) {
    font-size: 0.95em;
  }
  .assistant-markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88em;
    margin: 0.5em 0;
  }
  .assistant-markdown :global(th),
  .assistant-markdown :global(td) {
    border: 1px solid rgba(0, 0, 0, 0.12);
    padding: 0.35em 0.5em;
    text-align: left;
    vertical-align: top;
  }
  .assistant-markdown :global(th) {
    font-weight: 600;
    background: rgba(0, 0, 0, 0.04);
  }
  .assistant-markdown :global(blockquote) {
    margin: 0.5em 0;
    padding-left: 0.85em;
    border-left: 3px solid rgba(245, 213, 71, 0.85);
    color: #4b5563;
  }
  .assistant-markdown :global(hr) {
    margin: 0.75em 0;
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
</style>
