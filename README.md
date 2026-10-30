# nati2126.github.io

Personal site. Static HTML, CSS and JavaScript with no build step.

```
index.html
css/style.css        design tokens, layout, light + dark themes
js/main.js           theme, clock, nav, reveal, portrait, project animations
js/charts.js         benchmark bars and threshold sweep, built from the HTML tables
assets/              favicon, portrait, CV PDF
```

## Run locally

Serve the folder:

```
python -m http.server 5173
```

Then open http://localhost:5173.

## Deploy (GitHub Pages)

1. Create a public repo named `nati2126.github.io` (served at the root) or any other name (served at `/repo-name`).
2. Push this folder to `main`.
3. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.

## Updating content

- All copy lives in `index.html`.
- To replace the CV, overwrite `assets/Nathnael_Dejene_CV.pdf` and keep the filename.
- Colours are tokens at the top of `css/style.css` (`--accent` is the single accent colour).
- The portrait overlay (face box and landmarks) is hand-placed in `index.html` in
  600×600 image coordinates. Re-place it if you swap the photo.
