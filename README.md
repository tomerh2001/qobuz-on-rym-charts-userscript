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
2. Open the raw userscript URL:

   `https://raw.githubusercontent.com/tomerh2001/qobuz-on-rym-charts-userscript/main/dist/qobuz-on-rym-charts.user.js`

3. Confirm the install prompt in Violentmonkey.
4. Open any RYM chart page and the script will hide non-Qobuz entries
   automatically.

## Behavior

- Entries with a Qobuz link stay visible.
- Entries without a Qobuz link are hidden from the page.
- A small status chip in the bottom-left corner shows how many chart entries
  are currently shown and hidden.

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

