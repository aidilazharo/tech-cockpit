import {
  AzureCliCredential,
  type AccessToken,
  type TokenCredential,
} from '@azure/identity';

/** The audience of Entra ID access tokens for Azure Database for PostgreSQL. */
export const POSTGRES_TOKEN_SCOPE =
  'https://ossrdbms-aad.database.windows.net/.default';

/** A token is fetched again this long before it expires, so a connection never opens with one about to lapse. */
const REFRESH_BEFORE_MS = 5 * 60_000;

/**
 * A password function for the `pg` driver: the database password is an Entra ID access token from `credential`,
 * fetched for each new connection and reused while it is fresh. Connections opening at once share one request; a
 * failed request is tried again by the next connection.
 */
export function entraPassword(
  credential: TokenCredential,
  now: () => number = Date.now,
): () => Promise<string> {
  let current: AccessToken | null = null;
  let pending: Promise<AccessToken> | null = null;
  const fetchToken = async (): Promise<AccessToken> => {
    const token = await credential.getToken(POSTGRES_TOKEN_SCOPE);
    if (!token)
      throw new Error(
        'No Entra ID access token for the database: sign in with `az login` and try again.',
      );
    return token;
  };
  return async () => {
    if (current && current.expiresOnTimestamp - now() > REFRESH_BEFORE_MS)
      return current.token;
    pending ??= fetchToken().finally(() => {
      pending = null;
    });
    current = await pending;
    return current.token;
  };
}

let sharedAzureCliPassword: (() => Promise<string>) | undefined;

/**
 * The Azure CLI's existing sign-in, with one token cache for the whole process: each `az` request takes seconds.
 *
 * It only reads the sign-in (`az account get-access-token`, asked for the database scope alone): it never runs
 * `az login`, and never changes the signed-in account or subscription.
 */
export function azureCliPassword(): () => Promise<string> {
  return (sharedAzureCliPassword ??= entraPassword(new AzureCliCredential()));
}
