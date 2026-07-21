/**
 * revisar-frontend.mjs — busca variables usadas y no definidas en el frontend.
 *
 * El `npm run build` NO detecta esto: JavaScript solo falla al ejecutarse, así
 * que una constante renombrada compila bien y deja la página en blanco.
 *
 *   node scripts/revisar-frontend.mjs
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
// Se importa por ruta porque acorn vive en frontend/node_modules, no en la raíz
import { Parser } from '../frontend/node_modules/acorn/dist/acorn.mjs';
import { createRequire } from 'module';
const jsx = createRequire(import.meta.url)('../frontend/node_modules/acorn-jsx');

const JSXParser = Parser.extend(jsx());

// Se resuelve desde la ubicación del script, no desde donde se ejecute:
// así funciona igual con `npm run build` (que corre dentro de frontend/).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = join(REPO, 'frontend', 'src');
const archivos = [];
(function rec(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) rec(p);
    else if (/\.jsx?$/.test(e)) archivos.push(p);
  }
})(RAIZ);

// Globales del navegador y del lenguaje que siempre existen
const GLOBALES = new Set([
  'window', 'document', 'console', 'fetch', 'navigator', 'location', 'localStorage',
  'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
  'Error', 'Promise', 'Map', 'Set', 'Intl', 'URL', 'URLSearchParams', 'alert',
  'confirm', 'prompt', 'FormData', 'Blob', 'File', 'Image', 'AbortController',
  'requestAnimationFrame', 'atob', 'btoa', 'structuredClone', 'undefined', 'NaN', 'Infinity',
  'globalThis', 'process', 'CustomEvent', 'Event', 'HTMLElement',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'Symbol', 'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
  'TextEncoder', 'TextDecoder', 'crypto', 'performance', 'history', 'screen', 'matchMedia',
  'FileReader', 'Audio', 'Notification', 'IntersectionObserver', 'ResizeObserver', 'WebSocket',
]);

let fallos = 0;
for (const archivo of archivos) {
  const codigo = readFileSync(archivo, 'utf8');
  let ast;
  try {
    ast = JSXParser.parse(codigo, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.log(`❌ ${archivo.replace(REPO + '/', '')}: no se pudo analizar (${e.message})`);
    fallos++;
    continue;
  }

  // Todo lo declarado en el archivo (imports, const/let/var, funciones, clases)
  const declarados = new Set();
  const usados = [];

  (function recorrer(nodo, dentroDeParam = false) {
    if (!nodo || typeof nodo !== 'object') return;
    switch (nodo.type) {
      case 'ImportDefaultSpecifier': case 'ImportSpecifier': case 'ImportNamespaceSpecifier':
        declarados.add(nodo.local.name); break;
      case 'VariableDeclarator': case 'FunctionDeclaration': case 'ClassDeclaration':
        (function ids(t) {
          if (!t) return;
          if (t.type === 'Identifier') declarados.add(t.name);
          else if (t.type === 'ObjectPattern') t.properties.forEach((p) => ids(p.value || p.argument));
          else if (t.type === 'ArrayPattern') t.elements.forEach(ids);
          else if (t.type === 'AssignmentPattern') ids(t.left);
          else if (t.type === 'RestElement') ids(t.argument);
        })(nodo.id);
        break;
      case 'CatchClause':
        // `catch (err)` declara `err` dentro del bloque
        (function ids(t) {
          if (!t) return;
          if (t.type === 'Identifier') declarados.add(t.name);
          else if (t.type === 'ObjectPattern') t.properties.forEach((x) => ids(x.value || x.argument));
          else if (t.type === 'ArrayPattern') t.elements.forEach(ids);
        })(nodo.param);
        break;
      case 'Identifier':
        usados.push(nodo); break;
    }
    // Parámetros de funciones cuentan como declarados
    if (nodo.params) nodo.params.forEach((p) => {
      (function ids(t) {
        if (!t) return;
        if (t.type === 'Identifier') declarados.add(t.name);
        else if (t.type === 'ObjectPattern') t.properties.forEach((x) => ids(x.value || x.argument));
        else if (t.type === 'ArrayPattern') t.elements.forEach(ids);
        else if (t.type === 'AssignmentPattern') ids(t.left);
        else if (t.type === 'RestElement') ids(t.argument);
      })(p);
    });
    for (const clave of Object.keys(nodo)) {
      const v = nodo[clave];
      if (clave === 'property' && !nodo.computed) continue;  // obj.prop no es una variable
      if (clave === 'key' && !nodo.computed) continue;       // { clave: ... } tampoco
      if (nodo.type === 'ExportSpecifier' && clave === 'exported') continue;  // export { X as Y }
      if (nodo.type === 'ImportSpecifier' && clave === 'imported') continue;  // import { X as Y }
      if (nodo.type === 'MemberExpression' && clave === 'property' && !nodo.computed) continue;
      if (Array.isArray(v)) v.forEach((x) => recorrer(x));
      else if (v && typeof v.type === 'string') recorrer(v);
    }
  })(ast);

  for (const id of usados) {
    if (declarados.has(id.name) || GLOBALES.has(id.name)) continue;
    console.log(`❌ ${archivo.replace(REPO + '/', '')}:${id.loc.start.line} → "${id.name}" se usa pero no está definida`);
    fallos++;
  }
}

console.log(fallos ? `\n${fallos} problema(s) encontrado(s)` : '\n✅ Sin variables indefinidas en el frontend');
process.exit(fallos ? 1 : 0);
