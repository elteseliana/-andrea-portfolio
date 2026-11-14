// TODO: real prices (USD). Card prices on the page show the Sedan column.
export const PRICES = {
  Wash: { Sedan: 79, SUV: 99, Truck: 119 },
  Polish: { Sedan: 249, SUV: 299, Truck: 349 },
  Ceramic: { Sedan: 899, SUV: 1099, Truck: 1249 },
};

// Scroll length of the wash sequence lives in CSS (.seq height). Other tunables:
export const SEQUENCE = {
  maxDpr: 2,                 // cap devicePixelRatio for the canvas (sharp but not wasteful)
  concurrency: 6,            // parallel frame downloads
  firstFrames: 10,           // these load first so the page appears fast
  criticalStride: 16,        // ...plus every Nth frame, so any scroll position has a nearby frame
  portraitMinVisible: 0.6,   // on tall phone screens, keep at least 60% of the footage width visible
};
