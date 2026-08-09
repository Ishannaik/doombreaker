# DoomBreaker tasks

Open asks, tracked in the repo so they survive sessions. Check items off when
done; add new ones at the top.

- [ ] Chrome Web Store upload — needs Ishan's dev account login; kit ready in `store/`
- [ ] Multi-tab time-limit accuracy: move the usage counter into the service worker as the single writer (current read-modify-write can undercount by one 5s flush when two tabs write at once)
- [ ] Per-site time limits (current limit is global across all sites)
- [ ] Effect presets in the popup (gentle / normal / brutal)
- [ ] Heal-speed option in the popup
- [ ] Reset-damage button in the popup
