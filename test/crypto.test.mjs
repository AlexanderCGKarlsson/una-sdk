import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UnaCryptoError,
  UnaCryptoSession,
  generateUnaConnectionKeyPair,
} from "../dist/index.js";

test("unwraps UDW1 and round-trips agent-readable JSON", async () => {
  const generated = await generateUnaConnectionKeyPair();
  const rawPublicKey = decodeBase64(generated.publicKey);
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw",
    rawPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientPublicKey },
    ephemeral.privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("UnaDeviceWrap.v1"),
      info: new Uint8Array(),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrappedCiphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      wrappingKey,
      contentKey,
    ),
  );
  const ephemeralPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );
  const envelope = concatenate(
    new TextEncoder().encode("UDW1"),
    ephemeralPublicKey,
    nonce,
    wrappedCiphertext,
  );

  const session = new UnaCryptoSession({
    privateKeyJwk: generated.privateKeyJwk,
    publicKeyId: generated.publicKeyId,
  });
  await session.unwrapAgentReadableKey({
    keyKind: "agentReadableContent",
    keyVersion: 1,
    ciphertext: encodeBase64(envelope),
    publicKeyAlgorithm: generated.algorithm,
    publicKeyId: generated.publicKeyId,
  });
  const encrypted = await session.encryptAgentReadableJson({
    title: "Marry me chicken",
    url: "https://example.com/recipe",
  });
  const decrypted = await session.decryptAgentReadableJson(encrypted);
  assert.deepEqual(decrypted, {
    title: "Marry me chicken",
    url: "https://example.com/recipe",
  });
});

test("reports a pairing mismatch before attempting unwrap", async () => {
  const generated = await generateUnaConnectionKeyPair({ publicKeyId: "una-right" });
  const session = new UnaCryptoSession({
    privateKeyJwk: generated.privateKeyJwk,
    publicKeyId: generated.publicKeyId,
  });
  await assert.rejects(
    session.unwrapAgentReadableKey({
      keyKind: "agentReadableContent",
      keyVersion: 1,
      ciphertext: encodeBase64(new Uint8Array(97)),
      publicKeyAlgorithm: generated.algorithm,
      publicKeyId: "una-wrong",
    }),
    (error) => error instanceof UnaCryptoError && error.code === "key_id_mismatch",
  );
});

function concatenate(...values) {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function encodeBase64(value) {
  return Buffer.from(value).toString("base64");
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
