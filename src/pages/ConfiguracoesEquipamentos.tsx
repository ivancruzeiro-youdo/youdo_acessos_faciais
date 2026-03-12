import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Clock, Loader2, Wifi, WifiOff, CheckCircle2, XCircle, RefreshCw, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const TIMEZONES = [
  "UTC-12","UTC-11","UTC-10","UTC-9","UTC-8","UTC-7","UTC-6","UTC-5",
  "UTC-4","UTC-3","UTC-2","UTC-1","UTC+0","UTC+1","UTC+2","UTC+3",
  "UTC+4","UTC+5","UTC+6","UTC+7","UTC+8","UTC+9","UTC+10","UTC+11","UTC+12",
];

export default function ConfiguracoesEquipamentos() {
  const [ntpEnabled, setNtpEnabled] = useState(true);
  const [ntpTimezone, setNtpTimezone] = useState("UTC-3");
  const [adminLogin, setAdminLogin] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [menuPassword, setMenuPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showMenuPassword, setShowMenuPassword] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyDetails, setApplyDetails] = useState<any[]>([]);

  // Carregar configurações salvas do banco
  const { data: savedConfig } = useQuery({
    queryKey: ["equipamentos_config"],
    queryFn: async () => api.get<any>("/equipamentos/config"),
  });

  useEffect(() => {
    if (savedConfig) {
      setNtpEnabled(savedConfig.ntp_enabled !== false);
      setNtpTimezone(savedConfig.ntp_timezone || "UTC-3");
      if (savedConfig.admin_login) setAdminLogin(savedConfig.admin_login);
      if (savedConfig.admin_password) setAdminPassword(savedConfig.admin_password);
      if (savedConfig.menu_password) setMenuPassword(savedConfig.menu_password);
    }
  }, [savedConfig]);

  const { data: equipamentos } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => api.get<any[]>("/equipamentos"),
  });

  const { data: vpnClients } = useQuery({
    queryKey: ["vpn_clients_status"],
    queryFn: async () => {
      try { return await api.get<any>("/vpn/clients"); }
      catch { return { clients: [] }; }
    },
    refetchInterval: 30000,
  });

  const connectedIps = new Set((vpnClients?.clients || []).map((c: any) => c.ip_vpn));
  const totalCount = equipamentos?.length || 0;
  const onlineCount = equipamentos?.filter((e: any) => connectedIps.has(e.ip_vpn)).length || 0;

  const { data: deviceConfigs, isLoading: loadingConfigs, refetch: refetchConfigs } = useQuery({
    queryKey: ["device_configs", equipamentos],
    queryFn: async () => {
      if (!equipamentos?.length) return [];
      const online = equipamentos.filter((e: any) => connectedIps.has(e.ip_vpn));
      const results = await Promise.allSettled(
        online.map((e: any) =>
          api.get<any>(`/equipamentos/device-config/${e.ip_vpn}`)
            .then(r => ({ ...r, nome: e.nome }))
            .catch(() => ({ online: false, ip: e.ip_vpn, nome: e.nome }))
        )
      );
      return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
    },
    enabled: !!equipamentos?.length,
    staleTime: 60000,
  });

  const applyConfigurations = async () => {
    if (!totalCount) { toast.error("Nenhum equipamento cadastrado"); return; }
    setApplying(true);
    setApplyDetails([]);
    try {
      const result = await api.post<any>('/equipamentos/apply-config', {
        ntp_enabled: ntpEnabled,
        ntp_timezone: ntpTimezone,
        admin_login: adminLogin || null,
        admin_password: adminPassword || null,
        menu_password: menuPassword || null,
      });
      setApplyDetails(result.details || []);
      if (result.success_count > 0) toast.success(`Configurações aplicadas em ${result.success_count} equipamento(s)!`);
      if (result.error_count > 0) toast.warning(`${result.error_count} equipamento(s) offline ou com erro.`);
      refetchConfigs();
    } catch (err: any) {
      toast.error("Erro ao aplicar configurações: " + err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações dos Equipamentos</h1>
          <p className="text-muted-foreground">Configure padrões aplicados a todos os leitores cadastrados</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="default" className="bg-green-600"><Wifi className="h-3 w-3 mr-1" />{onlineCount} online</Badge>
          <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />{totalCount - onlineCount} offline</Badge>
        </div>
      </div>

      <div className="grid gap-6">

        {/* Segurança */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Segurança — Acesso Admin ao Leitor</CardTitle>
            <CardDescription>
              Define o login e senha usados para acessar as configurações do leitor. Ao aplicar, bloqueia alterações por terceiros.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="admin-login">Login admin</Label>
                <Input
                  id="admin-login"
                  value={adminLogin}
                  onChange={(e) => setAdminLogin(e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Deixe em branco para não alterar"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="menu-password">Senha do Menu (tela do leitor)</Label>
              <div className="relative">
                <Input
                  id="menu-password"
                  type={showMenuPassword ? "text" : "password"}
                  value={menuPassword}
                  onChange={(e) => setMenuPassword(e.target.value)}
                  placeholder="Senha para acessar o menu local do leitor"
                />
                <button
                  type="button"
                  onClick={() => setShowMenuPassword(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showMenuPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Bloqueia o menu de configurações na tela touch do leitor. Qualquer pessoa que tentar acessar precisará desta senha.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Login API atual salvo: <span className="font-mono font-medium">{savedConfig?.admin_login || 'admin'}</span>.
              As senhas são armazenadas no sistema e aplicadas automaticamente nos leitores.
            </p>
          </CardContent>
        </Card>

        {/* NTP */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Sincronização de Hora (NTP)</CardTitle>
            <CardDescription>
              Configura o protocolo NTP nos leitores para sincronização automática de hora via internet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ntp-enabled"
                checked={ntpEnabled}
                onChange={(e) => setNtpEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="ntp-enabled" className="cursor-pointer font-medium">
                Habilitar NTP (sincronização automática via internet)
              </Label>
            </div>

            {ntpEnabled && (
              <div className="space-y-2">
                <Label>Fuso Horário</Label>
                <Select value={ntpTimezone} onValueChange={setNtpTimezone}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>
                        {tz}{tz === "UTC-3" ? " (Brasil)" : tz === "UTC+0" ? " (GMT)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Horário de Brasília = UTC-3
                </p>
              </div>
            )}

            {/* Status NTP atual dos leitores online */}
            {(deviceConfigs?.length ?? 0) > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Estado atual nos leitores online</p>
                  <Button variant="ghost" size="sm" onClick={() => refetchConfigs()} disabled={loadingConfigs}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loadingConfigs ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>
                <div className="space-y-1">
                  {deviceConfigs?.map((cfg: any) => (
                    <div key={cfg.ip} className="flex items-center justify-between text-sm p-2 bg-muted rounded-lg">
                      <span className="font-medium">{cfg.nome}</span>
                      {cfg.online && cfg.ntp ? (
                        <div className="flex items-center gap-2">
                          {cfg.ntp.enabled === '1' ? (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />NTP ativo · {cfg.ntp.timezone}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" />NTP desativado
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{cfg.online ? 'Sem dados NTP' : 'Offline'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Resultado da última aplicação */}
      {applyDetails.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Resultado da Última Aplicação</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {applyDetails.map((d: any, i: number) => (
              <div key={i} className="flex items-start justify-between text-sm p-2 border rounded-lg">
                <div>
                  <p className="font-medium">{d.reader} <span className="text-muted-foreground text-xs">({d.ip})</span></p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {d.ntp && <span>NTP: <span className={d.ntp.startsWith('ERRO') ? 'text-red-500' : 'text-green-600'}>{d.ntp}</span></span>}
                    {d.mensagem && <span>Msg: <span className={d.mensagem.startsWith('ERRO') ? 'text-red-500' : 'text-green-600'}>{d.mensagem}</span></span>}
                  </div>
                  {d.errors?.length > 0 && <p className="text-xs text-red-500 mt-1">{d.errors.join(' · ')}</p>}
                </div>
                {d.errors?.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Botão de Aplicar */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div>
          <p className="font-medium">Aplicar Configurações</p>
          <p className="text-sm text-muted-foreground">
            Tentará aplicar em {totalCount} equipamento(s) — {onlineCount} online agora
          </p>
        </div>
        <Button onClick={applyConfigurations} disabled={applying || totalCount === 0} size="lg">
          {applying ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando...</>
          ) : (
            <><Settings className="h-4 w-4 mr-2" />Aplicar em Todos</>
          )}
        </Button>
      </div>
    </div>
  );
}
