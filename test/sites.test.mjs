// DoomBreaker site-config tests — pure node, mirrors the real sites.js logic.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { setImmediate as nextTurn } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const DBSites = require('../sites.js');
const remote = JSON.parse(readFileSync(new URL('../config/sites.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' got ' + a + ' want ' + e); }
}

console.log('config/sites.json valid:');
eq(DBSites.validConfig(remote), true, 'remote config is valid');
eq(DBSites.validConfig(null), false, 'null is invalid');
eq(DBSites.validConfig({ sites: [{ key: 'x' }] }), false, 'missing host is invalid');

console.log('host matching (subdomains + bare):');
eq(DBSites.matchSite(remote, 'x.com').key, 'x', 'x.com');
eq(DBSites.matchSite(remote, 'www.x.com').key, 'x', 'www.x.com');
eq(DBSites.matchSite(remote, 'mobile.twitter.com').key, 'x', 'mobile.twitter.com');
eq(DBSites.matchSite(remote, 'www.reddit.com').key, 'reddit', 'www.reddit.com');
eq(DBSites.matchSite(remote, 'www.instagram.com').key, 'instagram', 'www.instagram.com');
eq(DBSites.matchSite(remote, 'www.youtube.com').key, 'youtube', 'www.youtube.com');
eq(DBSites.matchSite(remote, 'www.linkedin.com').key, 'linkedin', 'www.linkedin.com');
eq(DBSites.matchSite(remote, 'news.ycombinator.com').key, 'other', 'unknown host falls back to other');

console.log('active / mode / video resolution:');
const ig = DBSites.matchSite(remote, 'www.instagram.com');
eq(DBSites.siteActive(ig, '/'), true, 'ig home active');
eq(DBSites.siteActive(ig, '/reel/abc'), true, 'ig reel active');
eq(DBSites.siteActive(ig, '/explore'), false, 'ig explore inactive');
eq(DBSites.siteMode(ig, '/reel/abc'), 'video', 'ig reel is video mode');
eq(DBSites.siteMode(ig, '/'), 'wheel', 'ig home is wheel mode');

const yt = DBSites.matchSite(remote, 'www.youtube.com');
eq(DBSites.siteActive(yt, '/shorts/abc'), true, 'yt shorts active');
eq(DBSites.siteActive(yt, '/watch?v=1'), false, 'yt watch inactive');
eq(DBSites.siteMode(yt, '/shorts/abc'), 'video', 'yt shorts video mode');
eq(DBSites.isVideoPath(yt, '/shorts/abc'), true, 'yt /shorts/<id> is a video path');
eq(DBSites.isVideoPath(yt, '/shorts'), false, 'yt bare /shorts is not a video path');
eq(DBSites.isVideoPath(ig, '/reel/abc'), true, 'ig /reel/<id> is a video path');

const li = DBSites.matchSite(remote, 'www.linkedin.com');
eq(DBSites.siteActive(li, '/feed'), true, 'linkedin feed active');
eq(DBSites.siteActive(li, '/jobs'), false, 'linkedin jobs inactive');

console.log('service-worker config refresh:');
// Run the actual worker in isolation: no network, extension installation or
// real Chrome storage. Each case starts with a new worker and storage cache.
const workerSource = readFileSync(new URL('../background.js', import.meta.url), 'utf8');
function configWorker(cached, fetchMock) {
  const stored = cached ? { [DBSites.CONFIG_KEY]: structuredClone(cached) } : {};
  const writes = [], requests = [], errors = [], listeners = {};
  const context = createContext({
    DBSites,
    importScripts() {},
    console: { log(...args) { errors.push(args.join(' ')); } },
    fetch(...args) { requests.push(args); return fetchMock(...args); },
    chrome: {
      storage: { local: {
        async get(key) { return structuredClone({ [key]: stored[key] }); },
        async set(value) { writes.push(structuredClone(value)); Object.assign(stored, value); }
      } },
      runtime: {
        onInstalled: { addListener(fn) { listeners.install = fn; } },
        onStartup: { addListener(fn) { listeners.startup = fn; } },
        onMessage: { addListener() {} }
      },
      alarms: { create() {}, onAlarm: { addListener(fn) { listeners.alarm = fn; } } }
    }
  });
  runInContext(workerSource, context, { filename: 'background.js' });
  return { stored, writes, requests, errors, context, listeners };
}

const cachedEntry = {
  version: 42, fetchedAt: 123,
  data: { version: 42, sites: [{ key: 'cached', host: '^cached\\.example$' }], kill: { cached: ['||cached.example/api'] } }
};
const failures = [
  ['network rejection', async () => { throw new Error('offline'); }],
  ['synchronous fetch throw', () => { throw new Error('blocked'); }],
  ['HTTP 503', async () => ({ ok: false, status: 503, json() { throw new Error('must not parse an error response'); } })],
  ['invalid JSON', async () => ({ ok: true, async json() { throw new SyntaxError('invalid JSON'); } })],
  ['empty sites', async () => ({ ok: true, async json() { return { version: 99, sites: [], kill: {} }; } })]
];
const triggers = ['install', 'startup', 'alarm'];
let triggerIndex = 0;
async function refresh(worker, trigger) {
  if (trigger === 'alarm') worker.listeners.alarm({ name: 'db-config-refresh' });
  else worker.listeners[trigger]();
  // All mocks resolve/reject immediately. Yield one event-loop turn so the
  // worker's promise chain, including its final catch, completes.
  await nextTurn();
}
for (const cached of [cachedEntry, null]) {
  for (const [name, fetchMock] of failures) {
    const worker = configWorker(cached, fetchMock);
    const before = structuredClone(worker.stored);
    const trigger = triggers[triggerIndex++ % triggers.length];
    const label = name + ' (' + trigger + ', ' + (cached ? 'cached' : 'bundled') + ')';
    await refresh(worker, trigger);
    eq(worker.requests.length, 1, label + ' attempts fetch');
    const [url, options] = worker.requests[0];
    eq(url.startsWith(DBSites.CONFIG_URL + '?_='), true, label + ' uses config URL');
    eq(options, { cache: 'no-store' }, label + ' bypasses fetch cache');
    eq(worker.writes, [], label + ' never writes storage');
    eq(worker.stored, before, label + ' preserves stored config');
    eq(runInContext('currentConfig', worker.context), cached ? cached.data : DBSites.DEFAULT_CONFIG, label + ' retains working config');
    eq(worker.errors.length, 1, label + ' handles failure');
  }
}
// Positive controls ensure the harness actually exercises config publication.
for (const trigger of triggers) {
  const worker = configWorker(cachedEntry, async () => ({ ok: true, async json() { return remote; } }));
  await refresh(worker, trigger);
  eq(worker.writes.length, 1, trigger + ' valid download writes once');
  eq(worker.stored[DBSites.CONFIG_KEY].data, remote, trigger + ' replaces cached data');
  eq(runInContext('currentConfig', worker.context), remote, trigger + ' activates downloaded config');
  eq(worker.errors, [], trigger + ' valid download has no error');
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
