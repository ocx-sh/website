// Guards on the Zag machine shapes our two copy wrappers patch or call into. A Zag upgrade that
// moves them must fail here, loudly, instead of silently dropping the patch.
import * as clipboard from '@zag-js/clipboard';
import { describe, expect, it } from 'vitest';
import { connect, machine } from '../src/components/clipboard.zag.mjs';
import { connect as menuConnect, machine as menuMachine } from '../src/components/ui/menu.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';

describe('clipboard.zag.mjs against @zag-js/clipboard', () => {
  const upstream = clipboard.machine.states as Record<string, { on?: Record<string, object | object[]> }>;

  it('upstream still has idle and copied, with COPY handled while copied (the self-transition we reenter)', () => {
    expect(Object.keys(upstream).sort()).toEqual(['copied', 'idle']);
    expect(upstream['copied']?.on?.['COPY']).toBeTruthy();
  });

  it('the patched machine restarts the copied window and keeps every other upstream transition', () => {
    const states = machine.states as typeof upstream;
    expect(states['copied']?.on?.['COPY']).toMatchObject({ reenter: true });
    expect(states['idle']).toBe(upstream['idle']);
    const { COPY: _up, ...rest } = upstream['copied']?.on ?? {};
    const { COPY: _ours, ...ours } = states['copied']?.on ?? {};
    expect(ours).toEqual(rest);
  });

  it('upstream still has the copyToClipboard action we neutralise, and connect is passed through', () => {
    expect(typeof clipboard.machine.implementations?.actions?.copyToClipboard).toBe('function');
    expect(typeof machine.implementations?.actions?.copyToClipboard).toBe('function');
    expect(machine.implementations?.actions?.copyToClipboard).not.toBe(
      clipboard.machine.implementations?.actions?.copyToClipboard,
    );
    expect(connect).toBe(clipboard.connect);
  });
});

describe('copy-menu.zag.mjs against @zag-js/menu', () => {
  it('the menu api still exposes the context trigger handlers the host delegation forwards to', () => {
    const api = ssrApi(menuMachine, menuConnect, { id: 'm' });
    const props = api.getContextTriggerProps() as Record<string, unknown>;
    for (const name of ['oncontextmenu', 'onpointerdown', 'onpointerup', 'onpointermove', 'onpointercancel'])
      expect(typeof props[name], name).toBe('function');
  });
});
