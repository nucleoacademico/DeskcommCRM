"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChannelAiAccess } from "./ChannelAiAccess";

type FieldId = "base_url" | "external_id" | "token" | "client_token";

interface ProviderDescriptor {
  id: string;
  label: string;
  default: boolean;
  fields: Array<{
    id: FieldId;
    label: string;
    required: boolean;
    secret: boolean;
    placeholder: string;
  }>;
}

interface Session {
  id: string;
  provider: string;
  externalId: string;
  phoneNumber: string | null;
  displayName: string | null;
  status: string | null;
  webhookUrl: string | null;
}

interface State {
  providers: ProviderDescriptor[];
  sessions: Session[];
}

const EMPTY: Record<FieldId, string> = {
  base_url: "",
  external_id: "",
  token: "",
  client_token: "",
};

export function CanaisPorApiClient() {
  const t = useT();
  const [state, setState] = useState<State | null>(null);
  const [providerId, setProviderId] = useState("");
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const response = await apiClient.get<{ data: State }>("/api/v1/channels/direct");
      setState(response.data);
      setProviderId((current) => current || response.data.providers.find((p) => p.default)?.id || response.data.providers[0]?.id || "");
    } catch (err) {
      toast.error(err instanceof Error ? t(err.message) : t("Não foi possível carregar os canais."));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const provider = useMemo(
    () => state?.providers.find((item) => item.id === providerId) ?? null,
    [providerId, state],
  );

  const connect = async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const response = await apiClient.post<{
        data: { webhook_configured: boolean; webhook_warning: string | null };
      }>("/api/v1/channels/direct", {
        provider: provider.id,
        base_url: values.base_url || undefined,
        external_id: values.external_id || undefined,
        token: values.token,
        client_token: values.client_token || undefined,
      });
      setValues(EMPTY);
      if (response.data.webhook_configured) toast.success(t("Canal conectado e webhook configurado."));
      else toast.warning(response.data.webhook_warning ?? t("Canal conectado, mas o webhook precisa ser revisado."));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? t(err.message) : t("Não foi possível conectar."));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!provider && provider.fields.every((field) => !field.required || values[field.id].trim());

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="text-sm font-semibold">{t("WhatsApp por API")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Conecte uma instância já existente. A credencial é validada no servidor, cifrada no banco e nunca volta para o navegador.")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("Provedor")}</Label>
          <Select value={providerId} onValueChange={(value) => { setProviderId(value); setValues(EMPTY); }}>
            <SelectTrigger><SelectValue placeholder={t("Escolha o provedor")} /></SelectTrigger>
            <SelectContent>
              {(state?.providers ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}{item.default ? ` · ${t("padrão")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider?.fields.map((field) => (
          <div className="flex flex-col gap-1.5" key={field.id}>
            <Label htmlFor={`direct-${field.id}`}>{field.label}</Label>
            <Input
              id={`direct-${field.id}`}
              type={field.secret ? "password" : "text"}
              value={values[field.id]}
              onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
              placeholder={field.placeholder}
              autoComplete="off"
            />
          </div>
        ))}

        <div>
          <Button disabled={!canSubmit || saving} onClick={() => void connect()}>
            {saving ? t("Validando e configurando…") : t("Conectar")}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("O sistema também registra automaticamente o webhook de mensagens e entregas no provedor.")}
          </p>
        </div>
      </Card>

      {(state?.sessions ?? []).map((session) => {
        const label = state?.providers.find((item) => item.id === session.provider)?.label ?? t("Canal por API");
        return (
          <Card className="flex flex-col gap-3 p-4" key={session.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{session.displayName || label}</p>
                <p className="text-xs text-muted-foreground">
                  {label} · {session.phoneNumber || session.externalId}
                </p>
              </div>
              <Badge variant={session.status === "WORKING" ? "secondary" : "outline"}>
                {session.status || t("Sem estado")}
              </Badge>
            </div>
            <ChannelAiAccess channelId={session.id} />
            {session.webhookUrl && (
              <p className="break-all text-xs text-muted-foreground">
                {t("Webhook configurado:")} {session.webhookUrl}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
