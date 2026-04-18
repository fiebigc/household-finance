import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  consumeTinkCallbackFromUrl,
  isTinkConnectConfigured,
  readTinkPublicEnv,
  requestTinkAuthorizationUrl,
  TinkCallbackResult,
  TinkConnectError,
} from "@/lib/tinkService";

export type TinkFlowPhase = "idle" | "loading" | "redirecting" | "error";

export interface UseTinkLinkFlowOptions {
  userId: string | undefined;
  /** Called after return from Tink (query params consumed). */
  onCallback?: (result: TinkCallbackResult) => void;
}

export function useTinkLinkFlow({ userId, onCallback }: UseTinkLinkFlowOptions) {
  const env = useMemo(() => readTinkPublicEnv(), []);
  const configured = useMemo(() => isTinkConnectConfigured(env), [env]);
  const onCallbackRef = useRef(onCallback);
  onCallbackRef.current = onCallback;

  const [phase, setPhase] = useState<TinkFlowPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callbackResult, setCallbackResult] = useState<TinkCallbackResult | null>(null);

  useEffect(() => {
    const result = consumeTinkCallbackFromUrl({ replaceHistory: true });
    if (result.status === "idle") return;
    setCallbackResult(result);
    onCallbackRef.current?.(result);
  }, []);

  const returnUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }, []);

  const startBankIdConnect = useCallback(async () => {
    setErrorMessage(null);
    if (!userId) {
      setPhase("error");
      setErrorMessage("You need to be signed in to connect a bank.");
      return;
    }
    if (!configured) {
      setPhase("error");
      setErrorMessage(
        env.demoMode
          ? "Demo mode is on, but VITE_TINK_CONNECT_API_BASE_URL is still required to open a real Tink session once your Worker exposes POST …/session."
          : "Set VITE_TINK_CONNECT_API_BASE_URL to your backend base URL (see .env.example).",
      );
      return;
    }

    setPhase("loading");
    try {
      const { authorizationUrl } = await requestTinkAuthorizationUrl(
        {
          userId,
          returnUrl,
          market: "sv_SE",
        },
        env,
      );
      setPhase("redirecting");
      window.location.assign(authorizationUrl);
    } catch (e) {
      setPhase("error");
      const msg =
        e instanceof TinkConnectError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not start Tink session.";
      setErrorMessage(msg);
    }
  }, [configured, env, returnUrl, userId]);

  const resetError = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const dismissCallback = useCallback(() => setCallbackResult(null), []);

  return {
    env,
    configured,
    phase,
    errorMessage,
    callbackResult,
    startBankIdConnect,
    resetError,
    dismissCallback,
    returnUrl,
  };
}
