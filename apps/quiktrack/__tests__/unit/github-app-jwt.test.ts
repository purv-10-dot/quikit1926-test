import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "crypto";
import { importSPKI, jwtVerify } from "jose";
import {
  signAppJwt,
  signAppJwtFromEnv,
  APP_JWT_TTL_SECONDS,
} from "@/lib/services/github/app-jwt";

let privatePem: string;
let publicPem: string;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  privatePem = privateKey as string;
  publicPem = publicKey as string;
});

describe("github app-jwt", () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it("signs a verifiable RS256 App JWT with the expected claims", async () => {
    const now = 1_700_000_000;
    const jwt = await signAppJwt({ appId: "123456", privateKeyPem: privatePem }, now);
    const pub = await importSPKI(publicPem, "RS256");
    const { payload, protectedHeader } = await jwtVerify(jwt, pub, {
      algorithms: ["RS256"],
      // We signed with a fixed past `now` to assert claim VALUES deterministically;
      // pin verification to the same instant so the exp/iat liveness check passes.
      currentDate: new Date(now * 1000),
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.iss).toBe("123456");
    // iat is backdated 60s for clock skew.
    expect(payload.iat).toBe(now - 60);
    // exp stays within GitHub's 10-minute ceiling.
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(600);
    expect((payload.exp as number) - now).toBe(APP_JWT_TTL_SECONDS);
  });

  it("throws on missing appId or key", async () => {
    await expect(
      signAppJwt({ appId: "", privateKeyPem: privatePem }),
    ).rejects.toThrow(/App id is required/);
    await expect(
      signAppJwt({ appId: "1", privateKeyPem: "" }),
    ).rejects.toThrow(/private key is required/);
  });

  it("normalizes single-line PEMs with escaped newlines", async () => {
    const escaped = privatePem.replace(/\n/g, "\\n");
    const jwt = await signAppJwt({ appId: "9", privateKeyPem: escaped });
    const pub = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(jwt, pub, { algorithms: ["RS256"] });
    expect(payload.iss).toBe("9");
  });

  it("reads credentials from the environment", async () => {
    process.env.GITHUB_APP_ID = "777";
    process.env.GITHUB_APP_PRIVATE_KEY = privatePem;
    const jwt = await signAppJwtFromEnv();
    const pub = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(jwt, pub, { algorithms: ["RS256"] });
    expect(payload.iss).toBe("777");
  });

  it("throws from env variant when unconfigured", async () => {
    await expect(signAppJwtFromEnv()).rejects.toThrow(/not configured/);
  });
});
