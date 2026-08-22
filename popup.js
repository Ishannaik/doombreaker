// DoomBreaker popup — binds site checkboxes, daily time limit (global +
// per-site), presets, per-effect toggles, heal speed, reset, and the
// sensitivity slider to storage 'settings'.

const SITE_KEYS = ['x', 'reddit', 'instagram', 'youtube', 'linkedin', 'other'];
const EFFECT_KEYS = ['blur', 'cracks', 'glitch', 'shake', 'kill'];
const CAT_KEYS = ['enabled', 'block', 'heal'];

const DEFAULTS = {
  sites: { x: true, reddit: true, instagram: true, youtube: true, linkedin: true, other: true },
  sensitivity: 1,
  timeLimit: { enabled: false, minutes: 60, perSite: {} },
  effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true },
  healSpeed: 1,
  cat: { enabled: true, block: true, heal: true }
};

const PRESETS = {
  gentle: { sensitivity: 0.5, healSpeed: 1.5, effects: { blur: true, cracks: true, glitch: false, shake: false, kill: false } },
  normal: { sensitivity: 1, healSpeed: 1, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true } },
  brutal: { sensitivity: 2, healSpeed: 0.5, effects: { blur: true, cracks: true, glitch: true, shake: true, kill: true } }
};

const slider = document.getElementById('sensitivity');
const sensVal = document.getElementById('sens-val');
const timeEnabled = document.getElementById('time-enabled');
const timeMinutes = document.getElementById('time-minutes');
const healSpeed = document.getElementById('heal-speed');

function siteCheckbox(k) { return document.getElementById('site-' + k); }
function effCheckbox(k) { return document.getElementById('eff-' + k); }
function tlInput(k) { return document.getElementById('tl-' + k); }
function catCheckbox(k) { return document.getElementById('cat-' + k); }

function currentSettings() {
  const sites = {};
  for (const k of SITE_KEYS) sites[k] = siteCheckbox(k).checked;

  const effects = {};
  for (const k of EFFECT_KEYS) effects[k] = effCheckbox(k).checked;

  const cat = {};
  for (const k of CAT_KEYS) cat[k] = catCheckbox(k).checked;

  const perSite = {};
  for (const k of SITE_KEYS) {
    const v = parseInt(tlInput(k).value, 10);
    if (v > 0) perSite[k] = Math.min(720, v);
  }

  return {
    sites: sites,
    sensitivity: Number(slider.value),
    timeLimit: {
      enabled: timeEnabled.checked,
      minutes: Math.max(15, Math.min(720, Math.round(Number(timeMinutes.value) || 60))),
      perSite: perSite
    },
    effects: effects,
    healSpeed: Number(healSpeed.value) || 1,
    cat: cat
  };
}

function save() {
  sensVal.textContent = slider.value;
  chrome.storage.local.set({ settings: currentSettings() });
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  slider.value = p.sensitivity;
  healSpeed.value = String(p.healSpeed);
  for (const k of EFFECT_KEYS) effCheckbox(k).checked = p.effects[k] !== false;
  save();
}

chrome.storage.local.get('settings').then(function (res) {
  const s = res.settings || DEFAULTS;
  const sites = s.sites || DEFAULTS.sites;
  for (const k of SITE_KEYS) siteCheckbox(k).checked = sites[k] !== false;

  const effects = s.effects || DEFAULTS.effects;
  for (const k of EFFECT_KEYS) effCheckbox(k).checked = effects[k] !== false;

  const cat = Object.assign({}, DEFAULTS.cat, s.cat || {});
  for (const k of CAT_KEYS) catCheckbox(k).checked = cat[k] !== false;

  const tl = s.timeLimit || DEFAULTS.timeLimit;
  timeEnabled.checked = !!tl.enabled;
  timeMinutes.value = (typeof tl.minutes === 'number' && tl.minutes > 0) ? tl.minutes : 60;
  const perSite = tl.perSite || {};
  for (const k of SITE_KEYS) tlInput(k).value = perSite[k] > 0 ? perSite[k] : '';

  slider.value = typeof s.sensitivity === 'number' ? s.sensitivity : 1;
  sensVal.textContent = slider.value;
  healSpeed.value = String(typeof s.healSpeed === 'number' && s.healSpeed > 0 ? s.healSpeed : 1);
});

for (const k of SITE_KEYS) siteCheckbox(k).addEventListener('change', save);
for (const k of EFFECT_KEYS) effCheckbox(k).addEventListener('change', save);
for (const k of SITE_KEYS) tlInput(k).addEventListener('change', save);
for (const k of CAT_KEYS) catCheckbox(k).addEventListener('change', save);
timeEnabled.addEventListener('change', save);
timeMinutes.addEventListener('change', save);
healSpeed.addEventListener('change', save);
slider.addEventListener('input', save);

document.getElementById('preset-gentle').addEventListener('click', function () { applyPreset('gentle'); });
document.getElementById('preset-normal').addEventListener('click', function () { applyPreset('normal'); });
document.getElementById('preset-brutal').addEventListener('click', function () { applyPreset('brutal'); });

document.getElementById('btn-reset').addEventListener('click', function () {
  chrome.storage.local.set({ damage: { all: { d: 0, t: Date.now() } } });
});
