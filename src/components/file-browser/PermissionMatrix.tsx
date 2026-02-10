/**
 * Permission Matrix Component - 3x3 Checkbox Matrix
 *
 * Displays Owner/Group/Others x Read/Write/Execute permissions
 */

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatOctalMode, permissionsToMode } from "@/lib/file";
import type { PermissionBits, RolePermission } from "@/types/file";

type Role = "owner" | "group" | "others";
type Permission = "read" | "write" | "execute";

interface PermissionMatrixProps {
  /** Current permission values */
  permissions: PermissionBits;
  /** Permission change callback */
  onChange: (permissions: PermissionBits) => void;
  /** Whether disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

const ROLES: { key: Role; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "group", label: "Group" },
  { key: "others", label: "Others" },
];

const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "read", label: "R" },
  { key: "write", label: "W" },
  { key: "execute", label: "X" },
];

export function PermissionMatrix({
  permissions,
  onChange,
  disabled = false,
  className,
}: PermissionMatrixProps) {
  const handleChange = useCallback(
    (role: Role, perm: Permission, checked: boolean) => {
      const newPerms: PermissionBits = {
        owner: { ...permissions.owner },
        group: { ...permissions.group },
        others: { ...permissions.others },
      };
      (newPerms[role] as RolePermission)[perm] = checked;
      onChange(newPerms);
    },
    [permissions, onChange]
  );

  const octalMode = permissionsToMode(permissions);

  return (
    <div className={cn("font-mono text-xs", className)}>
      {/* Table */}
      <table className="w-full border-collapse">
        {/* Header */}
        <thead>
          <tr>
            <th className="text-muted-foreground w-20 py-1.5 text-left font-normal" />
            {PERMISSIONS.map(({ key, label }) => (
              <th key={key} className="text-muted-foreground w-12 py-1.5 text-center font-normal">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {/* Body */}
        <tbody>
          {ROLES.map(({ key: role, label }) => (
            <tr key={role} className="border-border/50 border-t">
              <td className="text-muted-foreground py-1.5">{label}</td>
              {PERMISSIONS.map(({ key: perm }) => (
                <td key={perm} className="py-1.5 text-center">
                  <Checkbox
                    checked={permissions[role][perm]}
                    onCheckedChange={(checked) => handleChange(role, perm, checked === true)}
                    disabled={disabled}
                    aria-label={`${role} ${perm}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Octal display */}
      <div className="text-muted-foreground mt-3 flex items-center gap-2">
        <span>Octal:</span>
        <span className="text-primary font-bold">{formatOctalMode(octalMode)}</span>
      </div>
    </div>
  );
}
