import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import { type IdpMetadata, parseIdpMetadata } from './idp-metadata.js';

const REFRESH_INTERVAL_MS = 24 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_METADATA_BYTES = 1_000_000;
const CERT_EXPIRY_WARNING_MS = 30 * 24 * 3600_000;

export class SsoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsoUnavailableError';
  }
}

/**
 * Okta's SAML metadata (issuer, SSO URL, signing certificates), fetched from
 * SAML_IDP_METADATA_URL and refreshed daily, so Okta certificate rotation needs no
 * redeploy. If a refresh fails the last good copy is kept.
 */
@Injectable()
export class IdpMetadataService {
  private readonly logger = new Logger(IdpMetadataService.name);
  private cached: { metadata: IdpMetadata; fetchedAt: number } | null = null;
  private lastFailureAt = 0;
  private inflight: Promise<IdpMetadata> | null = null;

  constructor(@Inject(ENV) private readonly env: Pick<Env, 'SAML_IDP_METADATA_URL'>) {}

  get isConfigured(): boolean {
    return Boolean(this.env.SAML_IDP_METADATA_URL);
  }

  async current(now = Date.now()): Promise<IdpMetadata> {
    const fresh = this.cached && now - this.cached.fetchedAt < REFRESH_INTERVAL_MS;
    const coolingDown = now - this.lastFailureAt < RETRY_AFTER_FAILURE_MS;
    if (this.cached && (fresh || coolingDown)) {
      return this.cached.metadata;
    }
    if (!this.cached && coolingDown) {
      throw new SsoUnavailableError('IdP metadata is unavailable');
    }
    this.inflight ??= this.load(now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(now: number): Promise<IdpMetadata> {
    const url = this.env.SAML_IDP_METADATA_URL;
    if (!url) {
      throw new SsoUnavailableError('SAML_IDP_METADATA_URL is not set');
    }
    try {
      const metadata = parseIdpMetadata(await this.fetchText(url));
      this.cached = { metadata, fetchedAt: now };
      if (metadata.certsExpireAt.getTime() - now < CERT_EXPIRY_WARNING_MS) {
        this.logger.warn(`An Okta signing certificate expires on ${metadata.certsExpireAt.toISOString()}`);
      }
      return metadata;
    } catch (error) {
      this.lastFailureAt = now;
      this.logger.error(`Could not load IdP metadata: ${(error as Error).message}`);
      if (this.cached) {
        return this.cached.metadata;
      }
      throw new SsoUnavailableError('IdP metadata is unavailable');
    }
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
      headers: { accept: 'application/samlmetadata+xml, application/xml, text/xml' },
    });
    if (!response.ok) {
      throw new Error(`metadata URL answered ${response.status}`);
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_METADATA_BYTES) {
      throw new Error('metadata is too large');
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_METADATA_BYTES) {
      throw new Error('metadata is too large');
    }
    return text;
  }
}
