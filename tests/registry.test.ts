import { describe, it, expect } from 'vitest';
import { register, hasBlock, hasInline, getDefinition } from '../src/registry';

describe('Phase 2 — Plugin Registry', () => {
  it('block plugin: both aliases return hasBlock() === true', () => {
    register({
      type: 'block',
      aliases: ['myblock', 'mb'],
      render: () => '<div>block</div>',
    });
    expect(hasBlock('myblock')).toBe(true);
    expect(hasBlock('mb')).toBe(true);
  });

  it('inline plugin: hasBlock() false, hasInline() true', () => {
    register({
      type: 'inline',
      aliases: ['myinline'],
      render: () => '<span>inline</span>',
    });
    expect(hasBlock('myinline')).toBe(false);
    expect(hasInline('myinline')).toBe(true);
  });

  it('getDefinition returns undefined for unregistered name', () => {
    expect(getDefinition('not-registered-xyz')).toBeUndefined();
  });

  it('two plugins with different names have no cross-contamination', () => {
    register({
      type: 'block',
      aliases: ['alpha'],
      render: () => 'alpha-output',
    });
    register({
      type: 'inline',
      aliases: ['beta'],
      render: () => 'beta-output',
    });
    expect(hasBlock('alpha')).toBe(true);
    expect(hasInline('alpha')).toBe(false);
    expect(hasBlock('beta')).toBe(false);
    expect(hasInline('beta')).toBe(true);
  });

  it('render() of a registered plugin is called with correct arguments', () => {
    const calls: Array<[string | null, string | null, object]> = [];
    register({
      type: 'block',
      aliases: ['testrender'],
      render: (args, body, env) => {
        calls.push([args, body, env]);
        return '<div>result</div>';
      },
    });
    const def = getDefinition('testrender');
    const env = { docId: 42 };
    const result = def!.render('myarg', 'body text', env);
    expect(result).toBe('<div>result</div>');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['myarg', 'body text', env]);
  });
});
