import type { Plugin } from 'vite';
export function atgvPreviewEnabled(env?: NodeJS.ProcessEnv): boolean;
export function mockAtgvResponse(method?: string, path?: string): { status: number; body: unknown } | null;
export function createAtgvPreviewPlugin(): Plugin;
