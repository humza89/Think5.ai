/**
 * SAML Provider — Handles SAML 2.0 authentication flow
 *
 * Supports: Okta (SAML), Azure AD (SAML), OneLogin, generic SAML IdPs
 * Implements: SP-initiated SSO with POST binding
 *
 * Uses proper XML DOM parsing for SAML response handling instead of regex.
 */

import { createHash, createVerify, randomBytes } from "crypto";
import { DOMParser } from "@xmldom/xmldom";

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

// SAML XML namespaces
const NS = {
  saml: "urn:oasis:names:tc:SAML:2.0:assertion",
  saml2: "urn:oasis:names:tc:SAML:2.0:assertion",
  samlp: "urn:oasis:names:tc:SAML:2.0:protocol",
  ds: "http://www.w3.org/2000/09/xmldsig#",
};

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

// ── XML DOM Helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElementsByTagNameNS(doc: any, ns: string, localName: string): any[] {
  const nodeList = doc.getElementsByTagNameNS(ns, localName);
  const elements: any[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    elements.push(nodeList.item(i));
  }
  return elements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElementTextContent(doc: any, ns: string, localName: string): string | null {
  const elements = getElementsByTagNameNS(doc, ns, localName);
  return elements.length > 0 ? (elements[0].textContent?.trim() || null) : null;
}

// ── Response Parsing ───────────────────────────────────────────────────

/**
 * Verify the XML signature on a SAML response using the IdP's X.509 certificate.
 * Uses proper XML DOM parsing to extract signature elements.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function verifySAMLSignature(doc: any, xml: string, certificate: string): boolean {
  // Find SignatureValue element using DOM
  const sigValueElements = getElementsByTagNameNS(doc, NS.ds, "SignatureValue");
  if (sigValueElements.length === 0) {
    throw new Error("SAML response missing XML signature — cannot verify authenticity");
  }
  const signatureValue = (sigValueElements[0].textContent || "").replace(/\s+/g, "");

  // Find SignedInfo element using DOM
  const signedInfoElements = getElementsByTagNameNS(doc, NS.ds, "SignedInfo");
  if (signedInfoElements.length === 0) {
    throw new Error("SAML response missing SignedInfo element");
  }

  // Determine signature algorithm from DOM
  const sigMethodElements = getElementsByTagNameNS(doc, NS.ds, "SignatureMethod");
  const algorithm = sigMethodElements.length > 0
    ? (sigMethodElements[0].getAttribute("Algorithm") || "")
    : "";

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

  // Serialize SignedInfo with namespace for verification
  // Use exclusive XML canonicalization-compatible approach
  const signedInfoNode = signedInfoElements[0];
  const signedInfoOuter = signedInfoNode.toString();
  // Ensure the ds namespace is declared on SignedInfo for canonical form
  const signedInfoXml = signedInfoOuter.includes("xmlns:ds=")
    ? signedInfoOuter
    : signedInfoOuter.replace(
        /^<ds:SignedInfo/,
        '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"'
      );

  // Normalize the certificate (ensure PEM format)
  const pemCert = certificate.includes("-----BEGIN")
    ? certificate
    : `-----BEGIN CERTIFICATE-----\n${certificate.replace(/\s+/g, "\n")}\n-----END CERTIFICATE-----`;

  const verifier = createVerify(nodeAlgorithm);
  verifier.update(signedInfoXml);

  return verifier.verify(pemCert, signatureValue, "base64");
}

/**
 * Parse a SAML response and extract the assertion.
 * Uses proper XML DOM parsing for reliable attribute extraction.
 * Verifies the XML signature against the IdP's X.509 certificate.
 */
export function parseSAMLResponse(
  samlResponseB64: string,
  certificate: string
): SAMLAssertion {
  const xml = Buffer.from(samlResponseB64, "base64").toString("utf-8");

  // Parse XML using proper DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  // Check for parse errors
  const parseErrors = getElementsByTagNameNS(doc, "http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror");
  if (parseErrors.length > 0) {
    throw new Error("SAML response contains invalid XML");
  }

  // Verify XML signature against IdP certificate using DOM
  if (!verifySAMLSignature(doc, xml, certificate)) {
    throw new Error("SAML response signature verification failed — possible tampering");
  }

  // Extract NameID using DOM (try both saml: and saml2: namespaces)
  let nameId: string | null = getElementTextContent(doc, NS.saml, "NameID");
  if (!nameId) {
    nameId = getElementTextContent(doc, NS.saml2, "NameID");
  }
  if (!nameId) {
    throw new Error("SAML response missing NameID");
  }

  // Extract attributes using DOM
  const attributes: Record<string, string> = {};
  const attrElements = [
    ...getElementsByTagNameNS(doc, NS.saml, "Attribute"),
    ...getElementsByTagNameNS(doc, NS.saml2, "Attribute"),
  ];

  for (const attr of attrElements) {
    const attrName = attr.getAttribute("Name");
    if (!attrName) continue;

    // Get first AttributeValue child
    const valueElements = attr.getElementsByTagNameNS(NS.saml, "AttributeValue");
    const value2Elements = attr.getElementsByTagNameNS(NS.saml2, "AttributeValue");
    const valueEl = valueElements.length > 0 ? valueElements.item(0) : value2Elements.item(0);
    if (valueEl?.textContent) {
      attributes[attrName] = valueEl.textContent.trim();
    }
  }

  // Extract SessionIndex from AuthnStatement using DOM
  const authnStatements = [
    ...getElementsByTagNameNS(doc, NS.saml, "AuthnStatement"),
    ...getElementsByTagNameNS(doc, NS.saml2, "AuthnStatement"),
  ];
  const sessionIndex = authnStatements.length > 0
    ? authnStatements[0].getAttribute("SessionIndex") || undefined
    : undefined;

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

  // Validate status using DOM
  const statusCodes = getElementsByTagNameNS(doc, NS.samlp, "StatusCode");
  if (statusCodes.length > 0) {
    const statusValue = statusCodes[0].getAttribute("Value") || "";
    if (statusValue && !statusValue.endsWith(":Success")) {
      throw new Error(`SAML authentication failed: ${statusValue}`);
    }
  }

  return {
    nameId,
    email,
    firstName,
    lastName,
    sessionIndex,
    attributes,
  };
}

/**
 * Generate a hash of the SAML response for audit logging.
 */
export function hashSAMLResponse(samlResponseB64: string): string {
  return createHash("sha256").update(samlResponseB64).digest("hex").slice(0, 16);
}
