import type { Profile } from '@node-saml/node-saml';
import { describe, expect, it } from 'vitest';
import { assertionRecipients, identityFromProfile, readResponseEnvelope, SamlIdentityError } from './saml-assertion.js';

const b64 = (xml: string) => Buffer.from(xml, 'utf8').toString('base64');

describe('readResponseEnvelope', () => {
  it('reads InResponseTo and Destination from a SAML response', () => {
    const xml = `<?xml version="1.0"?><saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" ID="id1" InResponseTo="_req1" Destination="http://localhost:3000/api/v1/auth/saml/acs" Version="2.0"><saml2:Issuer xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity"> http://www.okta.com/exk1 </saml2:Issuer></saml2p:Response>`;

    expect(readResponseEnvelope(b64(xml))).toEqual({
      inResponseTo: '_req1',
      destination: 'http://localhost:3000/api/v1/auth/saml/acs',
      issuer: 'http://www.okta.com/exk1',
    });
  });

  it('reports an IdP-initiated (unsolicited) response as having no InResponseTo', () => {
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="id1" Version="2.0"/>`;

    expect(readResponseEnvelope(b64(xml))).toEqual({ inResponseTo: null, destination: null, issuer: null });
  });

  it('reads an Issuer without attributes', () => {
    const xml = `<Response ID="id1"><Issuer>http://www.okta.com/exk1</Issuer></Response>`;

    expect(readResponseEnvelope(b64(xml))?.issuer).toBe('http://www.okta.com/exk1');
  });

  it.each([
    ['not base64 XML', 'not-xml'],
    ['a document type declaration', b64('<!DOCTYPE r [<!ENTITY x "y">]><Response ID="a"/>')],
    ['another root element', b64('<LogoutResponse ID="a"/>')],
    ['an empty value', ''],
  ])('returns null for %s', (_label, value) => {
    expect(readResponseEnvelope(value)).toBeNull();
  });
});

describe('assertionRecipients', () => {
  it('lists the Recipient of every bearer subject confirmation', () => {
    const xml = `<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion"><saml2:Subject>
      <saml2:NameID>a@b.com</saml2:NameID>
      <saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml2:SubjectConfirmationData InResponseTo="_r" NotOnOrAfter="2026-10-21T10:05:00Z" Recipient="http://localhost:3000/api/v1/auth/saml/acs"/>
      </saml2:SubjectConfirmation>
      <saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:holder-of-key">
        <saml2:SubjectConfirmationData Recipient="https://elsewhere.example.com"/>
      </saml2:SubjectConfirmation>
    </saml2:Subject></saml2:Assertion>`;

    expect(assertionRecipients(xml)).toEqual(['http://localhost:3000/api/v1/auth/saml/acs']);
  });

  it('returns nothing when there is no subject confirmation', () => {
    expect(assertionRecipients('<Assertion><Subject><NameID>a@b.com</NameID></Subject></Assertion>')).toEqual([]);
  });
});

function profile(overrides: Partial<Profile> & { attributes?: Record<string, unknown> } = {}): Profile {
  return {
    issuer: 'http://www.okta.com/exk',
    nameID: 'Terry.Chew@Example.com',
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    attributes: { email: 'terry.chew@example.com', firstName: 'Terry', lastName: 'Chew', userType: 'Employee' },
    ...overrides,
  };
}

describe('identityFromProfile', () => {
  it('takes the Okta username from the NameID (trimmed, lower-cased) and the email and names Okta sent', () => {
    expect(identityFromProfile(profile({ nameID: ' Terry.Chew@Example.com ' }))).toEqual({
      username: 'terry.chew@example.com',
      email: 'terry.chew@example.com',
      firstName: 'Terry',
      lastName: 'Chew',
    });
  });

  it('accepts a username that is not an email, such as a staff ID', () => {
    expect(identityFromProfile(profile({ nameID: 'A1234567' })).username).toBe('a1234567');
  });

  it('has no email when Okta sends none, or one that is not an email address', () => {
    expect(identityFromProfile(profile({ attributes: { firstName: 'Ana' } })).email).toBeNull();
    expect(identityFromProfile(profile({ attributes: { email: 'not-an-email' } })).email).toBeNull();
    expect(identityFromProfile(profile({ attributes: { email: ' Ana.Lim@Example.com ' } })).email).toBe('ana.lim@example.com');
  });

  it('uses the first value of a multi-valued attribute and trims names', () => {
    const identity = identityFromProfile(profile({ attributes: { firstName: ['  Ana ', 'Other'], lastName: ' Lim ' } }));

    expect([identity.firstName, identity.lastName]).toEqual(['Ana', 'Lim']);
  });

  it('accepts missing names (some users have a single name) and truncates long ones', () => {
    const identity = identityFromProfile(profile({ attributes: { firstName: 'x'.repeat(150) } }));

    expect(identity.firstName).toHaveLength(100);
    expect(identity.lastName).toBe('');
  });

  it.each([
    ['an empty NameID', profile({ nameID: '  ' })],
    ['a NameID with spaces inside', profile({ nameID: 'terry chew' })],
    ['an over-long NameID', profile({ nameID: `${'a'.repeat(320)}@example.com` })],
  ])('rejects %s', (_label, input) => {
    expect(() => identityFromProfile(input)).toThrow(SamlIdentityError);
  });
});
