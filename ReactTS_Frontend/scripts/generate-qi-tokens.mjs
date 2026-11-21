#!/usr/bin/env node
// Usage: npm run tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { buildQiCss } from './qi-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design-tokens/qi-tokens.json', import.meta.url), 'utf8'));
const target = new URL('../src/styles/qi-tokens.css', import.meta.url);
writeFileSync(target, buildQiCss(tokens));
console.log('Wrote src/styles/qi-tokens.css');
