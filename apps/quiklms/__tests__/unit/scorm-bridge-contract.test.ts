/**
 * SCORM bridge contract — the server injects a script into every SCORM package's
 * entry HTML (`lib/services/scorm-service.ts:injectScormBridge`) and the client
 * player listens for what it posts (`components/learner/UniversalLMSPlayer.tsx`
 * → `handleScormBridgeMessage`). The two live in different processes and only
 * ever meet at runtime via `postMessage`, so nothing but this test stops them
 * from drifting apart.
 *
 * That drift is not hypothetical: GAP_REPORT §2.3 records that the bridge was
 * dropped entirely during the NestJS→Next.js migration and SCORM courses
 * recorded no progress, no completion and no score — silently, because a
 * package that finds no `window.API` simply fails to initialize.
 *
 * These tests read the player's SOURCE rather than rendering it. Rendering would
 * need the router, providers, api and fullscreen APIs, and would test React
 * wiring instead of the thing that actually breaks: the literal strings the two
 * sides exchange.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn() }, S3_BUCKET: 'b', presignFromUrlOrKey: vi.fn() }));
vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1' }));

import { injectScormBridge } from '@/lib/services/scorm-service';

const playerSource = readFileSync(
  resolve(__dirname, '../../components/learner/UniversalLMSPlayer.tsx'),
  'utf8',
);

/** Drive the injected bridge in a fake window and record everything it posts. */
function emittedTypes(): string[] {
  const html = injectScormBridge('<html><head></head><body/></html>');
  const body = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const posted: Array<{ source: string; type: string }> = [];
  const win: Record<string, any> = {
    addEventListener: () => {},
    parent: { postMessage: (m: any) => posted.push(m) },
  };
  new Function('window', body)(win);

  // Exercise every path that notifies the parent.
  win.API.LMSInitialize();
  win.API.LMSSetValue('cmi.core.score.raw', '90');
  win.API.LMSSetValue('cmi.core.lesson_status', 'completed');
  win.API.LMSCommit();
  win.API.LMSFinish();

  expect(posted.every((p) => p.source === 'scorm-bridge')).toBe(true);
  return [...new Set(posted.map((p) => p.type))];
}

describe('SCORM bridge ⇄ player contract', () => {
  it('every message type the bridge emits is handled by the player', () => {
    const types = emittedTypes();
    // Guards against the bridge silently losing an emit.
    expect(types.sort()).toEqual(['commit', 'completed', 'finish', 'init', 'ready', 'score']);

    for (const type of types) {
      expect(
        playerSource.includes(`msg.type === '${type}'`),
        `UniversalLMSPlayer has no handler for the bridge's '${type}' message`,
      ).toBe(true);
    }
  });

  it('the player filters on the exact source the bridge stamps', () => {
    expect(playerSource).toContain("msg.source !== 'scorm-bridge'");
  });

  it('the player replies with the exact inbound message the bridge listens for', () => {
    // Bridge side: `if(e.data.source==='scorm-lms')` + `e.data.type==='init-data'`.
    const bridge = injectScormBridge('<html><head></head></html>');
    expect(bridge).toContain("source==='scorm-lms'");
    expect(bridge).toContain("e.data.type==='init-data'");

    // Player side must post that same envelope back into the iframe.
    expect(playerSource).toContain("source: 'scorm-lms'");
    expect(playerSource).toContain("type: 'init-data'");
  });

  it('the bridge accepts the init-data payload the player actually sends', () => {
    const html = injectScormBridge('<html><head></head></html>');
    const body = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const listeners: Array<(e: unknown) => void> = [];
    const win: Record<string, any> = {
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
      parent: { postMessage: () => {} },
    };
    new Function('window', body)(win);

    // These are the exact keys UniversalLMSPlayer puts in initPayload.
    listeners[0]({
      data: {
        source: 'scorm-lms',
        type: 'init-data',
        data: {
          'cmi.suspend_data': 'page=3',
          'cmi.core.student_id': 'u1',
          'cmi.core.student_name': 'Doe, Jane',
          'cmi.learner_id': 'u1',
          'cmi.learner_name': 'Jane Doe',
        },
      },
    });

    win.API.LMSInitialize();
    expect(win.API.LMSGetValue('cmi.suspend_data')).toBe('page=3');
    expect(win.API.LMSGetValue('cmi.core.student_name')).toBe('Doe, Jane');
    expect(win.API_1484_11.GetValue('cmi.learner_name')).toBe('Jane Doe');
  });

  it('the player reads the cmi keys the bridge stores under', () => {
    // The player derives completion from these two status keys; a typo on either
    // side means a finished course is never marked complete.
    for (const key of ['cmi.core.lesson_status', 'cmi.completion_status']) {
      expect(playerSource, `player stopped reading ${key}`).toContain(key);
    }
  });
});
