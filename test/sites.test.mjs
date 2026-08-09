// DoomBreaker site-config tests — pure node, mirrors the real sites.js logic.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
