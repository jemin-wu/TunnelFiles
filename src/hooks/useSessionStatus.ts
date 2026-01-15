/**
 * 会话状态 Hook
 * 监听会话状态变化，用于文件管理页检测会话有效性
 */

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { getSessionInfo } from "@/lib/session";
import type { SessionInfo, SessionStatusPayload } from "@/types/events";

interface UseSessionStatusReturn {
  /** 会话信息 */
  sessionInfo: SessionInfo | null;
  /** 会话是否有效 */
  isValid: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
}

export function useSessionStatus(sessionId?: string): UseSessionStatusReturn {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 用于去重断开事件，防止重复显示 Toast
  const hasNotifiedRef = useRef(false);

  // 获取初始会话信息
  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      setIsValid(false);
      return;
    }

    let cancelled = false;

    const fetchSessionInfo = async () => {
      try {
        const info = await getSessionInfo(sessionId);
        if (cancelled) return;

        if (info) {
          setSessionInfo(info);
          setIsValid(true);
        } else {
          setIsValid(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        setIsValid(false);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSessionInfo();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 监听会话状态变化
  useEffect(() => {
    if (!sessionId) return;

    // 重置通知状态
    hasNotifiedRef.current = false;

    const unlisten = listen<SessionStatusPayload>("session:status", (event) => {
      if (event.payload.sessionId !== sessionId) return;

      const { status, message } = event.payload;

      if (status === "disconnected" || status === "error") {
        setIsValid(false);
        setError(message || "连接已断开");

        // 防止重复通知
        if (!hasNotifiedRef.current) {
          hasNotifiedRef.current = true;

          if (status === "error") {
            // 异常断开：显示错误 Toast，提示可在连接页重试
            toast.error("连接异常", {
              description: message || "网络连接中断，请检查网络后重新连接",
              duration: 5000,
            });
          } else {
            // 正常断开：显示警告 Toast
            toast.warning("连接已断开", {
              description: message || "与服务器的连接已关闭",
              duration: 4000,
            });
          }
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [sessionId]);

  return {
    sessionInfo,
    isValid,
    isLoading,
    error,
  };
}
