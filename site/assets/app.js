// Fills the page templates with the texts of the chosen language and the values from config.js.
// No network requests: texts are loaded with plain <script> tags, so the site also works when opened from disk (file://).
(function () {
  'use strict';
  var LANGS = ['lt', 'ru', 'en'];
  var FALLBACK = 'lt'; // main language of the project
  var LANG_KEY = 'pa-site-lang';
  var OSES = ['windows', 'macos', 'linux'];
  var dict = window.PA_I18N || {};
  var config = window.PA_CONFIG || {};
  var lang = FALLBACK;

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the choice is simply not remembered */ }
    return null;
  }

  function str(value) { return typeof value === 'string' ? value.trim() : ''; }

  function version() { return str(config.version) || '0.0.0'; }

  var values = {
    version: version(),
    fileName: 'kontas-download-' + version() + '.zip',
    shaName: 'kontas-download-' + version() + '.zip.sha256',
    licenseName: str(config.licenseName),
    contactEmail: str(config.contactEmail)
  };

  function fill(text) {
    return text.replace(/\{(version|fileName|shaName|licenseName)\}/g, function (all, name) { return values[name]; });
  }

  // Text of a key in the current language, otherwise in Lithuanian (the main language), otherwise null (the template keeps its content).
  function t(key) {
    var own = dict[lang] && dict[lang][key];
    if (typeof own === 'string') return fill(own);
    var base = dict[FALLBACK] && dict[FALLBACK][key];
    return typeof base === 'string' ? fill(base) : null;
  }

  function safeUrl(url) {
    url = str(url);
    if (!url || /^\s*(javascript|data|vbscript|file):/i.test(url)) return '';
    return url;
  }

  function external(link) {
    if (/^https?:\/\//i.test(link.getAttribute('href') || '')) link.setAttribute('rel', 'noopener noreferrer');
  }

  function detectLang() {
    var saved = store(LANG_KEY);
    if (LANGS.indexOf(saved) >= 0) return saved;
    var wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i] || '').slice(0, 2).toLowerCase();
      if (LANGS.indexOf(code) >= 0) return code;
    }
    return FALLBACK;
  }

  function each(selector, fn) { Array.prototype.forEach.call(document.querySelectorAll(selector), fn); }

  function render() {
    document.documentElement.lang = lang;
    each('[data-i18n]', function (el) { var v = t(el.getAttribute('data-i18n')); if (v !== null) el.textContent = v; });
    each('[data-i18n-html]', function (el) {
      var v = t(el.getAttribute('data-i18n-html'));
      if (v !== null) { el.innerHTML = v; Array.prototype.forEach.call(el.querySelectorAll('a[href]'), external); }
    });
    each('[data-i18n-attr]', function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        var v = parts.length === 2 ? t(parts[1].trim()) : null;
        if (v !== null) el.setAttribute(parts[0].trim(), v);
      });
    });
    each('.lang-switch button[data-lang]', function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    each('pre > button.copy', function (b) { b.textContent = t('ui.copy') || 'Copy'; });
    applyConfig();
  }

  function applyConfig() {
    each('[data-config-text]', function (el) { el.textContent = values[el.getAttribute('data-config-text')] || ''; });
    each('[data-config-href]', function (el) {
      var name = el.getAttribute('data-config-href');
      var url = name === 'contactEmail' ? (values.contactEmail ? 'mailto:' + values.contactEmail : '') : safeUrl(config[name]);
      if (url) { el.setAttribute('href', url); external(el); el.hidden = false; } else { el.removeAttribute('href'); el.hidden = true; }
    });
    // Links to files of the repository (licence texts), only when repoUrl is set.
    each('[data-repo-file]', function (el) {
      var repo = safeUrl(config.repoUrl).replace(/\/+$/, '');
      var mid = str(config.repoFilePath) || '/blob/HEAD/';
      if (repo) { el.setAttribute('href', repo + '/' + mid.replace(/^\/+|\/+$/g, '') + '/' + el.getAttribute('data-repo-file')); external(el); el.hidden = false; } else { el.removeAttribute('href'); el.hidden = true; }
    });
    // data-config-if="a,b": shown when at least one of the values is filled; data-config-unless: shown when all are empty.
    each('[data-config-if]', function (el) { el.hidden = !anyFilled(el.getAttribute('data-config-if')); });
    each('[data-config-unless]', function (el) { el.hidden = anyFilled(el.getAttribute('data-config-unless')); });
  }

  function anyFilled(list) {
    return list.split(',').some(function (name) { name = name.trim(); return name === 'contactEmail' ? Boolean(values.contactEmail) : name === 'licenseName' ? Boolean(values.licenseName) : Boolean(safeUrl(config[name])); });
  }

  function setLang(next) {
    if (LANGS.indexOf(next) < 0) return;
    lang = next;
    store(LANG_KEY, next);
    render();
  }

  // Operating system tabs (manual and download pages). All panels stay visible without JavaScript.
  function detectOs() {
    var p = String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '');
    if (/win/i.test(p)) return 'windows';
    if (/mac|iphone|ipad/i.test(p)) return 'macos';
    return 'linux';
  }

  var tabGroups = [];
  function selectOs(os, focus) {
    tabGroups.forEach(function (g) {
      g.tabs.forEach(function (tab, i) {
        var on = tab.getAttribute('data-os') === os;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        g.panels[i].hidden = !on;
        if (on && focus === g) tab.focus();
      });
    });
  }

  function setupTabs() {
    var n = 0;
    each('[data-os-tabs]', function (box) {
      var panels = Array.prototype.slice.call(box.querySelectorAll(':scope > [data-os]'));
      if (!panels.length) return;
      var list = document.createElement('div');
      list.setAttribute('role', 'tablist');
      list.className = 'tablist';
      var group = { tabs: [], panels: panels };
      panels.forEach(function (panel) {
        n += 1;
        var os = panel.getAttribute('data-os');
        var title = panel.querySelector('.os-title');
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-os', os);
        tab.id = 'ostab-' + n;
        tab.textContent = title ? title.textContent : os;
        panel.id = panel.id || 'ospanel-' + n;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        tab.setAttribute('aria-controls', panel.id);
        if (title) title.classList.add('visually-hidden');
        tab.addEventListener('click', function () { selectOs(os); });
        tab.addEventListener('keydown', function (e) {
          var i = group.tabs.indexOf(tab), next = -1;
          if (e.key === 'ArrowRight') next = (i + 1) % group.tabs.length;
          else if (e.key === 'ArrowLeft') next = (i - 1 + group.tabs.length) % group.tabs.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = group.tabs.length - 1;
          if (next >= 0) { e.preventDefault(); selectOs(group.tabs[next].getAttribute('data-os'), group); }
        });
        group.tabs.push(tab);
        list.appendChild(tab);
      });
      box.insertBefore(list, box.firstChild);
      box.classList.add('tabs-ready');
      tabGroups.push(group);
    });
    if (tabGroups.length) selectOs(detectOs());
  }

  function setupCopy() {
    if (!navigator.clipboard || !window.isSecureContext) return;
    each('pre', function (pre) {
      var code = pre.querySelector('code');
      if (!code) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'copy';
      b.addEventListener('click', function () {
        navigator.clipboard.writeText(code.textContent).then(function () {
          b.textContent = t('ui.copied') || 'Copied';
          setTimeout(function () { b.textContent = t('ui.copy') || 'Copy'; }, 1500);
        }, function () { /* clipboard refused: nothing to do */ });
      });
      pre.appendChild(b);
    });
  }

  function init() {
    lang = detectLang();
    each('.lang-switch button[data-lang]', function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });
    setupTabs();
    setupCopy();
    render();
    var page = document.body.getAttribute('data-page');
    each('.site-nav a[data-nav]', function (a) { if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page'); });
    // The texts were inserted after the browser jumped to #anchor, so the target has moved: jump again.
    var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
