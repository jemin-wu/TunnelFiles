/**
 * 权限矩阵组件 - 3x3 复选框矩阵
 *
 * 显示 Owner/Group/Others × Read/Write/Execute 权限
 */

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatOctalMode, permissionsToMode } from "@/lib/file";
import type { PermissionBits, RolePermission } from "@/types/file";

type Role = "owner" | "group" | "others";
type Permission = "read" | "write" | "execute";

interface PermissionMatrixProps {
  /** 当前权限值 */
  permissions: PermissionBits;
  /** 权限变更回调 */
  onChange: (permissions: PermissionBits) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

const ROLES: { key: Role; label: string }[] = [
  { key: "owner", label: "OWNER" },
  { key: "group", label: "GROUP" },
  { key: "others", label: "OTHERS" },
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
      {/* 表格 */}
      <table className="w-full border-collapse">
        {/* 表头 */}
        <thead>
          <tr>
            <th className="w-20 text-left py-1.5 text-muted-foreground font-normal" />
            {PERMISSIONS.map(({ key, label }) => (
              <th
                key={key}
                className="w-12 text-center py-1.5 text-muted-foreground font-normal"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {/* 表体 */}
        <tbody>
          {ROLES.map(({ key: role, label }) => (
            <tr key={role} className="border-t border-border/50">
              <td className="py-1.5 text-muted-foreground">{label}</td>
              {PERMISSIONS.map(({ key: perm }) => (
                <td key={perm} className="text-center py-1.5">
                  <Checkbox
                    checked={permissions[role][perm]}
                    onCheckedChange={(checked) =>
                      handleChange(role, perm, checked === true)
                    }
                    disabled={disabled}
                    aria-label={`${role} ${perm}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 八进制显示 */}
      <div className="mt-3 flex items-center gap-2 text-muted-foreground">
        <span>OCTAL:</span>
        <span className="text-primary font-bold">{formatOctalMode(octalMode)}</span>
      </div>
    </div>
  );
}
