// DoomBreaker — service worker. Feed-kill via declarativeNetRequest dynamic rules.
// Known sites use precise API-path filters from the remote config/sites.json;
// any other host gets a generic "block all XHR on this host" rule at full
// damage, so the kill works everywhere without per-site maintenance.
//
// Config refresh (uBlock pattern): fetch the remote config on install/startup
// and every 6h via chrome.alarms, cache it in storage, keep the old copy on
// any fetch failure. Site updates = edit config/sites.json in the repo = all
// installed copies pick it up within the refresh window, no store release.

importScripts('meter.js', 'sites.js');

const RULE_IDS = [101, 102, 103, 104, 105, 106];
const GENERIC_BASE = 200;
const CONFIG_ALARM = 'db-config-refresh';

let currentConfig = DBSites.DEFAULT_CONFIG;

// Hourly cache-bust token so the fetch is never served from the browser cache
// for more than an hour (same trick uBlock uses for remote filter lists).
function cacheBustToken() {
  return Math.floor(Date.now() / 3600000) % 13;
}

// Precise block rules from config.kill, one id per filter, ids 101+ in order.
function preciseRules(cfg) {
  const kill = (cfg && cfg.kill) || {};
  const rules = [];
  let id = 101;
  for (const key of Object.keys(kill)) {
    const filters = kill[key] || [];
    for (const filter of filters) {
      if (id > 106) break;
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: filter, resourceTypes: ['xmlhttprequest'] }
      });
    }
  }
  return rules;
}

// A host is "known" when any config site's host regex matches it.
function isKnownHost(cfg, host) {
  const sites = (cfg && cfg.sites) || [];
  for (const s of sites) {
    try {
      if (new RegExp(s.host).test(host)) return true;
    } catch (e) { /* malformed regex in config; skip */ }
  }
  return false;
}

// Generic rules live in the 200..19999 id range, one per host, so multiple
// unknown-site tabs can be blocked at once without collisions.
function genericIdFor(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return GENERIC_BASE + (h % 19800);
}

function genericRule(id, host) {
  return {
    id: id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||' + host + '/',
      resourceTypes: ['xmlhttprequest']
    }
  };
}

// Generic ids we added this worker lifetime. A stale rule from a crashed
// worker is self-healing: the next full-damage visit re-adds (idempotent)
// and the next kill-off removes the tracked set plus this host's id.
let activeGeneric = new Set();

// ---- Config load / refresh ------------------------------------------------

function loadConfigFromStorage() {
  return chrome.storage.local.get(DBSites.CONFIG_KEY).then(function (res) {
    const entry = res[DBSites.CONFIG_KEY];
    if (entry && DBSites.validConfig(entry.data)) currentConfig = entry.data;
    return currentConfig;
  }).catch(function () {
    return currentConfig;
  });
}

function saveConfig(data) {
  const entry = { version: data.version, fetchedAt: Date.now(), data: data };
  return chrome.storage.local.set({ [DBSites.CONFIG_KEY]: entry });
}

function fetchConfig() {
  const url = DBSites.CONFIG_URL + '?_=' + cacheBustToken();
  return fetch(url, { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!DBSites.validConfig(data)) throw new Error('invalid config');
      return saveConfig(data).then(function () {
        currentConfig = data;
        return data;
      });
    });
}

function refreshConfig() {
  // On failure keep whatever we had (storage cache, else bundled defaults).
  loadConfigFromStorage()
    .then(function () { return fetchConfig(); })
    .catch(function (e) {
      console.log('DoomBreaker config refresh failed, keeping cached:', String(e));
    });
}

chrome.runtime.onInstalled.addListener(function () { refreshConfig(); });
chrome.runtime.onStartup.addListener(function () { refreshConfig(); });
chrome.alarms.onAlarm.addListener(function (a) {
  if (a.name === CONFIG_ALARM) refreshConfig();
});
chrome.alarms.create(CONFIG_ALARM, { periodInMinutes: DBSites.REFRESH_MINUTES });

// ---- Feed-kill ------------------------------------------------------------

// ---- Usage accumulator (single writer) ------------------------------------
// Content tabs never write usage directly: each sends {site, delta} and the
// SW merges into storage, so two tabs writing at once cannot lose seconds.
function recordUsage(msg) {
  return chrome.storage.local.get('usage').then(function (res) {
    const today = DBMeter.dateKey();
    const prev = (res.usage && res.usage.date === today && typeof res.usage.seconds === 'object')
      ? res.usage.seconds : {};
    const key = msg.site || 'other';
    prev[key] = Math.min(24 * 3600, (prev[key] || 0) + (Number(msg.delta) || 0));
    return chrome.storage.local.set({ usage: { date: today, seconds: prev } });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'db-usage') {
    recordUsage(msg)
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (e) {
        console.error('DoomBreaker usage failed:', e);
        sendResponse({ ok: false, error: String(e) });
      });
    return true; // async sendResponse
  }
  if (!msg || msg.type !== 'db-feedkill') return;
  loadConfigFromStorage()
    .then(function (cfg) {
      // Always remove the precise ids first (idempotent), plus every generic
      // id we've tracked; add rules back only when turning the kill on.
      const removeIds = RULE_IDS.slice();
      const addRules = [];
      activeGeneric.forEach(function (id) { removeIds.push(id); });
      if (msg.host) removeIds.push(genericIdFor(msg.host));
      if (msg.on) {
        addRules.push.apply(addRules, preciseRules(cfg));
        if (msg.host && !isKnownHost(cfg, msg.host)) {
          const gid = genericIdFor(msg.host);
          activeGeneric.add(gid);
          addRules.push(genericRule(gid, msg.host));
        }
      } else {
        activeGeneric.clear();
      }
      const opts = { removeRuleIds: removeIds };
      if (addRules.length) opts.addRules = addRules;
      return chrome.declarativeNetRequest.updateDynamicRules(opts)
        .then(function () { sendResponse({ ok: true }); });
    })
    .catch(function (e) {
      console.error('DoomBreaker feedkill failed:', e);
      sendResponse({ ok: false, error: String(e) });
    });
  return true; // async sendResponse
});
