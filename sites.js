// DoomBreaker site config — pure logic, no chrome/DOM APIs.
// Shared by content script (isolated world global) and node tests.
// The remote config/sites.json is the source of truth for per-site rules;
// DEFAULT_CONFIG here is the offline fallback so the extension still works
// before the first fetch or when the network is down.

const DBSites = {
  CONFIG_URL: 'https://raw.githubusercontent.com/Ishannaik/doombreaker/main/config/sites.json',
  CONFIG_KEY: 'dbConfig',
  REFRESH_MINUTES: 360, // 6h: matches uBlock's remote-asset refresh pattern

  DEFAULT_CONFIG: {
    version: 1,
    sites: [
      { key: 'x',         host: '(^|\\.)(x|twitter)\\.com$',                  mode: 'wheel' },
      { key: 'reddit',    host: '(^|\\.)reddit\\.com$',                       mode: 'wheel' },
      { key: 'instagram', host: '(^|\\.)instagram\\.com$',                    activePaths: ['/'], activePrefixes: ['/reel'], videoPrefixes: ['/reel'] },
      { key: 'youtube',   host: '(^|\\.)youtube\\.com$',                      activePrefixes: ['/shorts'], videoPrefixes: ['/shorts'], videoPath: '^/shorts/[^/]+' },
      { key: 'linkedin',  host: '(^|\\.)linkedin\\.com$',                     activePrefixes: ['/feed'] }
    ],
    kill: {
      x: ['||x.com/i/api/graphql', '||twitter.com/i/api/graphql'],
      reddit: ['||reddit.com/svc/shreddit/'],
      instagram: ['||instagram.com/graphql/query'],
      youtube: ['||youtube.com/youtubei/v1/reel/'],
      linkedin: ['||linkedin.com/voyager/api/feed']
    }
  },

  // A fetched config must look like the real thing or we keep the old one.
  validConfig(c) {
    if (!c || typeof c !== 'object') return false;
    if (!Array.isArray(c.sites) || c.sites.length === 0) return false;
    if (!c.kill || typeof c.kill !== 'object') return false;
    return c.sites.every(function (s) {
      return s && typeof s.key === 'string' && typeof s.host === 'string';
    });
  },

  // First config entry whose host regex matches the hostname; else the
  // generic always-active wheel site (site-agnostic fallback).
  matchSite(cfg, hostname) {
    const sites = (cfg && Array.isArray(cfg.sites)) ? cfg.sites : [];
    for (const s of sites) {
      try {
        if (new RegExp(s.host).test(hostname)) return s;
      } catch (e) { /* malformed regex in config; skip */ }
    }
    return { key: 'other', host: '', mode: 'wheel' };
  },

  // activePaths match exactly; activePrefixes match by prefix. Both absent
  // means active on every path of the host.
  siteActive(s, pathname) {
    const paths = s.activePaths || [];
    if (paths.indexOf(pathname) !== -1) return true;
    const prefixes = s.activePrefixes || [];
    if (prefixes.length === 0 && paths.length === 0) return true;
    return prefixes.some(function (p) { return pathname.startsWith(p); });
  },

  // videoPrefixes set the mode to 'video' on matching paths; else site mode.
  siteMode(s, pathname) {
    if (s.videoPrefixes && s.videoPrefixes.some(function (p) { return pathname.startsWith(p); })) {
      return 'video';
    }
    return s.mode || 'wheel';
  },

  // A path change counts as a video only if it matches the site's videoPath
  // regex (youtube /shorts/<id>) or, by default, one of its videoPrefixes.
  isVideoPath(s, pathname) {
    if (s.videoPath) {
      try { return new RegExp(s.videoPath).test(pathname); } catch (e) { return false; }
    }
    if (s.videoPrefixes) {
      return s.videoPrefixes.some(function (p) { return pathname.startsWith(p); });
    }
    return false;
  }
};

if (typeof module !== 'undefined') module.exports = DBSites;
