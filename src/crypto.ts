import { UnaConfigurationError } from "./errors.js";
import type {
  AgentReadablePayloadFields,
  UnaCryptoAdapter,
  WrappedAgentReadableKey,
} from "./types.js";

const WRAP_MAGIC = new TextEncoder().encode("UDW1");
const WRAP_PUBLIC_KEY_LENGTH = 65;
const WRAP_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH_BITS = 128;
const WRAP_SALT = new TextEncoder().encode("UnaDeviceWrap.v1");
const AGENT_KEY_ALGORITHM = "p256-x963-hkdf-sha256-aesgcm-v1";

export type UnaConnectionKeyPair = {
  publicKey: string;
  publicKeyId: string;
  privateKeyJwk: JsonWebKey;
  algorithm: typeof AGENT_KEY_ALGORITHM;
};

export type UnaCryptoSessionOptions = {
  privateKeyJwk: JsonWebKey;
  publicKeyId?: string;
  crypto?: Crypto;
};

export class UnaCryptoError extends Error {
  constructor(
    readonly code:
      | "invalid_wrapped_key"
      | "unsupported_algorithm"
      | "key_id_mismatch"
      | "unwrap_failed"
      | "missing_key_version"
      | "invalid_payload"
      | "decrypt_failed",
    message: string,
  ) {
    super(message);
    this.name = "UnaCryptoError";
  }
}

export async function generateUnaConnectionKeyPair(
  options: { publicKeyId?: string; crypto?: Crypto } = {},
): Promise<UnaConnectionKeyPair> {
  const webCrypto = requireWebCrypto(options.crypto);
  const pair = await webCrypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = new Uint8Array(
    await webCrypto.subtle.exportKey("raw", pair.publicKey),
  );
  const privateKeyJwk = await webCrypto.subtle.exportKey(
    "jwk",
    pair.privateKey,
  );
  const publicKeyId =
    options.publicKeyId ??
    `una-${encodeBase64Url(webCrypto.getRandomValues(new Uint8Array(8)))}`;
  return {
    publicKey: encodeBase64Url(publicKey),
    publicKeyId,
    privateKeyJwk,
    algorithm: AGENT_KEY_ALGORITHM,
  };
}

export class UnaCryptoSession implements UnaCryptoAdapter {
  readonly publicKeyId?: string;
  private readonly webCrypto: Crypto;
  private readonly privateKeyPromise: Promise<CryptoKey>;
  private readonly contentKeys = new Map<number, CryptoKey>();

  constructor(options: UnaCryptoSessionOptions) {
    this.webCrypto = requireWebCrypto(options.crypto);
    this.publicKeyId = options.publicKeyId;
    this.privateKeyPromise = this.webCrypto.subtle.importKey(
      "jwk",
      options.privateKeyJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  }

  get keyVersions(): number[] {
    return [...this.contentKeys.keys()].sort((left, right) => left - right);
  }

  hasKeyVersion(keyVersion: number): boolean {
    return this.contentKeys.has(keyVersion);
  }

  async unwrapAgentReadableKey(
    wrappedKey: WrappedAgentReadableKey,
  ): Promise<void> {
    if (
      wrappedKey.publicKeyAlgorithm &&
      wrappedKey.publicKeyAlgorithm !== AGENT_KEY_ALGORITHM
    ) {
      throw new UnaCryptoError(
        "unsupported_algorithm",
        `Una wrapped key uses unsupported algorithm ${wrappedKey.publicKeyAlgorithm}.`,
      );
    }
    if (
      this.publicKeyId &&
      wrappedKey.publicKeyId &&
      wrappedKey.publicKeyId !== this.publicKeyId
    ) {
      throw new UnaCryptoError(
        "key_id_mismatch",
        `Wrapped key targets ${wrappedKey.publicKeyId}, not ${this.publicKeyId}.`,
      );
    }

    const envelope = decodeBase64(wrappedKey.ciphertext);
    const headerLength = WRAP_MAGIC.length + WRAP_PUBLIC_KEY_LENGTH + WRAP_NONCE_LENGTH;
    if (envelope.length < headerLength + 16) {
      throw new UnaCryptoError("invalid_wrapped_key", "Wrapped key envelope is too short.");
    }
    for (let index = 0; index < WRAP_MAGIC.length; index += 1) {
      if (envelope[index] !== WRAP_MAGIC[index]) {
        throw new UnaCryptoError("invalid_wrapped_key", "Wrapped key magic is not UDW1.");
      }
    }
    const ephemeralBytes = envelope.slice(
      WRAP_MAGIC.length,
      WRAP_MAGIC.length + WRAP_PUBLIC_KEY_LENGTH,
    );
    if (ephemeralBytes[0] !== 0x04) {
      throw new UnaCryptoError(
        "invalid_wrapped_key",
        "Wrapped key does not contain a raw uncompressed P-256 point.",
      );
    }
    const nonceOffset = WRAP_MAGIC.length + WRAP_PUBLIC_KEY_LENGTH;
    const nonce = envelope.slice(nonceOffset, nonceOffset + WRAP_NONCE_LENGTH);
    const ciphertext = envelope.slice(nonceOffset + WRAP_NONCE_LENGTH);

    try {
      const ephemeralPublicKey = await this.webCrypto.subtle.importKey(
        "raw",
        ephemeralBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      );
      const sharedSecret = await this.webCrypto.subtle.deriveBits(
        { name: "ECDH", public: ephemeralPublicKey },
        await this.privateKeyPromise,
        256,
      );
      const hkdfKey = await this.webCrypto.subtle.importKey(
        "raw",
        sharedSecret,
        "HKDF",
        false,
        ["deriveKey"],
      );
      const wrappingKey = await this.webCrypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: WRAP_SALT,
          info: new Uint8Array(),
        },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const rawContentKey = await this.webCrypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce, tagLength: GCM_TAG_LENGTH_BITS },
        wrappingKey,
        ciphertext,
      );
      const contentKey = await this.webCrypto.subtle.importKey(
        "raw",
        rawContentKey,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
      this.contentKeys.set(wrappedKey.keyVersion, contentKey);
    } catch (error) {
      if (error instanceof UnaCryptoError) throw error;
      throw new UnaCryptoError(
        "unwrap_failed",
        "Wrapped key could not be authenticated with this private key. Check the key id and pairing key.",
      );
    }
  }

  async decryptAgentReadableJson<T>(
    record: AgentReadablePayloadFields,
  ): Promise<T> {
    const key = this.contentKeys.get(record.keyVersion);
    if (!key) {
      throw new UnaCryptoError(
        "missing_key_version",
        `Agent-readable key version ${record.keyVersion} has not been loaded.`,
      );
    }
    const nonce = decodeBase64(record.payloadNonce);
    const ciphertext = decodeBase64(record.payloadCiphertext);
    if (nonce.length !== WRAP_NONCE_LENGTH || ciphertext.length < 16) {
      throw new UnaCryptoError("invalid_payload", "Encrypted payload shape is invalid.");
    }
    try {
      const plaintext = await this.webCrypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce, tagLength: GCM_TAG_LENGTH_BITS },
        key,
        ciphertext,
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    } catch {
      throw new UnaCryptoError(
        "decrypt_failed",
        "Agent-readable payload failed AES-GCM authentication or JSON decoding.",
      );
    }
  }

  async encryptAgentReadableJson(
    payload: unknown,
    keyVersion?: number,
  ): Promise<AgentReadablePayloadFields> {
    const resolvedVersion = keyVersion ?? this.keyVersions.at(-1);
    if (resolvedVersion === undefined) {
      throw new UnaCryptoError(
        "missing_key_version",
        "Load wrapped agent-readable keys before encrypting a payload.",
      );
    }
    const key = this.contentKeys.get(resolvedVersion);
    if (!key) {
      throw new UnaCryptoError(
        "missing_key_version",
        `Agent-readable key version ${resolvedVersion} has not been loaded.`,
      );
    }
    const nonce = this.webCrypto.getRandomValues(new Uint8Array(WRAP_NONCE_LENGTH));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await this.webCrypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: GCM_TAG_LENGTH_BITS },
      key,
      plaintext,
    );
    return {
      keyKind: "agentReadableContent",
      keyVersion: resolvedVersion,
      payloadCiphertext: encodeBase64(new Uint8Array(ciphertext)),
      payloadNonce: encodeBase64(nonce),
    };
  }
}

function requireWebCrypto(candidate?: Crypto): Crypto {
  const resolved = candidate ?? globalThis.crypto;
  if (!resolved?.subtle || !resolved.getRandomValues) {
    throw new UnaConfigurationError(
      "WebCrypto is unavailable. Pass options.crypto from the runtime's trusted crypto implementation.",
    );
  }
  return resolved;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new UnaCryptoError("invalid_payload", "Expected base64 or base64url bytes.");
  }
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeBase64Url(value: Uint8Array): string {
  return encodeBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export { AGENT_KEY_ALGORITHM };
