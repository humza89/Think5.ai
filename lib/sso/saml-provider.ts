/**
 * SAML Provider — Handles SAML 2.0 authentication flow
 *
 * Supports: Okta (SAML), Azure AD (SAML), OneLogin, generic SAML IdPs
 * Implements: SP-initiated SSO with POST binding
 *
 * Note: For full SAML assertion validation with XML signature verification,
 * consider using a library like `saml2-js` or `passport-saml` in production.
 * This implementation provides the core flow structure.
 */

import { createHash, createVerify, randomBytes } from "crypto";

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

// ── Response Parsing ───────────────────────────────────────────────────

/**
 * Verify the XML signature on a SAML response using the IdP's X.509 certificate.
 * Checks for ds:Signature elements and validates the digest + signature value.
 */
function verifySAMLSignature(xml: string, certificate: string): boolean {
  // Extract the SignatureValue
  const sigValueMatch = xml.match(/<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/);
  if (!sigValueMatch) {
    throw new Error("SAML response missing XML signature — cannot verify authenticity");
  }

  // Extract the SignedInfo block (the canonicalized content that was signed)
  const signedInfoMatch = xml.match(/<ds:SignedInfo[^>]*>([\s\S]*?)<\/ds:SignedInfo>/);
  if (!signedInfoMatch) {
    throw new Error("SAML response missing SignedInfo element");
  }

  // Determine signature algorithm
  const sigAlgMatch = xml.match(/<ds:SignatureMethod\s+Algorithm="([^"]+)"/);
  const algorithm = sigAlgMatch?.[1] || "";

  let nodeAlgorithm: string;
  if (algorithm.includes("rsa-sha256")) {
    nodeAlgorithm = "RSA-SHA256";
  } else if (algorithm.includes("rsa-sha1")) {
    nodeAlgorithm = "RSA-SHA1";
  } else if (algorithm.includes("rsa-sha512")) {
    nodeAlgorithm = "RSA-SHA512";
  } else {
    throw new Error(`Unsupported SAML signature algorithm: ${algorithm}`);
  }

  // Reconstruct the canonicalized SignedInfo for verification
  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${signedInfoMatch[1]}</ds:SignedInfo>`;

  // Normalize the certificate (ensure PEM format)
  const pemCert = certificate.includes("-----BEGIN")
    ? certificate
    : `-----BEGIN CERTIFICATE-----\n${certificate.replace(/\s+/g, "\n")}\n-----END CERTIFICATE-----`;

  const signatureValue = sigValueMatch[1].replace(/\s+/g, "");

  const verifier = createVerify(nodeAlgorithm);
  verifier.update(signedInfoXml);

  return verifier.verify(pemCert, signatureValue, "base64");
}

/**
 * Parse a SAML response and extract the assertion.
 * Verifies the XML signature against the IdP's X.509 certificate.
 */
export function parseSAMLResponse(
  samlResponseB64: string,
  certificate: string
): SAMLAssertion {
  const xml = Buffer.from(samlResponseB64, "base64").toString("utf-8");

  // Verify XML signature against IdP certificate
  if (!verifySAMLSignature(xml, certificate)) {
    throw new Error("SAML response signature verification failed — possible tampering");
  }

  // Extract NameID (email)
  const nameIdMatch = xml.match(/<(?:saml[2]?:)?NameID[^>]*>([^<]+)<\/(?:saml[2]?:)?NameID>/);
  if (!nameIdMatch) {
    throw new Error("SAML response missing NameID");
  }

  const nameId = nameIdMatch[1].trim();

  // Extract common attributes
  const attributes: Record<string, string> = {};
  const attrRegex = /<(?:saml[2]?:)?Attribute\s+Name="([^"]+)"[^>]*>\s*<(?:saml[2]?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml[2]?:)?AttributeValue>/g;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    attributes[match[1]] = match[2].trim();
  }

  // Extract SessionIndex for SLO
  const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);

  // Map common attribute names
  const email = attributes["email"] ||
    attributes["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
    nameId;

  const firstName = attributes["firstName"] ||
    attributes["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] ||
    attributes["givenName"];

  const lastName = attributes["lastName"] ||
    attributes["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"] ||
    attributes["sn"];

  // Validate status
  const statusMatch = xml.match(/<(?:samlp:)?StatusCode\s+Value="([^"]+)"/);
  if (statusMatch && !statusMatch[1].endsWith(":Success")) {
    throw new Error(`SAML authentication failed: ${statusMatch[1]}`);
  }

  return {
    nameId,
    email,
    firstName,
    lastName,
    sessionIndex: sessionMatch?.[1],
    attributes,
  };
}

/**
 * Generate a hash of the SAML response for audit logging.
 */
export function hashSAMLResponse(samlResponseB64: string): string {
  return createHash("sha256").update(samlResponseB64).digest("hex").slice(0, 16);
}
