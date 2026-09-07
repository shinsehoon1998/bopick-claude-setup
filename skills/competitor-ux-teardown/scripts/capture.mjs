#!/usr/bin/env node
/**
 * competitor-ux-teardown / capture.mjs
 *
 * Read-only capture of someone else's web UI: screenshots at several widths,
 * a structured inventory of what is actually on each screen, and page health.
 *
 * It never clicks, never types, never submits. The only interaction is scrolling.
 *
 * Usage:
 *   node capture.mjs discover <start-url> [--limit 40]
 *   node capture.mjs capture <url> [<url> ...] --out <dir> [options]
 *
 * Capture options:
 *   --out <dir>            output directory (required)
 *   --widths 320,768,1440  viewport widths (default: 320,768,1440)
 *   --full-page-all        full-page shot at every width (default: widest only)
 *   --dark                 extra pass with prefers-color-scheme: dark
 *   --video                record a scroll-through WebM at the widest width
 *   --delay 1500           ms to wait between pages (politeness, default 1500)
 *   --settle 2500          ms to wait after load before capturing (default 2500)
 *   --storage-state <f>    Playwright storageState JSON for logged-in captures
 *   --ignore-robots        capture even if robots.txt disallows the path
 *   --strict-readonly      abort every non-GET request, including XHR/fetch
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_WIDTHS = [320, 768, 1440];
const VIEWPORT_HEIGHT = 900;

function parseArgs(argv) {
  const mode = argv[2];
  const urls = [];
  const opts = {
    widths: DEFAULT_WIDTHS,
    fullPageAll: false,
    dark: false,
    video: false,
    delay: 1500,
    settle: 2500,
    limit: 40,
    out: null,
    storageState: null,
    ignoreRobots: false,
    strictReadonly: false,
  };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--widths') opts.widths = argv[++i].split(',').map((w) => parseInt(w.trim(), 10));
    else if (a === '--full-page-all') opts.fullPageAll = true;
    else if (a === '--dark') opts.dark = true;
    else if (a === '--video') opts.video = true;
    else if (a === '--delay') opts.delay = parseInt(argv[++i], 10);
    else if (a === '--settle') opts.settle = parseInt(argv[++i], 10);
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10);
    else if (a === '--storage-state') opts.storageState = argv[++i];
    else if (a === '--ignore-robots') opts.ignoreRobots = true;
    else if (a === '--strict-readonly') opts.strictReadonly = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    else urls.push(a);
  }
  return { mode, urls, opts };
}

function slugify(url) {
  const u = new URL(url);
  const p = u.pathname.replace(/\/+$/, '') || '/home';
  const s = (p + u.search).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (s || 'home').slice(0, 60).toLowerCase();
}

/** Minimal robots.txt gate. Honours the broadest applicable Disallow for `*`. */
async function robotsDisallows(origin, pathname) {
  try {
    const res = await fetch(new URL('/robots.txt', origin), { redirect: 'follow' });
    if (!res.ok) return false;
    const text = await res.text();
    let applies = false;
    const disallowed = [];
    for (const raw of text.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') applies = value === '*';
      else if (applies && key === 'disallow' && value) disallowed.push(value);
      else if (applies && key === 'allow' && value === '/') return false;
    }
    return disallowed.some((rule) => pathname.startsWith(rule.replace(/\*.*$/, '')));
  } catch {
    return false;
  }
}

/** Injected before any page script: collects LCP and CLS without touching the page. */
const VITALS_INIT = `
window.__cuxt = { lcp: 0, cls: 0, longTasks: 0 };
try {
  new PerformanceObserver((l) => {
    const e = l.getEntries();
    window.__cuxt.lcp = Math.round(e[e.length - 1].startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const entry of l.getEntries()) if (!entry.hadRecentInput) window.__cuxt.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { window.__cuxt.longTasks += l.getEntries().length; })
    .observe({ type: 'longtask', buffered: true });
} catch (e) {}
`;

/** Runs in the page. Returns everything a UX reviewer would otherwise guess at. */
const INVENTORY_FN = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 0 && r.height > 0;
  };
  const txt = (el, n = 60) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);

  const interactive = [];
  document.querySelectorAll('input,select,textarea,button,a[href],[role="button"],[role="tab"],[contenteditable="true"]')
    .forEach((el) => {
      if (!visible(el)) return;
      const entry = {
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        text: txt(el, 40),
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        disabled: !!el.disabled,
      };
      if (el.tagName === 'SELECT') {
        entry.options = Array.from(el.options).slice(0, 25).map((o) => ({ value: o.value, text: o.text }));
      }
      if (el.tagName === 'A') entry.href = el.getAttribute('href');
      const r = el.getBoundingClientRect();
      entry.box = { w: Math.round(r.width), h: Math.round(r.height) };
      interactive.push(entry);
    });

  const forms = Array.from(document.forms).map((f) => ({
    action: f.getAttribute('action') || '',
    method: (f.getAttribute('method') || 'get').toLowerCase(),
    fields: f.querySelectorAll('input,select,textarea').length,
    required: f.querySelectorAll('[required]').length,
    submitLabel: txt(f.querySelector('[type="submit"],button') || document.createElement('i'), 40),
  }));

  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .filter(visible)
    .slice(0, 40)
    .map((h) => ({ level: h.tagName, text: txt(h, 90) }));

  const landmarks = {};
  ['header', 'nav', 'main', 'aside', 'footer', 'section', 'article'].forEach((t) => {
    landmarks[t] = document.querySelectorAll(t).length;
  });

  const images = Array.from(document.images).filter(visible);
  const media = {
    imgCount: images.length,
    missingAlt: images.filter((i) => !i.getAttribute('alt')).length,
    noDimensions: images.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
    videoCount: document.querySelectorAll('video').length,
    largest: images
      .map((i) => ({ src: (i.currentSrc || i.src || '').slice(0, 160), w: i.naturalWidth, h: i.naturalHeight }))
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 3),
  };

  const cs = getComputedStyle(document.body);
  const h1 = document.querySelector('h1');
  const typography = {
    bodyFont: cs.fontFamily,
    bodySize: cs.fontSize,
    bodyLineHeight: cs.lineHeight,
    bodyColor: cs.color,
    background: cs.backgroundColor,
    h1Font: h1 ? getComputedStyle(h1).fontFamily : null,
    h1Size: h1 ? getComputedStyle(h1).fontSize : null,
    fontFamilies: [...new Set(Array.from(document.querySelectorAll('body *')).slice(0, 400)
      .map((el) => getComputedStyle(el).fontFamily))].slice(0, 6),
  };

  // Design tokens: :root custom properties from same-origin stylesheets.
  const tokens = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      if (rule.selectorText && /:root|^html$/.test(rule.selectorText)) {
        for (const prop of Array.from(rule.style || [])) {
          if (prop.startsWith('--')) tokens[prop] = rule.style.getPropertyValue(prop).trim().slice(0, 60);
        }
      }
    }
  }

  const sameOrigin = (href) => {
    try { return new URL(href, location.href).origin === location.origin; } catch { return false; }
  };
  const navLinks = Array.from(document.querySelectorAll('header a[href],nav a[href]'))
    .filter(visible)
    .slice(0, 60)
    .map((a) => ({ text: txt(a, 40), href: new URL(a.getAttribute('href'), location.href).href }))
    .filter((l) => sameOrigin(l.href));

  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.lang || null,
    description: document.querySelector('meta[name="description"]')?.content?.slice(0, 300) || null,
    viewportMeta: document.querySelector('meta[name="viewport"]')?.content || null,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content || null,
    headings,
    landmarks,
    interactive,
    forms,
    media,
    typography,
    tokens: Object.keys(tokens).length ? tokens : null,
    navLinks,
    vitals: window.__cuxt || null,
    skipLink: !!document.querySelector('a[href^="#"]'),
    prefersReducedMotionRespected: Array.from(document.styleSheets).some((s) => {
      try { return Array.from(s.cssRules).some((r) => (r.conditionText || '').includes('prefers-reduced-motion')); }
      catch { return false; }
    }),
  };
};

/**
 * Runs at the NARROWEST width. Tap-target size, horizontal overflow, and tiny
 * type are mobile questions - measuring them on a 1440px viewport is noise.
 */
const MOBILE_AUDIT_FN = () => {
  const vw = window.innerWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 0 && r.height > 0;
  };
  const txt = (el, n = 40) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);

  const overflowing = Array.from(document.querySelectorAll('body *'))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > vw + 1 && visible(el);
    })
    .slice(0, 10)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 50),
      width: Math.round(el.getBoundingClientRect().width),
      text: txt(el, 30),
    }));

  const tapViolations = [];
  document.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="tab"]').forEach((el) => {
    if (!visible(el)) return;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      tapViolations.push({
        tag: el.tagName.toLowerCase(),
        text: txt(el, 30) || el.getAttribute('aria-label') || '',
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  });

  const tinyText = Array.from(document.querySelectorAll('p,span,li,td,label,small'))
    .filter((el) => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 12)
    .slice(0, 10)
    .map((el) => ({ size: getComputedStyle(el).fontSize, text: txt(el, 40) }));

  return {
    viewportWidth: vw,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    scrollWidth: document.documentElement.scrollWidth,
    overflowingElements: overflowing,
    tapViolations: tapViolations.slice(0, 25),
    tapViolationCount: tapViolations.length,
    tinyText,
  };
};

async function newContext(browser, { width, opts, colorScheme, videoDir }) {
  const ctx = await browser.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: colorScheme || 'light',
    storageState: opts.storageState ? JSON.parse(readFileSync(opts.storageState, 'utf8')) : undefined,
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width, height: VIEWPORT_HEIGHT } } } : {}),
  });
  // Read-only guard. Form submissions navigate the document with a non-GET
  // method; those are always blocked. XHR/fetch writes are the page's own data
  // loading (GraphQL POSTs render the screens we came for) and pass unless
  // --strict-readonly.
  await ctx.route('**', (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET' || method === 'HEAD') return route.continue();
    if (opts.strictReadonly || req.resourceType() === 'document') {
      console.error(`  [read-only] blocked ${method} ${req.url().slice(0, 100)}`);
      return route.abort();
    }
    return route.continue();
  });
  await ctx.addInitScript(VITALS_INIT);
  return ctx;
}

async function scrollThrough(page, steps = 6) {
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((f) => window.scrollTo({ top: document.body.scrollHeight * f, behavior: 'smooth' }), i / steps);
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(900);
}

async function capturePage(browser, url, opts, outRoot) {
  const slug = slugify(url);
  const dir = path.join(outRoot, slug);
  await mkdir(dir, { recursive: true });
  const widest = Math.max(...opts.widths);
  const narrowest = Math.min(...opts.widths);
  const record = { url, slug, dir, shots: [], consoleErrors: [], failedRequests: [], inventory: null, mobile: null, status: null };

  for (const width of opts.widths) {
    const withVideo = opts.video && width === widest;
    const ctx = await newContext(browser, { width, opts, videoDir: withVideo ? dir : null });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('console', (m) => {
      if (m.type() === 'error' && record.consoleErrors.length < 25) record.consoleErrors.push(m.text().slice(0, 200));
    });
    page.on('requestfailed', (r) => {
      if (record.failedRequests.length < 25) record.failedRequests.push(`${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`);
    });

    let res = null;
    try {
      res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    } catch (e) {
      console.error(`  ! goto failed at ${width}px: ${e.message}`);
      await ctx.close();
      continue;
    }
    if (res) record.status = res.status();
    await page.waitForTimeout(opts.settle);

    const fold = path.join(dir, `fold-${width}.png`);
    await page.screenshot({ path: fold });
    record.shots.push(path.relative(outRoot, fold));

    if (opts.fullPageAll || width === widest) {
      const full = path.join(dir, `full-${width}.png`);
      await page.screenshot({ path: full, fullPage: true });
      record.shots.push(path.relative(outRoot, full));
    }

    if (width === widest) {
      if (opts.video) await scrollThrough(page);
      record.inventory = await page.evaluate(INVENTORY_FN).catch((e) => ({ error: e.message }));
    }
    if (width === narrowest) {
      record.mobile = await page.evaluate(MOBILE_AUDIT_FN).catch((e) => ({ error: e.message }));
    }

    if (withVideo) {
      const video = page.video();
      await ctx.close();
      if (video) {
        const dest = path.join(dir, `walk-${width}.webm`);
        await video.saveAs(dest).catch(() => {});
        record.shots.push(path.relative(outRoot, dest));
      }
    } else {
      await ctx.close();
    }
  }

  if (opts.dark) {
    const ctx = await newContext(browser, { width: widest, opts, colorScheme: 'dark' });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(opts.settle);
      const p = path.join(dir, `dark-${widest}.png`);
      await page.screenshot({ path: p });
      record.shots.push(path.relative(outRoot, p));
    } catch (e) {
      console.error(`  ! dark pass failed: ${e.message}`);
    }
    await ctx.close();
  }

  if (record.inventory) {
    await writeFile(path.join(dir, 'inventory.json'), JSON.stringify(record.inventory, null, 2));
  }
  if (record.mobile) {
    await writeFile(path.join(dir, 'mobile-audit.json'), JSON.stringify(record.mobile, null, 2));
  }
  return record;
}

async function discover(startUrl, opts) {
  const browser = await chromium.launch();
  const ctx = await newContext(browser, { width: 1440, opts });
  const page = await ctx.newPage();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(opts.settle);
  const links = await page.evaluate(() => {
    const out = new Map();
    const push = (a, where) => {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        if (u.origin !== location.origin) return;
        u.hash = '';
        if (!out.has(u.href)) out.set(u.href, { url: u.href, text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50), where });
      } catch {}
    };
    document.querySelectorAll('header a[href], nav a[href]').forEach((a) => push(a, 'nav'));
    document.querySelectorAll('footer a[href]').forEach((a) => push(a, 'footer'));
    document.querySelectorAll('main a[href]').forEach((a) => push(a, 'body'));
    return Array.from(out.values());
  });
  await ctx.close();

  let sitemap = [];
  try {
    const res = await fetch(new URL('/sitemap.xml', startUrl));
    if (res.ok) {
      const xml = await res.text();
      sitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 200);
    }
  } catch {}

  await browser.close();
  console.log(JSON.stringify({ start: startUrl, links: links.slice(0, opts.limit), sitemap }, null, 2));
}

async function main() {
  const { mode, urls, opts } = parseArgs(process.argv);
  if (mode === 'discover') {
    if (!urls[0]) throw new Error('discover needs a start URL');
    return discover(urls[0], opts);
  }
  if (mode !== 'capture') {
    console.error('Usage: capture.mjs discover <url> | capture <url...> --out <dir>');
    process.exit(1);
  }
  if (!opts.out) throw new Error('--out <dir> is required');
  if (!urls.length) throw new Error('at least one URL is required');

  const targets = [];
  for (const url of urls) {
    const u = new URL(url);
    if (!opts.ignoreRobots && (await robotsDisallows(u.origin, u.pathname))) {
      console.error(`SKIP (robots.txt disallows): ${url}`);
      continue;
    }
    targets.push(url);
  }
  if (!targets.length) {
    console.error('Nothing to capture. Re-run with --ignore-robots only if you have a reason to.');
    process.exit(2);
  }

  await mkdir(opts.out, { recursive: true });
  const browser = await chromium.launch();
  const manifest = { capturedAt: new Date().toISOString(), widths: opts.widths, pages: [] };
  for (const [i, url] of targets.entries()) {
    console.error(`[${i + 1}/${targets.length}] ${url}`);
    manifest.pages.push(await capturePage(browser, url, opts, opts.out));
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, opts.delay));
  }
  await browser.close();
  await writeFile(path.join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error(`\nDone. ${manifest.pages.length} screens -> ${opts.out}/manifest.json`);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
