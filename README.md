# Histogram Maker

A small client-side tool for building histograms from pasted data. No build step, no dependencies &mdash; open `index.html` or serve the folder.

## Features

- Live updates as you type (no submit button)
- Adjustable bin count and x-axis min/max
- Outlier detection (1.5&times;IQR rule), with a toggle to remove them or keep them color-coded

## Deploying to GitHub Pages

Push to `main` and enable Pages for the repo (Settings &rarr; Pages &rarr; Deploy from branch), pointing at the root of this branch. No build step is required.
