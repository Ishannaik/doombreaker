// DoomBreaker popup — binds site checkboxes, daily time limit, and the
// sensitivity slider to storage 'settings'.

const SITE_KEYS = ['x', 'reddit', 'instagram', 'youtube', 'linkedin', 'other'];

const DEFAULTS = {
  sites: { x: true, reddit: true, instagram: true, youtube: true, linkedin: true, other: true },
  sensitivity: 1,
  timeLimit: { enabled: false, minutes: 60 }
};

const slider = document.getElementById('sensitivity');
const sensVal = document.getElementById('sens-val');
const timeEnabled = document.getElementById('time-enabled');
const timeMinutes = document.getElementById('time-minutes');

function currentSettings() {
  const sites = {};
  for (const k of SITE_KEYS) {
    sites[k] = document.getElementById('site-' + k).checked;
  }
  return {
    sites: sites,
    sensitivity: Number(slider.value),
    timeLimit: {
      enabled: timeEnabled.checked,
      minutes: Math.max(15, Math.min(720, Math.round(Number(timeMinutes.value) || 60)))
    }
  };
}

function save() {
  sensVal.textContent = slider.value;
  chrome.storage.local.set({ settings: currentSettings() });
}

chrome.storage.local.get('settings').then(function (res) {
  const s = res.settings || DEFAULTS;
  const sites = s.sites || DEFAULTS.sites;
  for (const k of SITE_KEYS) {
    document.getElementById('site-' + k).checked = sites[k] !== false;
  }
  const tl = s.timeLimit || DEFAULTS.timeLimit;
  timeEnabled.checked = !!tl.enabled;
  timeMinutes.value = (typeof tl.minutes === 'number' && tl.minutes > 0) ? tl.minutes : 60;
  slider.value = typeof s.sensitivity === 'number' ? s.sensitivity : 1;
  sensVal.textContent = slider.value;
});

for (const k of SITE_KEYS) {
  document.getElementById('site-' + k).addEventListener('change', save);
}
timeEnabled.addEventListener('change', save);
timeMinutes.addEventListener('change', save);
slider.addEventListener('input', save);
