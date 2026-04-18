import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTinkLinkFlow } from "@/hooks/useTinkLinkFlow";

interface Props {
  userId: string | undefined;
}

const STEPS = [
  {
    title: "Secure session",
    body: "This app asks your backend for a one-time Tink Link session (never your bank password here).",
  },
  {
    title: "BankID in Tink",
    body: "You sign with BankID inside Tink’s flow; credentials stay with Tink until your server stores tokens safely.",
  },
  {
    title: "Return & sync",
    body: "After redirect, your Worker processes the result (and optionally triggers account refresh webhooks).",
  },
];

export function TinkConnectCard({ userId }: Props) {
  const {
    env,
    configured,
    phase,
    errorMessage,
    callbackResult,
    startBankIdConnect,
    resetError,
    dismissCallback,
    returnUrl,
  } = useTinkLinkFlow({
    userId,
    onCallback: () => {
      /* optional: invalidate bank queries */
    },
  });

  const busy = phase === "loading" || phase === "redirecting";

  const onConnectClick = useCallback(() => {
    resetError();
    void startBankIdConnect();
  }, [resetError, startBankIdConnect]);

  return (
    <Card className="bento-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tink + BankID</CardTitle>
        <CardDescription>
          Connect Swedish banks via Tink; BankID is completed in Tink’s hosted flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callbackResult && callbackResult.status !== "idle" ? (
          <div
            className={
              callbackResult.status === "success"
                ? "rounded-xl border border-finance-income/30 bg-finance-income/5 px-3 py-2 text-sm"
                : "rounded-xl border border-finance-expense/30 bg-finance-expense/5 px-3 py-2 text-sm"
            }
            role="status"
          >
            <p className="font-medium text-foreground">
              {callbackResult.status === "success"
                ? "Connection completed"
                : callbackResult.status === "cancelled"
                  ? "Cancelled"
                  : "Something went wrong"}
            </p>
            {callbackResult.message ? (
              <p className="mt-1 text-muted-foreground">{callbackResult.message}</p>
            ) : null}
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={dismissCallback}>
              Dismiss
            </Button>
          </div>
        ) : null}

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
            >
              <span className="text-xs font-medium text-muted-foreground">
                Step {i + 1}
              </span>
              <p className="font-medium text-foreground">{s.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Configuration</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>
              <code className="rounded bg-muted px-1">VITE_TINK_CONNECT_API_BASE_URL</code>{" "}
              {configured ? (
                <span className="text-finance-income">set</span>
              ) : (
                <span className="text-finance-runway">missing</span>
              )}
            </li>
            <li>
              Demo:{" "}
              <code className="rounded bg-muted px-1">VITE_TINK_DEMO_MODE</code> ={" "}
              {env.demoMode ? "true" : "false"}
            </li>
            <li className="break-all">
              Return URL sent to API: <span className="text-foreground/80">{returnUrl}</span>
            </li>
          </ul>
        </div>

        {errorMessage ? (
          <p className="text-sm text-finance-expense" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy || !userId} onClick={onConnectClick}>
            {phase === "redirecting"
              ? "Redirecting to Tink…"
              : phase === "loading"
                ? "Starting session…"
                : "Connect bank (BankID via Tink)"}
          </Button>
          {!userId ? (
            <span className="text-xs text-muted-foreground">Sign in to enable.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
