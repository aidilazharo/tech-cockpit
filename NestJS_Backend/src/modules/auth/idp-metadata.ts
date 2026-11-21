import { X509Certificate } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const REDIRECT_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';

/** What TechCockpit needs from the identity provider (Okta) to run SP-initiated SAML sign-in. */
export interface IdpMetadata {
  /** Expected Issuer of SAML responses */
  entityId: string;
  /** Where the browser is sent with the AuthnRequest (HTTP-Redirect binding) */
  ssoUrl: string;
  /** PEM certificates that may sign responses (several during Okta key rotation) */
  signingCerts: string[];
  /** Earliest expiry among the signing certificates */
  certsExpireAt: Date;
}

export class IdpMetadataError extends Error {
  constructor(message: string) {
    super(`Invalid IdP metadata: ${message}`);
    this.name = 'IdpMetadataError';
  }
}

type XmlNode = Record<string, unknown>;

const LIST_ELEMENTS = new Set(['IDPSSODescriptor', 'KeyDescriptor', 'SingleSignOnService', 'X509Certificate']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  // Never expand entities: metadata is fetched over the network.
  processEntities: false,
  parseTagValue: false,
  isArray: (name) => LIST_ELEMENTS.has(name),
});

function nodes(parent: unknown, name: string): XmlNode[] {
  const value = (parent as XmlNode | undefined)?.[name];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function toPem(base64: string): string {
  const body = base64.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function certificateText(value: unknown): string {
  if (typeof value === 'string') return value;
  const text = (value as XmlNode | undefined)?.['#text'];
  return typeof text === 'string' ? text : '';
}

/** Parses SAML 2.0 IdP metadata (an EntityDescriptor with one IDPSSODescriptor). */
export function parseIdpMetadata(xml: string): IdpMetadata {
  if (/<!DOCTYPE/i.test(xml)) {
    throw new IdpMetadataError('document type declarations are not allowed');
  }
  let document: XmlNode;
  try {
    document = parser.parse(xml, true) as XmlNode;
  } catch {
    throw new IdpMetadataError('not well-formed XML');
  }

  const entity = document.EntityDescriptor as XmlNode | undefined;
  const entityId = entity?.['@entityID'];
  if (typeof entityId !== 'string' || !entityId) {
    throw new IdpMetadataError('EntityDescriptor has no entityID');
  }
  const [idp] = nodes(entity, 'IDPSSODescriptor');
  if (!idp) {
    throw new IdpMetadataError('no IDPSSODescriptor');
  }

  const sso = nodes(idp, 'SingleSignOnService').find((service) => service['@Binding'] === REDIRECT_BINDING);
  const ssoUrl = sso?.['@Location'];
  if (typeof ssoUrl !== 'string' || !ssoUrl.startsWith('https://')) {
    throw new IdpMetadataError('no https SingleSignOnService for the HTTP-Redirect binding');
  }

  const signingCerts = nodes(idp, 'KeyDescriptor')
    .filter((key) => key['@use'] === undefined || key['@use'] === 'signing')
    .flatMap((key) => nodes((key.KeyInfo as XmlNode | undefined)?.X509Data, 'X509Certificate'))
    .map((cert) => toPem(certificateText(cert)));
  if (signingCerts.length === 0) {
    throw new IdpMetadataError('no signing certificate');
  }

  let expiries: number[];
  try {
    expiries = signingCerts.map((pem) => Date.parse(new X509Certificate(pem).validTo));
  } catch {
    throw new IdpMetadataError('a signing certificate could not be read');
  }

  return { entityId, ssoUrl, signingCerts, certsExpireAt: new Date(Math.min(...expiries)) };
}
