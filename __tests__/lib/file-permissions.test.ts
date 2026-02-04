/**
 * 权限转换函数测试
 */

import { describe, it, expect } from "vitest";
import {
  modeToPermissions,
  permissionsToMode,
  formatOctalMode,
  ChmodResultSchema,
} from "@/lib/file";
import type { PermissionBits } from "@/types/file";

describe("modeToPermissions", () => {
  it("should convert 755 to rwxr-xr-x", () => {
    const perms = modeToPermissions(0o755);
    expect(perms.owner).toEqual({ read: true, write: true, execute: true });
    expect(perms.group).toEqual({ read: true, write: false, execute: true });
    expect(perms.others).toEqual({ read: true, write: false, execute: true });
  });

  it("should convert 644 to rw-r--r--", () => {
    const perms = modeToPermissions(0o644);
    expect(perms.owner).toEqual({ read: true, write: true, execute: false });
    expect(perms.group).toEqual({ read: true, write: false, execute: false });
    expect(perms.others).toEqual({ read: true, write: false, execute: false });
  });

  it("should convert 600 to rw-------", () => {
    const perms = modeToPermissions(0o600);
    expect(perms.owner).toEqual({ read: true, write: true, execute: false });
    expect(perms.group).toEqual({ read: false, write: false, execute: false });
    expect(perms.others).toEqual({ read: false, write: false, execute: false });
  });

  it("should convert 777 to rwxrwxrwx", () => {
    const perms = modeToPermissions(0o777);
    expect(perms.owner).toEqual({ read: true, write: true, execute: true });
    expect(perms.group).toEqual({ read: true, write: true, execute: true });
    expect(perms.others).toEqual({ read: true, write: true, execute: true });
  });

  it("should convert 000 to ---------", () => {
    const perms = modeToPermissions(0o000);
    expect(perms.owner).toEqual({ read: false, write: false, execute: false });
    expect(perms.group).toEqual({ read: false, write: false, execute: false });
    expect(perms.others).toEqual({ read: false, write: false, execute: false });
  });
});

describe("permissionsToMode", () => {
  it("should convert rwxr-xr-x to 755", () => {
    const perms: PermissionBits = {
      owner: { read: true, write: true, execute: true },
      group: { read: true, write: false, execute: true },
      others: { read: true, write: false, execute: true },
    };
    expect(permissionsToMode(perms)).toBe(0o755);
  });

  it("should convert rw-r--r-- to 644", () => {
    const perms: PermissionBits = {
      owner: { read: true, write: true, execute: false },
      group: { read: true, write: false, execute: false },
      others: { read: true, write: false, execute: false },
    };
    expect(permissionsToMode(perms)).toBe(0o644);
  });

  it("should convert rw------- to 600", () => {
    const perms: PermissionBits = {
      owner: { read: true, write: true, execute: false },
      group: { read: false, write: false, execute: false },
      others: { read: false, write: false, execute: false },
    };
    expect(permissionsToMode(perms)).toBe(0o600);
  });

  it("should be inverse of modeToPermissions", () => {
    for (const mode of [0o755, 0o644, 0o600, 0o777, 0o000, 0o421]) {
      const perms = modeToPermissions(mode);
      expect(permissionsToMode(perms)).toBe(mode);
    }
  });
});

describe("formatOctalMode", () => {
  it("should format 755", () => {
    expect(formatOctalMode(0o755)).toBe("755");
  });

  it("should format 644", () => {
    expect(formatOctalMode(0o644)).toBe("644");
  });

  it("should pad with leading zeros", () => {
    expect(formatOctalMode(0o007)).toBe("007");
    expect(formatOctalMode(0o077)).toBe("077");
  });

  it("should format 000", () => {
    expect(formatOctalMode(0o000)).toBe("000");
  });
});

describe("ChmodResultSchema", () => {
  it("should validate success result", () => {
    const result = {
      successCount: 3,
      failures: [],
    };
    expect(ChmodResultSchema.parse(result)).toEqual(result);
  });

  it("should validate result with failures", () => {
    const result = {
      successCount: 2,
      failures: [{ path: "/test/file.txt", error: "Permission denied" }],
    };
    expect(ChmodResultSchema.parse(result)).toEqual(result);
  });

  it("should reject invalid result", () => {
    expect(() =>
      ChmodResultSchema.parse({
        successCount: "3", // should be number
        failures: [],
      })
    ).toThrow();
  });
});
