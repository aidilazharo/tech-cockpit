import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateServiceProviderMetadata, SAML, type SamlConfig, ValidateInResponseTo } from '@node-saml/node-saml';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import type { IdpMetadata } from './idp-metadata.js';
import { IdpMetadataService } from './idp-metadata.service.js';
import { safeReturnTo } from './return-to.js';
import { assertionRecipients, identityFromProfile, readResponseEnvelope, type SamlIdentity } from './saml-assertion.js';
import { SAML_REQUEST_TTL_MS, SamlRequestStore } from './saml-request.store.js';

const EMAIL_NAME_ID = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
// Tolerated clock difference between Okta and this server.
const CLOCK_SKEW_MS = 60_000;

export const SAML_FAILURES = [
  /** IdP-initiated (Okta dashboard tile): start SP-initiated sign-in instead */
  'unsolicited',
  /** Not a SAML response, bad signature, wrong audience/issuer, expired... */
  'invalid-response',
  /** Answers a sign-in that was not started in this browser (login CSRF) or has expired */
  'request-mismatch',
  /** The response was already used */
  'replayed',
  /** Valid response, but no usable identity in it */
  'invalid-identity',
] as const;
export type SamlFailure = (typeof SAML_FAILURES)[number];

export class SamlLoginError extends Error {
  constructor(
    readonly reason: SamlFailure,
    detail: string,
  ) {
    super(detail);
    this.name = 'SamlLoginError';
  }
}

export interface SamlLoginRequest {
  redirectUrl: string;
  requestId: string;
}

export interface SamlLoginResult {
  identity: SamlIdentity;
  returnTo: string;
}

/**
 * SP-initiated SAML 2.0 with Okta. node-saml checks the XML signature (response and
 * assertion), issuer, audience, timestamps and InResponseTo; this service adds the
 * browser binding, Destination and Recipient checks and one-time use of each request.
 */
@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly metadata: IdpMetadataService,
    private readonly requests: SamlRequestStore,
  ) {}

  get acsUrl(): string {
    return `${this.env.API_BASE_URL}/api/v1/auth/saml/acs`;
  }

  /** SP entity ID: Okta's "Audience URI". */
  get spEntityId(): string {
    return `${this.env.API_BASE_URL}/api/v1/auth/saml/metadata`;
  }

  get isConfigured(): boolean {
    return this.metadata.isConfigured;
  }

  private client(idp: IdpMetadata, requestId?: string): SAML {
    const config: SamlConfig = {
      entryPoint: idp.ssoUrl,
      idpIssuer: idp.entityId,
      idpCert: idp.signingCerts,
      issuer: this.spEntityId,
      audience: this.spEntityId,
      callbackUrl: this.acsUrl,
      identifierFormat: EMAIL_NAME_ID,
      wantAuthnResponseSigned: true,
      wantAssertionsSigned: true,
      validateInResponseTo: ValidateInResponseTo.always,
      requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
      cacheProvider: this.requests,
      acceptedClockSkewMs: CLOCK_SKEW_MS,
      // node-saml 5.1 applies idpIssuer to logout messages only; completeLogin checks it for sign-in.
      // Okta decides how users authenticate (its policies); do not ask for a specific context.
      disableRequestedAuthnContext: true,
      ...(requestId && { generateUniqueId: () => requestId }),
    };
    return new SAML(config);
  }

  /** Builds the redirect to Okta. The returned request ID must be bound to the browser. */
  async startLogin(returnTo: string): Promise<SamlLoginRequest> {
    const requestId = `_${randomBytes(20).toString('hex')}`;
    const saml = this.client(await this.metadata.current(), requestId);
    // RelayState is unused: returnTo is stored server-side with the request.
    const redirectUrl = await saml.getAuthorizeUrlAsync('', undefined, {});
    await this.requests.setReturnTo(requestId, safeReturnTo(returnTo));
    return { redirectUrl, requestId };
  }

  /**
   * Validates a POSTed SAMLResponse. `boundRequestId` is the request ID this browser
   * started (from its cookie); a response to any other request is refused.
   */
  async completeLogin(samlResponse: string, boundRequestId: string | undefined): Promise<SamlLoginResult> {
    const envelope = readResponseEnvelope(samlResponse);
    if (!envelope) {
      throw new SamlLoginError('invalid-response', 'not a SAML Response');
    }
    if (!envelope.inResponseTo) {
      throw new SamlLoginError('unsolicited', 'IdP-initiated response');
    }
    if (!boundRequestId || envelope.inResponseTo !== boundRequestId) {
      throw new SamlLoginError('request-mismatch', 'InResponseTo does not match the sign-in started in this browser');
    }

    const idp = await this.metadata.current();
    let profile;
    try {
      ({ profile } = await this.client(idp).validatePostResponseAsync({ SAMLResponse: samlResponse }));
    } catch (error) {
      throw new SamlLoginError('invalid-response', (error as Error).message);
    }
    if (!profile?.getAssertionXml) {
      throw new SamlLoginError('invalid-response', 'no assertion');
    }
    // All of these are inside signed content (response and assertion signatures are required).
    if (profile.issuer !== idp.entityId || (envelope.issuer !== null && envelope.issuer !== idp.entityId)) {
      throw new SamlLoginError('invalid-response', 'Issuer is not the configured identity provider');
    }
    if (envelope.destination !== this.acsUrl) {
      throw new SamlLoginError('invalid-response', 'Destination is not this service');
    }
    const recipients = assertionRecipients(profile.getAssertionXml());
    if (recipients.length === 0 || recipients.some((recipient) => recipient !== this.acsUrl)) {
      throw new SamlLoginError('invalid-response', 'Recipient is not this service');
    }

    const returnTo = await this.requests.consume(envelope.inResponseTo);
    if (returnTo === null) {
      throw new SamlLoginError('replayed', 'the sign-in request was already used or has expired');
    }
    try {
      return { identity: identityFromProfile(profile), returnTo };
    } catch (error) {
      throw new SamlLoginError('invalid-identity', (error as Error).message);
    }
  }

  /** SP metadata XML for the identity provider's administrators. */
  serviceProviderMetadata(): string {
    return generateServiceProviderMetadata({
      issuer: this.spEntityId,
      callbackUrl: this.acsUrl,
      identifierFormat: EMAIL_NAME_ID,
      wantAssertionsSigned: true,
    });
  }

  logFailure(error: SamlLoginError): void {
    this.logger.warn(`SAML sign-in refused (${error.reason}): ${error.message}`);
  }
}
