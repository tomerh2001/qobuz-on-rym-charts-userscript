# Qobuz on RYM Charts

Violentmonkey userscript that hides Rate Your Music chart entries that do not
include a Qobuz link on the current chart page.

The script is intentionally narrow:

- it only runs on `rateyourmusic.com/charts/*`
- it filters release cards, not song/artist rows
- it keeps entries with any `qobuz.com` or `open.qobuz.com` link
- it reapplies itself when RYM adds or redraws chart items

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. Click the install button:

   [![Install in Violentmonkey](https://img.shields.io/badge/Install%20in-Violentmonkey-F7DF1E?style=for-the-badge&logo=github&logoColor=black)](https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js)

3. Confirm the install prompt in Violentmonkey.
4. Open any RYM chart page and the script will hide non-Qobuz entries
   automatically.

## Behavior

- Entries with a Qobuz link stay visible.
- When the filter is on, the script briefly auto-scrolls through the chart to
  trigger lazy-loaded results and media links, so manual scrolling is not
  required before the counts settle.
- Entries without a Qobuz link are then hidden from the page.
- A floating button in the bottom-left corner shows the current mode and counts.
- Click the button to toggle the Qobuz-only filter on or off.
- The on/off preference is saved in local browser storage for later page loads.

## Development

```bash
npm install
npm test
npm run build
```

The built userscript is written to `dist/qobuz-on-rym-charts.user.js`.

## Local Fixture

RYM blocks one-off automated access from this environment, so the repo includes
an offline fixture that mirrors the chart-item selectors used by the live site.

```bash
npm run build
npm run fixture:serve
```

Then open:

`http://127.0.0.1:4173/charts/top/album/all-time/`

The fixture includes a mix of Qobuz and non-Qobuz chart entries so you can
verify the filter behavior locally.

## Releases

This repo follows the same release contract as
`redacted-on-rym-userscript`:

- `fix:` bumps the patch version
- `feat:` bumps the minor version
- `BREAKING CHANGE:` or `!` bumps the major version

On every push to `main`, GitHub Actions runs the CI checks first and then runs
`semantic-release`. The release job updates `package.json`, rebuilds
`dist/qobuz-on-rym-charts.user.js` through the `postversion` hook, creates the
Git tag and GitHub release, and commits the versioned files back to `main`
automatically.

The install and update URLs intentionally point at the latest GitHub release
asset instead of `raw.githubusercontent.com/main/...`, so installs track the
published release artifact rather than the moving branch tip.
