/**
 * 连接管理 Hook
 * 处理 SSH 连接流程，包括密码输入和 HostKey 确认
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { connect, trustHostKey, reconnectWithTrustedKey } from "@/lib/session";
import { showErrorToast } from "@/lib/error";
import type { Profile } from "@/types/profile";
import type { HostKeyPayload, SessionConnectResult } from "@/types/events";

interface ConnectState {
  isConnecting: boolean;
  connectingProfileId: string | null;
  /** 需要输入密码 */
  needPassword: boolean;
  /** 需要输入 passphrase */
  needPassphrase: boolean;
  /** 需要确认 HostKey */
  hostKeyPayload: HostKeyPayload | null;
  /** 当前连接的 profile */
  currentProfile: Profile | null;
  /** 临时保存的凭证（用于 HostKey 确认后重连） */
  pendingCredentials: { password?: string; passphrase?: string } | null;
}

const INITIAL_STATE: ConnectState = {
  isConnecting: false,
  connectingProfileId: null,
  needPassword: false,
  needPassphrase: false,
  hostKeyPayload: null,
  currentProfile: null,
  pendingCredentials: null,
};

interface UseConnectReturn extends ConnectState {
  /** 发起连接 */
  startConnect: (profile: Profile) => Promise<void>;
  /** 提交密码/passphrase */
  submitCredentials: (password?: string, passphrase?: string) => Promise<void>;
  /** 确认信任 HostKey */
  confirmHostKey: () => Promise<void>;
  /** 拒绝 HostKey */
  rejectHostKey: () => void;
  /** 取消连接 */
  cancelConnect: () => void;
}

export function useConnect(): UseConnectReturn {
  const navigate = useNavigate();
  const [state, setState] = useState<ConnectState>(INITIAL_STATE);

  const resetState = useCallback(() => setState(INITIAL_STATE), []);

  const handleConnectResult = useCallback(
    (result: SessionConnectResult, profile: Profile) => {
      if (result.needHostKeyConfirm && result.serverFingerprint) {
        // 需要确认 HostKey
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          hostKeyPayload: {
            profileId: profile.id,
            host: profile.host,
            port: profile.port,
            fingerprint: result.serverFingerprint!,
            keyType: "ssh-rsa", // 后端应该返回实际类型
            status: "unknown",
          },
        }));
      } else if (result.sessionId) {
        // 连接成功
        resetState();
        navigate(`/files/${result.sessionId}`);
      }
    },
    [navigate, resetState]
  );

  const startConnect = useCallback(
    async (profile: Profile) => {
      setState({
        isConnecting: true,
        connectingProfileId: profile.id,
        needPassword: false,
        needPassphrase: false,
        hostKeyPayload: null,
        currentProfile: profile,
        pendingCredentials: null,
      });

      try {
        // 检查是否需要密码
        if (profile.authType === "password" && !profile.passwordRef) {
          setState((prev) => ({
            ...prev,
            isConnecting: false,
            needPassword: true,
          }));
          return;
        }

        // 检查是否需要 passphrase
        if (profile.authType === "key" && !profile.passphraseRef) {
          // 先尝试无 passphrase 连接，失败后再要求输入
          // 这里简化处理，直接尝试连接
        }

        const result = await connect({ profileId: profile.id });
        handleConnectResult(result, profile);
      } catch (error) {
        // 检查是否是需要密码的错误
        const errorStr = String(error);
        if (errorStr.includes("password required") || errorStr.includes("AUTH_FAILED")) {
          setState((prev) => ({
            ...prev,
            isConnecting: false,
            needPassword: profile.authType === "password",
            needPassphrase: profile.authType === "key",
          }));
          return;
        }

        showErrorToast(error);
        resetState();
      }
    },
    [handleConnectResult, resetState]
  );

  const submitCredentials = useCallback(
    async (password?: string, passphrase?: string) => {
      const profile = state.currentProfile;
      if (!profile) return;

      setState((prev) => ({
        ...prev,
        isConnecting: true,
        needPassword: false,
        needPassphrase: false,
        pendingCredentials: { password, passphrase },
      }));

      try {
        const result = await connect({
          profileId: profile.id,
          password,
          passphrase,
        });
        handleConnectResult(result, profile);
      } catch (error) {
        showErrorToast(error);
        resetState();
      }
    },
    [state.currentProfile, handleConnectResult, resetState]
  );

  const confirmHostKey = useCallback(async () => {
    const profile = state.currentProfile;
    const hostKey = state.hostKeyPayload;
    const credentials = state.pendingCredentials;
    if (!profile || !hostKey) return;

    setState((prev) => ({
      ...prev,
      isConnecting: true,
      hostKeyPayload: null,
    }));

    try {
      // 信任 HostKey
      await trustHostKey({
        host: hostKey.host,
        port: hostKey.port,
        keyType: hostKey.keyType,
        fingerprint: hostKey.fingerprint,
      });

      // 重新连接，带上之前保存的凭证
      const result = await reconnectWithTrustedKey({
        profileId: profile.id,
        password: credentials?.password,
        passphrase: credentials?.passphrase,
      });
      handleConnectResult(result, profile);
    } catch (error) {
      showErrorToast(error);
      resetState();
    }
  }, [state.currentProfile, state.hostKeyPayload, state.pendingCredentials, handleConnectResult, resetState]);

  const rejectHostKey = useCallback(() => {
    resetState();
  }, [resetState]);

  const cancelConnect = useCallback(() => {
    resetState();
  }, [resetState]);

  return {
    ...state,
    startConnect,
    submitCredentials,
    confirmHostKey,
    rejectHostKey,
    cancelConnect,
  };
}
