# Qobuz + Tidal on RYM Charts

Violentmonkey userscript that hides Rate Your Music chart entries that do not
include a Qobuz or Tidal link on the current chart page.

The script is intentionally narrow:

- it only runs on `rateyourmusic.com/charts/*`
- it filters release cards, not song/artist rows
- it keeps entries with any `qobuz.com`, `open.qobuz.com`, or `tidal.com` link
- it reapplies itself when RYM adds or redraws chart items

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. Click the install button:

   [![Install in Violentmonkey](https://img.shields.io/badge/Install%20in-Violentmonkey-F7DF1E?style=for-the-badge&logo=github&logoColor=black)](https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js)

3. Confirm the install prompt in Violentmonkey.
4. Open any RYM chart page and the script will hide entries without Qobuz or
   Tidal links
   automatically.

## Behavior

- Entries with a Qobuz or Tidal link stay visible.
- When the filter is on, the script repeatedly jumps to the current bottom of
  the chart to trigger lazy-loaded results and media links, then repeats until
  the page height stops growing, so manual scrolling is not required before the
  counts settle.
- Once a page has already been scanned, switching between Qobuz, Tidal, and
  off reuses the current page state instead of rescanning immediately.
- Entries without a link for the active provider are hidden from the page.
- A floating control panel in the bottom-left corner shows the current counts.
- It includes separate `Qobuz` and `Tidal` buttons, and only one provider can
  be active at a time.
- Clicking the active provider button again turns filtering off and shows
  everything.
- The current mode is saved in local browser storage for later page loads.

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

The fixture includes a mix of Qobuz, Tidal, and unsupported chart entries so
you can verify the filter behavior locally.

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
