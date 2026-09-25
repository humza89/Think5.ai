/**
 * SAML validation through @node-saml/node-saml (T9). A throwaway IdP key +
 * self-signed certificate is generated with openssl (present on macOS and
 * the ubuntu runners); the positive case is skipped where it is missing.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignedXml } from "xml-crypto";
import { describe, expect, it } from "vitest";
import { buildAuthnRequest, singleRequestCache, validateSAMLResponse, SAMLValidationError } from "@/lib/sso/saml-provider";

const SP = "http://localhost:3000/api/auth/sso";
const ACS = "http://localhost:3000/api/auth/sso/callback";

function hasOpenssl(): boolean {
  try { execFileSync("openssl", ["version"], { stdio: "ignore" }); return true; } catch { return false; }
}

function idpKeys() {
  const dir = mkdtempSync(join(tmpdir(), "saml-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-subj", "/CN=idp.test", "-days", "1"], { stdio: "ignore" });
  return { privateKey: readFileSync(key, "utf8"), certificate: readFileSync(cert, "utf8") };
}

function samlResponse(opts: { privateKey: string; inResponseTo: string; audience?: string; destination?: string; notOnOrAfter?: Date; email?: string; sign?: boolean }): string {
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60_000).toISOString();
  const notOnOrAfter = (opts.notOnOrAfter ?? new Date(now.getTime() + 5 * 60_000)).toISOString();
  const email = opts.email ?? "riley@northwind.test";
  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp1" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${opts.destination ?? ACS}" InResponseTo="${opts.inResponseTo}">
  <saml:Issuer>https://idp.test/metadata</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a1" Version="2.0" IssueInstant="${now.toISOString()}">
    <saml:Issuer>https://idp.test/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${opts.destination ?? ACS}" InResponseTo="${opts.inResponseTo}"/></saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${opts.audience ?? SP}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="firstName"><saml:AttributeValue>Riley</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="lastName"><saml:AttributeValue>Chen</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
  if (opts.sign === false) return Buffer.from(xml).toString("base64");
  const sig = new SignedXml({ privateKey: opts.privateKey, signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#" });
  sig.addReference({ xpath: "//*[local-name(.)='Assertion']", digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"] });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  return Buffer.from(sig.getSignedXml()).toString("base64");
}

describe("SAML provider (T9, node-saml)", () => {
  it("builds an AuthnRequest with a request id the response must answer", () => {
    const { requestId, samlRequest, relayState } = buildAuthnRequest({ entityId: "idp", ssoUrl: "https://idp.test/sso", certificate: "x", callbackUrl: ACS, nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" }, SP);
    expect(requestId).toMatch(/^_[a-f0-9]{32}$/);
    expect(Buffer.from(samlRequest, "base64").toString("utf8")).toContain(`ID="${requestId}"`);
    expect(relayState).toMatch(/^[a-f0-9]{32}$/);
  });

  it("the single-request cache only knows the stored id", async () => {
    const cache = singleRequestCache("_abc");
    expect(await cache.getAsync("_abc")).toBeTruthy();
    expect(await cache.getAsync("_other")).toBeNull();
    expect(await cache.removeAsync("_abc")).toBe("_abc");
    expect(await cache.getAsync("_abc")).toBeNull();
  });

  it("refuses to validate without a stored request id", async () => {
    await expect(validateSAMLResponse({ samlResponse: "x", certificate: "x", spEntityId: SP, callbackUrl: ACS, expectedRequestId: "" })).rejects.toBeInstanceOf(SAMLValidationError);
  });

  describe.skipIf(!hasOpenssl())("with a signed response", () => {
    const keys = idpKeys();
    const requestId = "_req0123456789abcdef";
    const base = { certificate: keys.certificate, spEntityId: SP, callbackUrl: ACS, expectedRequestId: requestId };

    it("accepts a signed assertion that answers our request for our audience", async () => {
      const assertion = await validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: keys.privateKey, inResponseTo: requestId }) });
      expect(assertion).toMatchObject({ email: "riley@northwind.test", nameId: "riley@northwind.test", firstName: "Riley", lastName: "Chen", sessionIndex: "_s1" });
    });

    it("rejects an unsigned assertion", async () => {
      await expect(validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: keys.privateKey, inResponseTo: requestId, sign: false }) })).rejects.toBeInstanceOf(SAMLValidationError);
    });

    it("rejects a response for another request (InResponseTo)", async () => {
      await expect(validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: keys.privateKey, inResponseTo: "_someone-elses-request" }) })).rejects.toBeInstanceOf(SAMLValidationError);
    });

    it("rejects a wrong audience", async () => {
      await expect(validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: keys.privateKey, inResponseTo: requestId, audience: "https://other-sp.test" }) })).rejects.toBeInstanceOf(SAMLValidationError);
    });

    it("rejects an expired assertion", async () => {
      await expect(validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: keys.privateKey, inResponseTo: requestId, notOnOrAfter: new Date(Date.now() - 60_000) }) })).rejects.toBeInstanceOf(SAMLValidationError);
    });

    it("rejects a signature from a different key", async () => {
      const other = idpKeys();
      await expect(validateSAMLResponse({ ...base, samlResponse: samlResponse({ privateKey: other.privateKey, inResponseTo: requestId }) })).rejects.toBeInstanceOf(SAMLValidationError);
    });

    it("rejects a tampered assertion (digest)", async () => {
      const signed = Buffer.from(samlResponse({ privateKey: keys.privateKey, inResponseTo: requestId }), "base64").toString("utf8");
      const tampered = Buffer.from(signed.replace("riley@northwind.test", "mallory@northwind.test")).toString("base64");
      await expect(validateSAMLResponse({ ...base, samlResponse: tampered })).rejects.toBeInstanceOf(SAMLValidationError);
    });
  });
});
