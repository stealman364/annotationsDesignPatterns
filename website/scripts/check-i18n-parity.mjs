import assert from 'node:assert/strict';
import { languages, markdownFiles } from './content-sources.mjs';
const [es, en] = languages.map(({ source }) => markdownFiles(source));
assert(es.length > 0, 'Spanish source documentation is empty.');
assert.deepEqual(en, es, 'Spanish and English source paths must match exactly.');
console.log(`Documentation parity OK: ${es.length} Spanish and ${en.length} English pages.`);
