// Checks of the static download site in ../site (no build step, no external requests, strict CSP, three languages).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const PAGES = ['index', 'download', 'manual', 'faq', 'about', 'support', 'legal', 'roadmap'];
const LANGS = ['lt', 'ru', 'en'];
const MAIN_LANG = 'lt';
const read = file => fs.readFileSync(file, 'utf8');
const pageHtml = page => read(path.join(SITE, page + '.html'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const siteFiles = walk(SITE);
const textFiles = siteFiles.filter(f => /\.(html|js|css|svg|xml|txt)$/.test(f) || path.basename(f) === '_headers');

function loadScripts(files) {
  const window = {};
  const context = vm.createContext({ window });
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return window;
}
const i18n = loadScripts(LANGS.map(l => path.join(SITE, 'i18n', l + '.js'))).PA_I18N;
const config = loadScripts([path.join(SITE, 'config.js')]).PA_CONFIG;

// All HTML fragments of a page: the page itself and every text that can be inserted into it.
function allHtml() {
  return [...PAGES.map(p => ({ where: p + '.html', html: pageHtml(p) })), ...LANGS.flatMap(l => Object.entries(i18n[l]).map(([k, v]) => ({ where: `${l}:${k}`, html: v })))];
}

function usedKeys() {
  const keys = new Set();
  for (const page of PAGES) {
    const html = pageHtml(page);
    for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) keys.add(pair.split(':')[1].trim());
  }
  for (const m of read(path.join(SITE, 'assets', 'app.js')).matchAll(/\bt\('([^']+)'\)/g)) keys.add(m[1]);
  return keys;
}

function idsOf(page) { return new Set([...pageHtml(page).matchAll(/\sid="([^"]+)"/g)].map(m => m[1])); }

test('every page exists and has the shared structure', () => {
  for (const page of PAGES) {
    const html = pageHtml(page);
    assert.match(html, /^<!doctype html>/i, page);
    assert.match(html, /<html lang="lt">/, page);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, page);
    assert.match(html, /<main id="main"/, page);
    assert.match(html, /<header class="site-header">/, page);
    assert.match(html, /<footer class="site-footer">/, page);
    assert.match(html, /<nav class="site-nav" aria-label=/, page);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, page + ': exactly one h1');
    for (const lang of LANGS) assert.match(html, new RegExp(`<button type="button" data-lang="${lang}" lang="${lang}"`), `${page}: language button ${lang}`);
    for (const p of PAGES) assert.ok(html.includes(`href="${p}.html"`), `${page}: link to ${p}`);
  }
});

test('HTML tags are balanced on every page', () => {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  for (const page of PAGES) {
    const stack = [];
    const html = pageHtml(page).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
      const [, closing, rawName] = m;
      const name = rawName.toLowerCase();
      if (VOID.has(name)) continue;
      if (!closing) { stack.push(name); continue; }
      assert.equal(stack.pop(), name, `${page}: </${name}> closes the wrong element`);
    }
    assert.deepEqual(stack, [], `${page}: unclosed elements`);
  }
});

test('pages, texts, styles and the sitemap reference only existing local files and anchors', () => {
  for (const { where, html } of allHtml()) {
    for (const m of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
      const ref = m[1];
      if (/^(https?:|mailto:)/i.test(ref)) continue;
      assert.ok(ref.length > 0, `${where}: empty reference`);
      const [file, anchor] = ref.split('#');
      if (file) assert.ok(fs.existsSync(path.join(SITE, file)), `${where}: missing local file ${file}`);
      if (!anchor) continue;
      // An anchor must exist on the linked page; a bare #anchor on every page that shows this text.
      const targets = file ? [file.replace(/\.html$/, '')] : where.endsWith('.html') ? [where.replace(/\.html$/, '')] : PAGES.filter(p => pageHtml(p).includes(`"${where.split(':')[1]}"`));
      assert.ok(targets.length > 0, `${where}: no page shows this text`);
      for (const t of targets) assert.ok(idsOf(t).has(anchor), `${where}: missing anchor #${anchor} on ${t}.html`);
    }
  }
  for (const m of read(path.join(SITE, 'assets', 'style.css')).matchAll(/url\(([^)]*)\)/g)) assert.fail('style.css must not use url(): ' + m[1]);
  const sitemap = read(path.join(SITE, 'sitemap.xml'));
  const listed = [...sitemap.matchAll(/<loc>https:\/\/kontas\.download\/([^<]*)<\/loc>/g)].map(m => m[1] || 'index.html');
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, listed.length, 'sitemap: every <loc> is on https://kontas.download/');
  for (const file of listed) assert.ok(fs.existsSync(path.join(SITE, file)), `sitemap lists a missing page ${file}`);
  assert.deepEqual([...listed].sort(), PAGES.map(p => p + '.html').sort(), 'sitemap lists every page once');
  assert.match(read(path.join(SITE, 'robots.txt')), /^Sitemap: https:\/\/kontas\.download\/sitemap\.xml$/m);
});

test('nothing is loaded from other hosts; external links are plain anchors with rel="noopener noreferrer"', () => {
  for (const file of textFiles) {
    const text = read(file);
    const rel = path.relative(SITE, file);
    assert.doesNotMatch(text, /\ssrc=["']?(?:https?:)?\/\//i, `${rel}: external src`);
    assert.doesNotMatch(text, /url\(\s*["']?(?:https?:)?\/\//i, `${rel}: external url()`);
    assert.doesNotMatch(text, /@import/i, `${rel}: @import`);
    assert.doesNotMatch(text, /<link[^>]+href=["']?(?:https?:)?\/\//i, `${rel}: external stylesheet or icon`);
    if (file.endsWith('.js')) assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(/, `${rel}: network API`);
  }
  for (const { where, html } of allHtml()) {
    for (const m of html.matchAll(/<a\b[^>]*\shref="(?:https?:)?\/\/[^"]*"[^>]*>/gi)) {
      assert.match(m[0], /\srel="noopener noreferrer"/, `${where}: external link without rel: ${m[0]}`);
    }
  }
});

test('the pages work under the strict Content-Security-Policy of site/_headers', () => {
  const headers = read(path.join(SITE, '_headers'));
  const csp = (headers.match(/Content-Security-Policy:\s*(.+)/) || [])[1];
  assert.ok(csp, '_headers has a Content-Security-Policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  for (const { where, html } of allHtml()) {
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, `${where}: inline script`);
    assert.doesNotMatch(html, /<style[\s>]/i, `${where}: inline style element`);
    assert.doesNotMatch(html, /\sstyle=/i, `${where}: style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+=/i, `${where}: inline event handler`);
    assert.doesNotMatch(html, /(?:href|src)="\s*javascript:/i, `${where}: javascript: URL`);
  }
  const app = read(path.join(SITE, 'assets', 'app.js'));
  assert.doesNotMatch(app, /\beval\(|new Function|\.style\.|setAttribute\('style'|setTimeout\('/, 'app.js needs no eval or inline styles');
  new vm.Script(app, { filename: 'app.js' });
});

test('lt, ru and en have identical keys, non-empty texts and the same placeholders and links', () => {
  const keys = l => Object.keys(i18n[l]).sort();
  for (const lang of LANGS) {
    assert.deepEqual(keys(lang), keys(MAIN_LANG), `${lang} keys differ from ${MAIN_LANG}`);
    for (const [key, value] of Object.entries(i18n[lang])) {
      assert.ok(typeof value === 'string' && value.trim(), `${lang}:${key} is empty`);
      const marks = v => [...v.matchAll(/\{[a-zA-Z]+\}/g)].map(m => m[0]).sort();
      assert.deepEqual(marks(value), marks(i18n[MAIN_LANG][key]), `${lang}:${key} placeholders`);
      const links = v => [...v.matchAll(/href="([^"]+)"/g)].map(m => m[1]).sort();
      assert.deepEqual(links(value), links(i18n[MAIN_LANG][key]), `${lang}:${key} links`);
      const codes = v => [...v.matchAll(/<code>([^<]*)<\/code>/g)].map(m => m[1].replace(/README\.(en|ru)\.md/, 'README.md')).filter(c => !/domain|domen|домен/i.test(c)).sort();
      assert.deepEqual(codes(value), codes(i18n[MAIN_LANG][key]), `${lang}:${key} code fragments`);
    }
  }
});

test('every key used by the pages and app.js exists in every language', () => {
  const used = usedKeys();
  assert.ok(used.size > 100);
  for (const lang of LANGS) for (const key of used) assert.ok(key in i18n[lang], `${lang}: missing key ${key}`);
  const unused = Object.keys(i18n[MAIN_LANG]).filter(k => !used.has(k));
  assert.deepEqual(unused, [], 'keys that no page uses');
  assert.match(read(path.join(SITE, 'assets', 'app.js')), /var FALLBACK = 'lt'/, 'missing keys fall back to Lithuanian');
});

test('config.js has the documented fields, empty support values and the licence name', () => {
  for (const field of ['version', 'downloadUrl', 'sha256Url', 'repoUrl', 'repoFilePath', 'licenseName', 'donateUrl', 'contactEmail', 'issuesUrl']) assert.equal(typeof config[field], 'string', field);
  assert.equal(config.version, require('../package.json').version, 'site version follows web/package.json');
  for (const field of ['donateUrl', 'issuesUrl']) assert.equal(config[field], '', `${field} must be empty until it exists`);
  assert.match(config.contactEmail, /^[a-z]+@kontas\.download$/, 'the contact is an address of the project domain, never a personal one');
  assert.equal(config.licenseName, 'kontas.download Licence');
  const app = read(path.join(SITE, 'assets', 'app.js'));
  assert.match(app, /'kontas-download-' \+ version\(\) \+ '\.zip'/);
  const support = pageHtml('support');
  for (const field of ['donateUrl', 'contactEmail', 'issuesUrl']) assert.match(support, new RegExp(`data-config-if="${field}" hidden`), `support block ${field} hidden by default`);
  assert.match(pageHtml('about'), /<ul data-config-if="repoUrl" hidden>/, 'licence file links only with repoUrl');
});

test('no forbidden text, personal e-mail addresses or wrong licence claims anywhere in the site', t => {
  // The release filter lives in the maintainers' repository only; without it the forbidden-text part is skipped, the rest still runs.
  const filter = path.join(ROOT, 'scripts', 'release_tree.py');
  const source = fs.existsSync(filter) ? read(filter) : '';
  if (!source) t.diagnostic('scripts/release_tree.py not found: the forbidden-text patterns are not checked');
  const block = source.slice(source.indexOf('FORBIDDEN_TEXT'), source.indexOf(')]', source.indexOf('FORBIDDEN_TEXT')));
  // Python word boundaries are Unicode-aware (letters such as ą or ž are word characters); JavaScript ones are not, so they are rewritten with lookarounds.
  const W = String.raw`[\p{L}\p{N}_]`;
  const unicodeBoundary = p => p.split(String.raw`\b`).join(`(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`);
  const patterns = [...block.matchAll(/r'([^']+)'/g)].map(m => new RegExp(unicodeBoundary(m[1]), 'iu'));
  if (source) assert.ok(patterns.length >= 5, 'patterns read from release_tree.py');
  const allowedMail = new Set(['admin@kontas.local']);
  for (const file of [...textFiles, path.join(ROOT, 'docs', 'RELEASE-NOTES.md')]) {
    const text = read(file);
    const rel = path.relative(ROOT, file);
    for (const p of patterns) assert.doesNotMatch(text, p, `${rel}: forbidden text`);
    for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) assert.ok(allowedMail.has(m[0].toLowerCase()) || /^(info|contact|security)@kontas\.download$/i.test(m[0]), `${rel}: unexpected e-mail address ${m[0]}`);
    assert.doesNotMatch(text, /\bMIT\b|proaccounting/i, `${rel}: outdated name or licence`);
  }
});

test('the legal page names the contacts, the processors, the GDPR rights and its draft status in every language', () => {
  const html = pageHtml('legal');
  for (const key of ['legal.provider.body', 'legal.privacy.body', 'legal.program.body', 'legal.rights.body', 'legal.licence.body', 'legal.disclaimer.body', 'legal.draft', 'legal.revised']) assert.ok(html.includes(`"${key}"`), key);
  assert.match(html, /<ul data-config-if="repoUrl" hidden>/, 'licence file links only with repoUrl');
  for (const page of PAGES) assert.match(pageHtml(page), /<footer class="site-footer">[\s\S]*href="legal\.html"/, `${page}: footer links the legal page`);
  for (const lang of LANGS) {
    const t = i18n[lang];
    assert.match(t['legal.provider.body'], /href="mailto:info@kontas\.download"/, lang);
    assert.match(t['legal.provider.body'], /href="mailto:contact@kontas\.download"/, lang);
    assert.match(t['legal.privacy.body'], /<a href="https:\/\/www\.cloudflare\.com\/privacypolicy\/" rel="noopener noreferrer">/, lang);
    assert.match(t['legal.privacy.body'], /localStorage/, lang);
    assert.match(t['legal.privacy.body'], /Cloudflare Email Routing/, lang);
    assert.match(t['legal.rights.body'], /<a href="https:\/\/vdai\.lrv\.lt" rel="noopener noreferrer">/, lang);
    assert.match(t['legal.rights.body'], /href="mailto:contact@kontas\.download"/, lang);
    assert.equal((t['legal.rights.body'].match(/<li>/g) || []).length, 6, `${lang}: six GDPR rights`);
    assert.match(t['legal.revised'], /2026-10-27/, lang);
  }
  // The private legal analysis is never referenced from the public site.
  for (const file of textFiles) assert.doesNotMatch(read(file), /teisine-analize|legal\//, path.relative(SITE, file));
});

test('the release filter ships the site and the release notes', t => {
  const filter = path.join(ROOT, 'scripts', 'release_tree.py');
  if (fs.existsSync(filter)) {
    const include = (read(filter).match(/^INCLUDE = \[(.*)\]$/m) || [])[1] || '';
    assert.match(include, /'site'/);
    assert.match(include, /'docs\/RELEASE-NOTES\.md'/);
  } else t.diagnostic('scripts/release_tree.py not found: the release filter part is not checked');
  const notes = read(path.join(ROOT, 'docs', 'RELEASE-NOTES.md'));
  assert.match(notes, /## Lietuviškai/);
  assert.match(notes, /## English/);
  assert.match(notes, /kontas-download-0\.1\.0\.zip/);
});

test('the roadmap page lists what exists, planned items with status chips, third-party dependencies, principles and the closing line', () => {
  const html = pageHtml('roadmap');
  assert.match(html, /<body data-page="roadmap">/);
  assert.match(html, /href="roadmap\.html" data-i18n="nav\.roadmap"/, 'footer link is present on the roadmap page itself');
  for (const page of PAGES) assert.match(pageHtml(page), /<footer[\s\S]*href="roadmap\.html"[\s\S]*<\/footer>/, page + ': footer link to the roadmap');
  const items = [...html.matchAll(/data-i18n="(rm\.i\.[a-z]+\.t)"/g)].map(m => m[1]);
  assert.equal(items.length, 9, 'nine planned items');
  for (const lang of LANGS) {
    for (const key of ['rm.title', 'rm.have.body', 'rm.dep.body', 'rm.pr.body', 'rm.sug.body', 'rm.note', 'rm.status.planned', 'rm.status.wait']) assert.ok(i18n[lang][key], `${lang}: ${key}`);
    for (const key of items) assert.ok(i18n[lang][key] && i18n[lang][key.replace(/\.t$/, '.d')], `${lang}: ${key}`);
  }
  for (const m of html.matchAll(/data-i18n="(rm\.status\.[a-z]+)"/g)) assert.ok(i18n.lt[m[1]], m[1]);
  assert.equal(i18n.lt['rm.note'], 'Planas gali keistis; tai ne įsipareigojimas.');
  assert.match(html, /data-config-href="contactEmail"/);
  assert.doesNotMatch(html, /style=|\son[a-z]+=|<script(?![^>]*\ssrc=)/i, 'no inline style or script');
});
