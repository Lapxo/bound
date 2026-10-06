import { parentPort, workerData } from '../host/io.ts';
import { foldPlace, standingOf } from '../cli/place.ts';
import { renderedOf, unrendered, viewOf } from '../render/view.ts';
import type { View } from './views.ts';

const data = workerData as {
  readonly root: string;
  readonly entry: string;
  readonly place: string;
  readonly told: readonly string[];
  readonly observed: readonly string[];
  readonly views: readonly View[];
};

const standing = standingOf(data.root, data.place || undefined, data.told);
const fold = foldPlace(data.root, data.entry, data.place || undefined, false, { standing, observed: data.observed });
parentPort?.postMessage({
  place: data.place,
  texts: data.views.map((view) => {
    const missing = unrendered(fold, view);
    return { shape: view.shape, missing, text: missing.length ? '' : viewOf(fold, view), said: missing.length ? [] : renderedOf(fold, view) };
  }),
});
