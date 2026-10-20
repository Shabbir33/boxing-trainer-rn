export {};

// VisionCamera has no web implementation; throwing here makes `tracking/index`
// fall back to tap controls in the browser.
throw new Error('Head tracking is not available on web');
