import type { Profile } from '@node-saml/node-saml';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

const BEARER = 'urn:oasis:names:tc:SAML:2.0:cm:bearer';
const NAME_MAX = 100;

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  isArray: (name) => name === 'SubjectConfirmation',
});

function parse(xml: string): XmlNode | null {
  if (!xml || /<!DOCTYPE/i.test(xml)) return null;
  try {
    return parser.parse(xml, true) as XmlNode;
  } catch {
    return null;
  }
}

function attribute(node: unknown, name: string): string | null {
  const value = (node as XmlNode | undefined)?.[`@${name}`];
  return typeof value === 'string' ? value : null;
}

export interface ResponseEnvelope {
  inResponseTo: string | null;
  destination: string | null;
  issuer: string | null;
}

function text(node: unknown): string | null {
  if (typeof node === 'string') return node.trim();
  const value = (node as XmlNode | undefined)?.['#text'];
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * Reads the outer envelope of a base64 SAMLResponse. Used before validation only to
 * route IdP-initiated responses, and after validation (the root is signed) to check
 * Destination and Issuer. Null when it is not a SAML Response at all.
 */
export function readResponseEnvelope(samlResponse: string): ResponseEnvelope | null {
  const document = parse(Buffer.from(samlResponse, 'base64').toString('utf8'));
  if (!document || !('Response' in document)) return null;
  const response = document.Response;
  return {
    inResponseTo: attribute(response, 'InResponseTo'),
    destination: attribute(response, 'Destination'),
    issuer: text((response as XmlNode | undefined)?.Issuer),
  };
}

/** Recipient URLs of the bearer subject confirmations in a (verified) assertion. */
export function assertionRecipients(assertionXml: string): string[] {
  const assertion = parse(assertionXml)?.Assertion as XmlNode | undefined;
  const confirmations = ((assertion?.Subject as XmlNode | undefined)?.SubjectConfirmation as XmlNode[] | undefined) ?? [];
  return confirmations
    .filter((confirmation) => attribute(confirmation, 'Method') === BEARER)
    .map((confirmation) => attribute(confirmation.SubjectConfirmationData, 'Recipient'))
    .filter((recipient): recipient is string => recipient !== null);
}

export class SamlIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SamlIdentityError';
  }
}

export interface SamlIdentity {
  /** Okta username (the NameID), trimmed and lower-cased: the identity key */
  username: string;
  /** The email Okta sent, when it is an email address */
  email: string | null;
  /** Names Okta sent: only used to pre-fill "Add user" after a refused sign-in */
  firstName: string;
  lastName: string;
}

export const USERNAME_MAX = 320;
const UsernameSchema = z.string().min(1).max(USERNAME_MAX).regex(/^\S+$/);
const EmailSchema = z.email().max(320);

function firstString(value: unknown): string | null {
  const first = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof first === 'string' ? first.trim() : null;
}

/**
 * The TechCockpit identity in a validated Okta profile. The NameID (Okta username) is the
 * identity key; email and names come from the attribute statements.
 */
export function identityFromProfile(profile: Profile): SamlIdentity {
  const username = UsernameSchema.safeParse(profile.nameID?.trim().toLowerCase());
  if (!username.success) {
    throw new SamlIdentityError('NameID is not an Okta username');
  }
  const attributes = (profile.attributes ?? {}) as Record<string, unknown>;
  const email = EmailSchema.safeParse(firstString(attributes.email)?.toLowerCase());
  return {
    username: username.data,
    email: email.success ? email.data : null,
    firstName: (firstString(attributes.firstName) ?? '').slice(0, NAME_MAX),
    lastName: (firstString(attributes.lastName) ?? '').slice(0, NAME_MAX),
  };
}
