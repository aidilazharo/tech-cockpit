import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdpMetadataError, parseIdpMetadata } from './idp-metadata.js';

const fixture = readFileSync(new URL('../../../test/fixtures/saml/okta-idp-metadata.xml', import.meta.url), 'utf8');

describe('parseIdpMetadata', () => {
  it('reads the entity ID, redirect SSO URL and signing certificate from Okta metadata', () => {
    const metadata = parseIdpMetadata(fixture);

    expect(metadata.entityId).toBe('http://www.okta.com/exkTEST000000000000');
    expect(metadata.ssoUrl).toBe('https://example.okta.com/app/example_techcockpit_1/exkTEST000000000000/sso/saml');
    expect(metadata.signingCerts).toHaveLength(1);
    expect(metadata.signingCerts[0]).toMatch(/^-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----\n$/);
    expect(new X509Certificate(metadata.signingCerts[0]).subject).toContain('techcockpit-test-idp');
    expect(metadata.certsExpireAt.getUTCFullYear()).toBe(2036);
  });

  it('ignores encryption-only keys', () => {
    const withEncryptionKey = fixture.replace(
      '<md:KeyDescriptor use="signing">',
      '<md:KeyDescriptor use="encryption"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>AAAA</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:KeyDescriptor use="signing">',
    );

    expect(parseIdpMetadata(withEncryptionKey).signingCerts).toHaveLength(1);
  });

  it('accepts a key descriptor without a use attribute (signing and encryption)', () => {
    expect(parseIdpMetadata(fixture.replace(' use="signing"', '')).signingCerts).toHaveLength(1);
  });

  it('reads a certificate element that carries attributes', () => {
    expect(parseIdpMetadata(fixture.replace('<ds:X509Certificate>', '<ds:X509Certificate Id="okta">')).signingCerts[0]).toContain('BEGIN CERTIFICATE');
  });

  it.each([
    ['a document type declaration', fixture.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]>')],
    ['not XML', 'not xml at all'],
    ['no entity ID', fixture.replace(' entityID="http://www.okta.com/exkTEST000000000000"', '')],
    ['no IdP descriptor', fixture.replaceAll('IDPSSODescriptor', 'SPSSODescriptor')],
    ['no redirect binding', fixture.replace('bindings:HTTP-Redirect', 'bindings:SOAP')],
    ['an http SSO URL', fixture.replaceAll('https://example.okta.com', 'http://example.okta.com')],
    ['no signing certificate', fixture.replace('use="signing"', 'use="encryption"')],
    ['an invalid certificate', fixture.replace(/<ds:X509Certificate>[\s\S]*<\/ds:X509Certificate>/, '<ds:X509Certificate>AAAA</ds:X509Certificate>')],
    ['an empty certificate', fixture.replace(/<ds:X509Certificate>[\s\S]*<\/ds:X509Certificate>/, '<ds:X509Certificate></ds:X509Certificate>')],
    ['an empty certificate with attributes', fixture.replace(/<ds:X509Certificate>[\s\S]*<\/ds:X509Certificate>/, '<ds:X509Certificate Id="x"/>')],
  ])('rejects metadata with %s', (_label, xml) => {
    expect(() => parseIdpMetadata(xml)).toThrow(IdpMetadataError);
  });
});
