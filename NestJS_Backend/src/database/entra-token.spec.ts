import type { AccessToken, TokenCredential } from '@azure/identity';
import { describe, expect, it, vi } from 'vitest';
import {
  azureCliPassword,
  entraPassword,
  POSTGRES_TOKEN_SCOPE,
} from './entra-token.js';

const MINUTE = 60_000;

const azureCli = vi.hoisted(() => ({
  getToken: vi.fn(async () => ({
    token: 'cli-token',
    expiresOnTimestamp: Date.now() + 60 * 60_000,
  })),
}));
vi.mock('@azure/identity', () => ({
  AzureCliCredential: class {
    getToken = azureCli.getToken;
  },
}));

/** A credential handing out numbered tokens that expire `life` after `now`. */
function fakeCredential(now: () => number, life = 60 * MINUTE) {
  let issued = 0;
  const getToken = vi.fn(async (): Promise<AccessToken | null> => {
    issued += 1;
    return { token: `token-${issued}`, expiresOnTimestamp: now() + life };
  });
  return { credential: { getToken } as TokenCredential, getToken };
}

describe('the database password from an Entra ID access token', () => {
  it('asks for a token for Azure Database for PostgreSQL, and reuses it while it is fresh', async () => {
    let clock = 0;
    const { credential, getToken } = fakeCredential(() => clock);
    const password = entraPassword(credential, () => clock);
    expect(await password()).toBe('token-1');
    clock += 50 * MINUTE;
    expect(await password()).toBe('token-1');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(POSTGRES_TOKEN_SCOPE);
    expect(POSTGRES_TOKEN_SCOPE).toBe(
      'https://ossrdbms-aad.database.windows.net/.default',
    );
  });

  it('fetches a new token five minutes before the one it has expires', async () => {
    let clock = 0;
    const { credential } = fakeCredential(() => clock);
    const password = entraPassword(credential, () => clock);
    await password();
    clock += 55 * MINUTE + 1;
    expect(await password()).toBe('token-2');
  });

  it('shares one request between connections opening at once', async () => {
    const { credential, getToken } = fakeCredential(() => 0);
    const password = entraPassword(credential, () => 0);
    expect(await Promise.all([password(), password(), password()])).toEqual([
      'token-1',
      'token-1',
      'token-1',
    ]);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('says to sign in with the Azure CLI when no token comes back, and tries again on the next connection', async () => {
    const getToken = vi
      .fn<TokenCredential['getToken']>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Please run az login'))
      .mockResolvedValueOnce({
        token: 'token-ok',
        expiresOnTimestamp: 60 * MINUTE,
      });
    const password = entraPassword({ getToken }, () => 0);
    await expect(password()).rejects.toThrow(
      'No Entra ID access token for the database: sign in with `az login` and try again.',
    );
    await expect(password()).rejects.toThrow('Please run az login');
    expect(await password()).toBe('token-ok');
  });
});

describe('signing in with the Azure CLI', () => {
  it('keeps one token for every connection in the process, as each `az` request takes seconds', async () => {
    const password = azureCliPassword();
    expect(azureCliPassword()).toBe(password);
    expect(await password()).toBe('cli-token');
    expect(await azureCliPassword()()).toBe('cli-token');
    expect(azureCli.getToken).toHaveBeenCalledTimes(1);
    expect(azureCli.getToken).toHaveBeenCalledWith(POSTGRES_TOKEN_SCOPE);
  });
});
