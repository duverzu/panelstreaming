import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

/** Renderiza markdown (contenido creado por el admin) a HTML con estilo. */
export default function Markdown({ children }) {
  const html = marked.parse(children || '');
  return <div className="prose-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
