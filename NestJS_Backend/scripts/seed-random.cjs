// Preloaded into every Node process tsx starts (see tsx.mjs): one early call seeds Node's random generator.
globalThis.crypto.getRandomValues(new Uint8Array(32));
