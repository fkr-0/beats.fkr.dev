# beats.fkr.dev

Small, dependency-free listening room for current Sample Lab output. It is designed to be served directly from GitHub Pages at `https://beats.fkr.dev/`.

The UI intentionally keeps editorial metadata loose: every track needs a title and audio file; `status`, `bpm`, `key`, and a freeform `note` are optional. Duration is read from the media file by the browser.

## Local preview

```sh
python -m http.server 4173
# open http://127.0.0.1:4173/
```

Do not open `index.html` through `file://`: the browser blocks `catalog.json` fetches there.

## Add a track

1. Put a web-sized MP3 in `audio/` (320 kbps is a useful listening-master target).
2. Add one object to `catalog.json`.
3. Run `python scripts/validate.py`.

Example:

```json
{
  "id": "my-beat",
  "title": "My Beat",
  "src": "audio/my-beat.mp3",
  "status": "demo",
  "bpm": 92,
  "key": "D minor",
  "note": "Any short editorial note can live here."
}
```

`status` is display text rather than a hard enum: `demo`, `published`, `released`, `sketch`, or a future label all work without code changes. The note is rendered as text, not HTML.

## GitHub Pages

`.github/workflows/pages.yml` validates the catalog, builds a clean `_site/` artifact, then publishes that directory using GitHub's Pages artifact workflow. `CNAME` declares `beats.fkr.dev` as the custom domain. The repository must have Pages configured to use **GitHub Actions**, and DNS must point `beats.fkr.dev` at the account's Pages hostname.

MP3 files can be served as ordinary same-origin static assets. Keep listening copies compact and do not use Git LFS for Pages media. If the catalog grows into hundreds of megabytes, move audio to object storage/CDN and leave the site/catalog on Pages.

## Files

```text
index.html                  document + player shell
assets/styles.css           moody responsive presentation
assets/app.js               catalog, player, Web Audio analyser, canvas visualizer
catalog.json                tiny editorial catalog
audio/*.mp3                 web listening copies
scripts/validate.py         catalog/media integrity checks
scripts/build_site.py       assemble only public files into _site/
.github/workflows/pages.yml GitHub Pages deployment
CNAME                       custom domain
```
