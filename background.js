// DoomBreaker — service worker. Feed-kill via declarativeNetRequest dynamic rules.

const RULE_IDS = [101, 102, 103, 104, 105, 106];

const RULES = [
  { id: 101, filter: '||x.com/i/api/graphql' },
  { id: 102, filter: '||twitter.com/i/api/graphql' },
  { id: 103, filter: '||reddit.com/svc/shreddit/' },
  { id: 104, filter: '||instagram.com/graphql/query' },
  { id: 105, filter: '||youtube.com/youtubei/v1/reel/' },
  { id: 106, filter: '||linkedin.com/voyager/api/feed' }
].map(function (r) {
  return {
    id: r.id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: r.filter,
      resourceTypes: ['xmlhttprequest']
    }
  };
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'db-feedkill') return;
  // Idempotent: always remove the ids first, then re-add when turning on.
  const opts = { removeRuleIds: RULE_IDS };
  if (msg.on) opts.addRules = RULES;
  chrome.declarativeNetRequest.updateDynamicRules(opts)
    .then(function () { sendResponse({ ok: true }); })
    .catch(function (e) {
      console.error('DoomBreaker feedkill failed:', e);
      sendResponse({ ok: false, error: String(e) });
    });
  return true; // async sendResponse
});
