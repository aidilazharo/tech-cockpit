import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { SignedXml } from 'xml-crypto';
import type { IdpMetadata } from '../../../src/modules/auth/idp-metadata.js';

/**
 * A stand-in for Okta in tests. Its RSA key pair is generated at run time, so no
 * private key is ever committed; the backend trusts its public key.
 */
export const TEST_IDP_ENTITY_ID = 'http://www.okta.com/exkE2ETESTIDP0000000';
export const TEST_IDP_SSO_URL = 'https://test-idp.example.com/app/techcockpit/exkE2ETESTIDP0000000/sso/saml';

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

const idpKeys = keyPair();
/** A key Okta does not have: responses signed with it must be refused. */
export const attackerKeys = keyPair();

export function testIdpMetadata(): IdpMetadata {
  return {
    entityId: TEST_IDP_ENTITY_ID,
    ssoUrl: TEST_IDP_SSO_URL,
    signingCerts: [idpKeys.publicKey],
    certsExpireAt: new Date('2099-01-01T00:00:00Z'),
  };
}

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const newId = () => `id${randomBytes(16).toString('hex')}`;

export interface ResponseOptions {
  inResponseTo?: string | null;
  nameId?: string;
  attributes?: Record<string, string>;
  destination?: string | null;
  recipient?: string;
  audience?: string;
  issuer?: string;
  /** When the assertion was issued (default: now) */
  issuedAt?: Date;
  /** Lifetime of the assertion (default: 5 minutes, like Okta) */
  validForMs?: number;
  signResponse?: boolean;
  signAssertion?: boolean;
  signingKey?: string;
  /** Applied to the XML after signing (tampering) */
  afterSigning?: (xml: string) => string;
  /** Okta's answer to a passive request when nobody is signed in: no assertion at all */
  noPassive?: boolean;
}

export const ACS_URL = 'http://localhost:3000/api/v1/auth/saml/acs';
export const SP_ENTITY_ID = 'http://localhost:3000/api/v1/auth/saml/metadata';

function sign(xml: string, elementXPath: string, privateKey: string): string {
  const signature = new SignedXml({ privateKey, signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: EXC_C14N });
  signature.addReference({ xpath: elementXPath, transforms: [ENVELOPED, EXC_C14N], digestAlgorithm: SHA256 });
  signature.computeSignature(xml, {
    location: { reference: `${elementXPath}/*[local-name(.)='Issuer']`, action: 'after' },
  });
  return signature.getSignedXml();
}

/** An Okta-shaped SAML response, base64 encoded as posted to the ACS. */
export function samlResponse(options: ResponseOptions = {}): string {
  const issuedAt = options.issuedAt ?? new Date();
  const until = new Date(issuedAt.getTime() + (options.validForMs ?? 5 * 60_000)).toISOString();
  const notBefore = new Date(issuedAt.getTime() - 5 * 60_000).toISOString();
  const instant = issuedAt.toISOString();
  const issuer = escape(options.issuer ?? TEST_IDP_ENTITY_ID);
  const inResponseTo = options.inResponseTo === undefined ? null : options.inResponseTo;
  const inResponseToAttribute = inResponseTo ? ` InResponseTo="${escape(inResponseTo)}"` : '';
  const destination = options.destination === undefined ? ACS_URL : options.destination;
  const destinationAttribute = destination ? ` Destination="${escape(destination)}"` : '';
  const attributes = Object.entries(options.attributes ?? {})
    .map(
      ([name, value]) =>
        `<saml2:Attribute Name="${escape(name)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">` +
        `<saml2:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${escape(value)}</saml2:AttributeValue>` +
        '</saml2:Attribute>',
    )
    .join('');

  let xml =
    `<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol"${destinationAttribute} ID="${newId()}"${inResponseToAttribute} IssueInstant="${instant}" Version="2.0">` +
    `<saml2:Issuer xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">${issuer}</saml2:Issuer>` +
    (options.noPassive
      ? '<saml2p:Status><saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"><saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:NoPassive"/></saml2p:StatusCode></saml2p:Status></saml2p:Response>'
      : '<saml2p:Status><saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></saml2p:Status>') +
    `<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="${newId()}" IssueInstant="${instant}" Version="2.0">` +
    `<saml2:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">${issuer}</saml2:Issuer>` +
    '<saml2:Subject>' +
    `<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${escape(options.nameId ?? 'someone@test.aia.com')}</saml2:NameID>` +
    '<saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">' +
    `<saml2:SubjectConfirmationData${inResponseToAttribute} NotOnOrAfter="${until}" Recipient="${escape(options.recipient ?? ACS_URL)}"/>` +
    '</saml2:SubjectConfirmation>' +
    '</saml2:Subject>' +
    `<saml2:Conditions NotBefore="${notBefore}" NotOnOrAfter="${until}">` +
    `<saml2:AudienceRestriction><saml2:Audience>${escape(options.audience ?? SP_ENTITY_ID)}</saml2:Audience></saml2:AudienceRestriction>` +
    '</saml2:Conditions>' +
    `<saml2:AuthnStatement AuthnInstant="${instant}" SessionIndex="${newId()}">` +
    '<saml2:AuthnContext><saml2:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml2:AuthnContextClassRef></saml2:AuthnContext>' +
    '</saml2:AuthnStatement>' +
    (attributes ? `<saml2:AttributeStatement>${attributes}</saml2:AttributeStatement>` : '') +
    '</saml2:Assertion>' +
    '</saml2p:Response>';

  if (options.noPassive) {
    xml = xml.slice(0, xml.indexOf('</saml2p:Response>') + '</saml2p:Response>'.length);
  }
  const key = options.signingKey ?? idpKeys.privateKey;
  if ((options.signAssertion ?? true) && !options.noPassive) {
    xml = sign(xml, "/*[local-name(.)='Response']/*[local-name(.)='Assertion']", key);
  }
  if (options.signResponse ?? true) {
    xml = sign(xml, "/*[local-name(.)='Response']", key);
  }
  if (options.afterSigning) {
    xml = options.afterSigning(xml);
  }
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** Decodes the AuthnRequest TechCockpit sent to the IdP (HTTP-Redirect binding). */
export function decodeAuthnRequest(location: string): string {
  const request = new URL(location).searchParams.get('SAMLRequest');
  if (!request) throw new Error('No SAMLRequest in the redirect');
  return inflateRawSync(Buffer.from(request, 'base64')).toString('utf8');
}
