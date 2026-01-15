/**
 * 连接管理页面 - Cyberpunk Terminal Style
 * 展示连接列表，支持新增、编辑、删除、测试、连接操作
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, Terminal, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectionCard } from "@/components/connections/ConnectionCard";
import { PasswordDialog } from "@/components/connections/PasswordDialog";
import { HostKeyDialog } from "@/components/connections/HostKeyDialog";
import { RecentConnections } from "@/components/RecentConnections";
import { EmptyState } from "@/components/EmptyState";
import { useProfiles, useDeleteProfile } from "@/hooks/useProfiles";
import { useConnect } from "@/hooks/useConnect";

export function ConnectionsPage() {
  const navigate = useNavigate();
  const { data: profiles = [], isLoading } = useProfiles();
  const deleteProfile = useDeleteProfile();
  const {
    isConnecting,
    connectingProfileId,
    needPassword,
    needPassphrase,
    hostKeyPayload,
    currentProfile,
    startConnect,
    submitCredentials,
    confirmHostKey,
    rejectHostKey,
    cancelConnect,
  } = useConnect();

  const handleAdd = useCallback(() => {
    navigate("/connections/new");
  }, [navigate]);

  const handleEdit = useCallback(
    (profileId: string) => {
      navigate(`/connections/${profileId}/edit`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (profileId: string) => {
      await deleteProfile.mutateAsync(profileId);
    },
    [deleteProfile]
  );

  const handleConnect = useCallback(
    async (profileId: string) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        await startConnect(profile);
      }
    },
    [profiles, startConnect]
  );

  const handlePasswordSubmit = useCallback(
    (value: string) => {
      if (needPassword) {
        submitCredentials(value, undefined);
      } else if (needPassphrase) {
        submitCredentials(undefined, value);
      }
    },
    [needPassword, needPassphrase, submitCredentials]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-primary" />
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          <span className="text-primary">&gt;</span> LOADING_PROFILES...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 - Terminal Style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium tracking-wide">SSH_HOSTS</span>
          </div>
          <span className="text-border">│</span>
          <span className="text-xs text-muted-foreground font-mono">
            {profiles.length === 0 ? (
              <span className="text-warning">NO_CONNECTIONS</span>
            ) : (
              <>
                <span className="text-primary">{profiles.length}</span>
                <span> nodes registered</span>
              </>
            )}
          </span>
        </div>
        <Button
          onClick={handleAdd}
          size="icon"
          variant="ghost"
          className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 最近连接侧边栏 */}
        {profiles.length > 0 && (
          <aside className="w-56 border-r border-border bg-sidebar p-3 hidden lg:flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-sidebar-border">
              <Zap className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-medium tracking-wide">QUICK_ACCESS</span>
            </div>
            <div className="flex-1 overflow-auto">
              <RecentConnections
                onConnect={handleConnect}
                connectingId={isConnecting ? connectingProfileId : null}
              />
            </div>
          </aside>
        )}

        {/* 连接列表 */}
        <div className="flex-1 overflow-auto p-4">
          {profiles.length === 0 ? (
            <EmptyState
              icon="server"
              title="NO_CONNECTIONS_FOUND"
              description="初始化你的第一个远程节点连接"
              action={
                <Button
                  onClick={handleAdd}
                  variant="outline"
                  className="gap-2 btn-cyber border-primary/50 hover:border-primary"
                >
                  <Plus className="h-4 w-4" />
                  <span>NEW_CONNECTION</span>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 max-w-5xl">
              {profiles.map((profile, index) => (
                <div
                  key={profile.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <ConnectionCard
                    profile={profile}
                    isConnecting={connectingProfileId === profile.id && isConnecting}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onConnect={handleConnect}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 密码输入弹窗 */}
      <PasswordDialog
        open={needPassword || needPassphrase}
        onOpenChange={(open) => {
          if (!open) cancelConnect();
        }}
        type={needPassphrase ? "passphrase" : "password"}
        hostInfo={currentProfile ? `${currentProfile.username}@${currentProfile.host}` : undefined}
        isConnecting={isConnecting}
        onSubmit={handlePasswordSubmit}
        onCancel={cancelConnect}
      />

      {/* HostKey 确认弹窗 */}
      <HostKeyDialog
        open={!!hostKeyPayload}
        onOpenChange={() => {}}
        payload={hostKeyPayload}
        isProcessing={isConnecting}
        onTrust={confirmHostKey}
        onReject={rejectHostKey}
      />
    </div>
  );
}
