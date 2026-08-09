// DoomBreaker popup — binds site checkboxes + sensitivity slider to storage 'settings'.

const SITE_KEYS = ['x', 'reddit', 'instagram', 'youtube', 'linkedin', 'other'];

const DEFAULTS = {
  sites: { x: true, reddit: true, instagram: true, youtube: true, linkedin: true, other: true },
  sensitivity: 1
};

const slider = document.getElementById('sensitivity');
const sensVal = document.getElementById('sens-val');

function currentSettings() {
  const sites = {};
  for (const k of SITE_KEYS) {
    sites[k] = document.getElementById('site-' + k).checked;
  }
  return { sites: sites, sensitivity: Number(slider.value) };
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
  slider.value = typeof s.sensitivity === 'number' ? s.sensitivity : 1;
  sensVal.textContent = slider.value;
});

for (const k of SITE_KEYS) {
  document.getElementById('site-' + k).addEventListener('change', save);
}
slider.addEventListener('input', save);
