import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionedMemoryStore } from '../../src/experimental/versioned-memory-store';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('VersionedMemoryStore', () => {
  it('commits compare-and-set synchronously and rejects a stale version', async () => {
    const store = new VersionedMemoryStore<string>();
    const absent = await store.read('key');
    const first = store.compareExchange('key', absent.version, 'one');
    const stale = await store.compareExchange('key', absent.version, 'two');

    expect(stale.exchanged).toBe(false);
    expect(stale.entry).toEqual({
      present: true,
      value: 'one',
      version: (await first).entry.version,
    });
    expect(await store.read('key')).toMatchObject({ present: true, value: 'one' });
    expect(await store.deleteIfVersion('missing', absent.version)).toBe(false);
  });

  it('uses a fresh version after delete and recreation to prevent ABA', async () => {
    const store = new VersionedMemoryStore<string>();
    const absent = await store.read('key');
    const created = await store.compareExchange('key', absent.version, 'one');

    expect(await store.deleteIfVersion('key', created.entry.version)).toBe(true);
    const newAbsent = await store.read('key');
    const recreated = await store.compareExchange('key', newAbsent.version, 'one');

    expect(recreated.exchanged).toBe(true);
    expect(recreated.entry.version).not.toBe(created.entry.version);
    expect(await store.deleteIfVersion('key', created.entry.version)).toBe(false);
  });

  it('invalidates a present version on expiry', async () => {
    vi.useFakeTimers();
    const store = new VersionedMemoryStore<string>();
    const absent = await store.read('key');
    const inserted = await store.compareExchange('key', absent.version, 'short-lived', 10);

    await vi.advanceTimersByTimeAsync(10);
    const expired = await store.read('key');
    const stale = await store.compareExchange('key', inserted.entry.version, 'replacement');

    expect(expired.present).toBe(false);
    expect(stale.exchanged).toBe(false);
  });

  it('distinguishes missing undefined from a present undefined value', async () => {
    const store = new VersionedMemoryStore<undefined>();
    const absent = await store.read('key');
    const inserted = await store.compareExchange('key', absent.version, undefined);

    expect(absent.present).toBe(false);
    expect(inserted.entry).toMatchObject({ present: true, value: undefined });
    expect(await store.read('key')).toMatchObject({ present: true, value: undefined });
  });

  it('makes missing versions conservative across mutations and distinct across stores', async () => {
    const first = new VersionedMemoryStore<string>();
    const second = new VersionedMemoryStore<string>();
    const firstAbsent = await first.read('unrelated');
    const otherAbsent = await second.read('unrelated');

    expect(firstAbsent.version).not.toBe(otherAbsent.version);
    await first.compareExchange('other-key', (await first.read('other-key')).version, 'value');
    expect((await first.compareExchange('unrelated', firstAbsent.version, 'late')).exchanged).toBe(
      false,
    );
  });

  it('rejects invalid TTLs and keeps fallback instance IDs distinct without crypto', async () => {
    vi.stubGlobal('crypto', undefined);
    const first = new VersionedMemoryStore<string>();
    const second = new VersionedMemoryStore<string>();
    const firstAbsent = await first.read('key');
    const secondAbsent = await second.read('key');

    expect(firstAbsent.version).not.toBe(secondAbsent.version);
    await expect(
      first.compareExchange('key', firstAbsent.version, 'value', Number.NaN),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
