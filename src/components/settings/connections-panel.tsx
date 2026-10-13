"use client";

import { ExternalLinkIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectionStatus } from "@/connections/connections";
import {
  cancelChatGPTSignIn,
  disconnectChatGPT,
  finishChatGPTSignIn,
  getConnections,
  startChatGPTSignIn,
} from "@/lib/chat-api";

const POLL_MS = 1500;

export function ConnectionsPanel() {
  const [status, setStatus] = useState<ConnectionStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setStatus(await getConnections());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While a sign-in waits, check whether the browser finished it on its own.
  const signingIn = status?.chatgpt.signIn !== undefined;
  useEffect(() => {
    if (!signingIn) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [signingIn, refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function connect() {
    await run(async () => {
      const { authUrl } = await startChatGPTSignIn();
      // Browsers may block a tab opened after a request; the link on the page stays as the way in.
      window.open(authUrl, "_blank", "noopener,noreferrer");
    });
  }

  if (status === undefined)
    return (
      <div className="flex justify-center p-8 text-muted-foreground">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          The accounts and keys Hei uses to reach models and the web.
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>That didn’t work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ChatGPTCard
        status={status}
        busy={busy}
        onConnect={connect}
        onFinish={(redirectUrl) => run(() => finishChatGPTSignIn(redirectUrl))}
        onCancel={() => run(cancelChatGPTSignIn)}
        onDisconnect={() => run(disconnectChatGPT)}
      />
      <ClaudeCard status={status} />
      <KeysCard status={status} />
    </div>
  );
}

function ChatGPTCard({
  status,
  busy,
  onConnect,
  onFinish,
  onCancel,
  onDisconnect,
}: {
  status: ConnectionStatus;
  busy: boolean;
  onConnect: () => void;
  onFinish: (redirectUrl: string) => void;
  onCancel: () => void;
  onDisconnect: () => void;
}) {
  const { chatgpt } = status;
  const [redirectUrl, setRedirectUrl] = useState("");

  function finish(event: FormEvent) {
    event.preventDefault();
    onFinish(redirectUrl);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ChatGPT</CardTitle>
        <CardDescription>
          {chatgpt.connected
            ? `Connected through ${chatgpt.via ?? "Sign in with ChatGPT"}. New chats use your ChatGPT plan first.`
            : "Use your ChatGPT plan for chats. You approve Hei in your browser; no password is shared."}
        </CardDescription>
        <CardAction>
          <Badge variant={chatgpt.connected ? "secondary" : "outline"}>
            {chatgpt.connected ? "Connected" : "Not connected"}
          </Badge>
        </CardAction>
      </CardHeader>

      {chatgpt.signIn ? (
        <>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>1. Approve Hei</FieldLabel>
                <FieldDescription>
                  Sign in to ChatGPT in the new tab and approve Hei. If no tab
                  opened, use this button.
                </FieldDescription>
                <Button asChild variant="outline" className="self-start">
                  <a
                    href={chatgpt.signIn.authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open ChatGPT sign-in
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              </Field>
              <form onSubmit={finish}>
                <Field>
                  <FieldLabel htmlFor="redirect-url">
                    2. If this page doesn’t update by itself
                  </FieldLabel>
                  <FieldDescription>
                    When Hei runs on another computer, the last page of the
                    sign-in won’t load. Copy its address, which starts with
                    http://127.0.0.1:1455, and paste it here.
                  </FieldDescription>
                  <div className="flex gap-2">
                    <Input
                      id="redirect-url"
                      value={redirectUrl}
                      onChange={(event) => setRedirectUrl(event.target.value)}
                      placeholder="http://127.0.0.1:1455/auth/callback?code=…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      type="submit"
                      disabled={busy || redirectUrl.trim() === ""}
                    >
                      Finish
                    </Button>
                  </div>
                </Field>
              </form>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel sign-in
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardFooter className="flex flex-col items-start gap-3">
          {chatgpt.error && (
            <p className="text-sm text-destructive">{chatgpt.error}</p>
          )}
          {!status.secretConfigured && !chatgpt.connected && (
            <p className="text-sm text-muted-foreground">
              Set <code className="font-mono">HEI_SECRET</code> in{" "}
              <code className="font-mono">.env</code> first (for example the
              output of{" "}
              <code className="font-mono">openssl rand -base64 32</code>), then
              restart Hei. It encrypts the stored sign-in.
            </p>
          )}
          {chatgpt.connected ? (
            <Button variant="outline" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={onConnect}
              disabled={busy || !status.secretConfigured}
            >
              {busy && <Spinner data-icon="inline-start" />}
              Connect ChatGPT
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

function ClaudeCard({ status }: { status: ConnectionStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude</CardTitle>
        <CardDescription>
          {status.claude.configured
            ? "Using ANTHROPIC_API_KEY. Claude is available in the model picker and as the backup."
            : "Add ANTHROPIC_API_KEY to .env and restart Hei to use Claude."}
          {status.claude.error && ` ${status.claude.error}`}
        </CardDescription>
        <CardAction>
          <Badge variant={status.claude.configured ? "secondary" : "outline"}>
            {status.claude.configured ? "Configured" : "Not configured"}
          </Badge>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

function KeysCard({ status }: { status: ConnectionStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment</CardTitle>
        <CardDescription>
          Read from <code className="font-mono">.env</code> when Hei starts.
          Change them there and restart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {status.keys.map((key) => (
            <li
              key={key.name}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-sm">{key.label}</span>
                <code className="truncate font-mono text-xs text-muted-foreground">
                  {key.name}
                </code>
              </div>
              <Badge variant={key.configured ? "secondary" : "outline"}>
                {key.configured ? "Set" : "Missing"}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
