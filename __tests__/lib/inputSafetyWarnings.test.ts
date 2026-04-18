import { describe, it, expect } from "vitest";
import { detectInputWarnings } from "@/lib/inputSafetyWarnings";

describe("detectInputWarnings", () => {
  it("returns no warnings for empty input", () => {
    expect(detectInputWarnings("")).toEqual([]);
  });

  it("returns no warnings for plain prose", () => {
    expect(detectInputWarnings("how do I list listening ports")).toEqual([]);
  });

  it("flags AWS access key", () => {
    const warnings = detectInputWarnings("debug AKIAIOSFODNN7EXAMPLE pls");
    expect(warnings).toContainEqual({
      kind: "credential-pattern",
      label: "AWS access key",
    });
  });

  it("flags PEM private key block", () => {
    const text = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    const warnings = detectInputWarnings(text);
    expect(warnings.some((w) => w.label === "PEM 密钥块")).toBe(true);
  });

  it("flags Authorization Bearer header (case-insensitive)", () => {
    const warnings = detectInputWarnings("Authorization: Bearer sk_live_xyzABCdef");
    expect(warnings.some((w) => w.kind === "credential-pattern")).toBe(true);
  });

  it("flags JWT token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36";
    const warnings = detectInputWarnings(`token=${jwt}`);
    expect(warnings.some((w) => w.label === "JWT token")).toBe(true);
  });

  it("flags URI with embedded credentials", () => {
    const warnings = detectInputWarnings("connect to postgres://admin:secret@db.example.com/app");
    expect(warnings.some((w) => w.label === "URI 内嵌凭据")).toBe(true);
  });

  it("flags high-entropy random token", () => {
    // Random 32-char base64 — low repetition, high entropy
    const token = "P9dQ7L+kZmJxRvWnY3aBcDeFgHiJkLmNoPqRsT";
    const warnings = detectInputWarnings(`paste ${token} for me`);
    expect(warnings.some((w) => w.kind === "high-entropy")).toBe(true);
  });

  it("does NOT flag low-entropy short identifier", () => {
    expect(detectInputWarnings("usrname123")).toEqual([]);
  });

  it("does NOT flag a UUID (entropy ~3.95, below threshold)", () => {
    // standard UUID v4 — hex chars + hyphens, entropy stays under 4.5
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const warnings = detectInputWarnings(uuid);
    expect(warnings.filter((w) => w.kind === "high-entropy").length).toBe(0);
  });

  it("does NOT flag short tokens even if high entropy per char", () => {
    // 19 chars (just below ENTROPY_MIN_LEN=20) — should be skipped even with entropy
    const short = "Ax9qLp0sZmRtYwBcDef"; // 19 chars
    expect(short.length).toBeLessThan(20);
    expect(detectInputWarnings(short).filter((w) => w.kind === "high-entropy")).toEqual([]);
  });

  it("deduplicates same pattern label", () => {
    // Two AWS keys in one text → only one warning
    const text = "AKIAIOSFODNN7EXAMPLE and AKIAIOSFODNN7EXAMPL2";
    const aws = detectInputWarnings(text).filter((w) => w.label === "AWS access key");
    expect(aws.length).toBe(1);
  });

  it("can return multiple distinct warnings", () => {
    const text = "Authorization: Bearer sk_live_xyzABCdef and AKIAIOSFODNN7EXAMPLE";
    const warnings = detectInputWarnings(text);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("warnings have stable shape with kind + label fields", () => {
    const warnings = detectInputWarnings("AKIAIOSFODNN7EXAMPLE");
    for (const w of warnings) {
      expect(w).toHaveProperty("kind");
      expect(w).toHaveProperty("label");
      expect(typeof w.label).toBe("string");
    }
  });
});
