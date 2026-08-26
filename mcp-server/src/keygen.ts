import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateUnaConnectionKeyPair } from "@unafamily/una-sdk";

const outputPath = resolve(
  process.argv[2] ?? "una-agent-private-key.jwk",
);
const pairing = await generateUnaConnectionKeyPair();

await writeFile(outputPath, `${JSON.stringify(pairing.privateKeyJwk)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});

console.log(`Private key saved with owner-only permissions: ${outputPath}`);
console.log(`Public key: ${pairing.publicKey}`);
console.log(`Key ID: ${pairing.publicKeyId}`);
console.log("Paste the Public key and Key ID lines together into Una.");
