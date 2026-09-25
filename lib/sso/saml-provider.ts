/**
 * SAML Provider — Handles SAML 2.0 authentication flow
 *
 * Supports: Okta (SAML), Azure AD (SAML), OneLogin, generic SAML IdPs
 * Implements: SP-initiated SSO with POST binding
 *
 * Uses proper XML DOM parsing for SAML response handling instead of regex.
 */

import { createHash, randomBytes } from "crypto";

export interface SAMLConfig {
  entityId: string;
  ssoUrl: string;
  certificate: string;
  callbackUrl: string;
  nameIdFormat: string;
  sloUrl?: string;
}

export interface SAMLAssertion {
  nameId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  sessionIndex?: string;
  attributes: Record<string, string>;
}


// ── SP Metadata ────────────────────────────────────────────────────────

export function generateSPMetadata(
  spEntityId: string,
  acsUrl: string,
  sloUrl?: string
): string {
  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${spEntityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="0"
      isDefault="true"/>
    ${sloUrl ? `<md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${sloUrl}"/>` : ""}
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

// ── AuthnRequest ───────────────────────────────────────────────────────

export function buildAuthnRequest(
  config: SAMLConfig,
  spEntityId: string
): { requestId: string; samlRequest: string; relayState: string } {
  const requestId = `_${randomBytes(16).toString("hex")}`;
  const issueInstant = new Date().toISOString();
  const relayState = randomBytes(16).toString("hex");

  const request = `<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${requestId}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${config.ssoUrl}"
    AssertionConsumerServiceURL="${config.callbackUrl}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${spEntityId}</saml:Issuer>
    <samlp:NameIDPolicy
      Format="${config.nameIdFormat}"
      AllowCreate="true"/>
  </samlp:AuthnRequest>`;

  const samlRequest = Buffer.from(request).toString("base64");

  return { requestId, samlRequest, relayState };
}

// ── Response validation (Phase 0 T9: @node-saml/node-saml) ─────────────
//
// The previous hand-written parser checked the XML signature only. node-saml
// validates signature and digest (assertion must be signed), Conditions
// (NotBefore / NotOnOrAfter with a small clock skew), AudienceRestriction
// (our SP entity id), Destination (the ACS URL) and InResponseTo against the
// request id we stored when the flow started.

import { SAML, ValidateInResponseTo, type CacheProvider, type Profile } from "@node-saml/node-saml";

export interface ValidateSAMLInput {
  samlResponse: string;
  certificate: string;
  spEntityId: string;
  callbackUrl: string;
  /** The AuthnRequest id stored at flow start; the response's InResponseTo must equal it. */
  expectedRequestId: string;
  acceptedClockSkewMs?: number;
}

/** A cache holding exactly the one request id this response may answer. */
export function singleRequestCache(requestId: string): CacheProvider {
  const store = new Map<string, string>([[requestId, new Date().toISOString()]]);
  return {
    async saveAsync(key, value) {
      store.set(key, value);
      return { createdAt: Date.now(), value };
    },
    async getAsync(key) {
      return key ? store.get(key) ?? null : null;
    },
    async removeAsync(key) {
      if (!key) return null;
      const had = store.has(key);
      store.delete(key);
      return had ? key : null;
    },
  };
}

const EMAIL_CLAIMS = [
  "email",
  "mail",
  "emailAddress",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "urn:oid:0.9.2342.19200300.100.1.3",
];
const FIRST_NAME_CLAIMS = ["firstName", "givenName", "given_name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname", "urn:oid:2.5.4.42"];
const LAST_NAME_CLAIMS = ["lastName", "surname", "sn", "family_name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname", "urn:oid:2.5.4.4"];

function firstClaim(profile: Profile, names: string[]): string | undefined {
  for (const name of names) {
    const value = (profile as Record<string, unknown>)[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  }
  return undefined;
}

export class SAMLValidationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SAMLValidationError";
  }
}

export async function validateSAMLResponse(input: ValidateSAMLInput): Promise<SAMLAssertion> {
  if (!input.expectedRequestId) throw new SAMLValidationError("Missing stored SAML request id");
  const saml = new SAML({
    idpCert: input.certificate,
    issuer: input.spEntityId,
    callbackUrl: input.callbackUrl,
    audience: input.spEntityId,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.always,
    cacheProvider: singleRequestCache(input.expectedRequestId),
    acceptedClockSkewMs: input.acceptedClockSkewMs ?? 5_000,
  });
  let profile: Profile | null | undefined;
  try {
    const result = await saml.validatePostResponseAsync({ SAMLResponse: input.samlResponse });
    profile = result.profile;
    if (result.loggedOut) throw new SAMLValidationError("Received a logout response instead of an authentication response");
  } catch (err) {
    if (err instanceof SAMLValidationError) throw err;
    throw new SAMLValidationError(err instanceof Error ? err.message : "SAML response rejected", err);
  }
  if (!profile) throw new SAMLValidationError("SAML response carried no subject");
  const nameId = profile.nameID ?? "";
  const email =
    firstClaim(profile, EMAIL_CLAIMS) ??
    (profile.nameIDFormat?.endsWith("emailAddress") && nameId.includes("@") ? nameId : undefined) ??
    "";
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === "string") attributes[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") attributes[key] = value[0];
  }
  return {
    nameId,
    email: email.toLowerCase(),
    firstName: firstClaim(profile, FIRST_NAME_CLAIMS),
    lastName: firstClaim(profile, LAST_NAME_CLAIMS),
    sessionIndex: profile.sessionIndex,
    attributes,
  };
}

/** Short fingerprint of a raw response for audit logs (never the content). */
export function hashSAMLResponse(samlResponseB64: string): string {
  return createHash("sha256").update(samlResponseB64).digest("hex").slice(0, 16);
}
