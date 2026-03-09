import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Server, Wifi, WifiOff, Shield, ShieldOff, Plus, Download, Trash2,
  RefreshCw, Loader2, Activity, Clock, FileText,
} from "lucide-react";
import { toast } from "sonner";

function useVpnAction<T = any>(action: string, params?: Record<string, any>) {
  return useQuery<T>({
    queryKey: ["vpn", action, params],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action, ...params },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
    retry: 1,
  });
}

// ─── Server Status Card ───
function ServerStatus() {
  const { data, isLoading, error, refetch } = useVpnAction("vpn_status");
  const server = data?.server;
  const stats = data?.statistics;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" /> Servidor VPN
          </CardTitle>
          <CardDescription>Status do OpenVPN na EC2</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : error ? (
          <div className="space-y-1">
            <p className="text-destructive text-sm font-medium">Não foi possível conectar ao servidor.</p>
            <p className="text-xs text-muted-foreground font-mono">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        ) : server ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Status" value={
              <Badge variant={server.status === "running" ? "default" : "destructive"}>
                {server.status === "running" ? "Online" : "Offline"}
              </Badge>
            } />
            <Stat label="Uptime" value={server.uptime || "—"} />
            <Stat label="Conectados" value={stats?.connected_clients ?? "—"} />
            <Stat label="Certificados" value={`${stats?.active_certificates ?? 0} ativos / ${stats?.revoked_certificates ?? 0} revogados`} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sem dados do servidor.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}

// ─── Connected Clients ───
function ConnectedClients() {
  const { data, isLoading, refetch } = useVpnAction("vpn_clients");
  const clients = data?.clients || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" /> Clientes Conectados
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>IP VPN</TableHead>
              <TableHead>IP Real</TableHead>
              <TableHead>Conectado desde</TableHead>
              <TableHead>Tráfego</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando...
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente conectado
                </TableCell>
              </TableRow>
            ) : (
              clients.map((c: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{c.client_name}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{c.ip_vpn}</code></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.ip_real || "—"}</TableCell>
                  <TableCell className="text-xs">{c.connected_since ? new Date(c.connected_since).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-xs">
                    ↑ {formatBytes(c.bytes_sent)} / ↓ {formatBytes(c.bytes_received)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Certificates ───
function Certificates() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useVpnAction("list_certificates");
  const certs = data?.certificates || [];
  const [createOpen, setCreateOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: {
          action: "create_certificate",
          client_name: clientName,
          ip_address: ipAddress,
          description,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Certificado criado!");
      setCreateOpen(false);
      setClientName("");
      setIpAddress("");
      setDescription("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action: "revoke_certificate", certificate_id: id, reason: "Revogado pelo painel" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Certificado revogado!");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadCert = async (id: string, name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action: "download_certificate", certificate_id: id },
      });
      if (error) throw error;
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data)], { type: "application/x-openvpn-profile" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.ovpn`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Erro ao baixar: " + e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" /> Certificados VPN
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Certificado VPN</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Cliente</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="portaria-principal" required />
                </div>
                <div className="space-y-2">
                  <Label>IP VPN</Label>
                  <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="10.8.0.5" required />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Leitor da portaria principal" />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {create.isPending ? "Criando..." : "Criar Certificado"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando...</TableCell></TableRow>
            ) : certs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum certificado</TableCell></TableRow>
            ) : (
              certs.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.client_name}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{c.ip_address}</code></TableCell>
                  <TableCell>
                    {c.status === "active" ? (
                      <Badge variant="default" className="bg-green-600">Ativo</Badge>
                    ) : (
                      <Badge variant="destructive">Revogado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => downloadCert(c.id, c.client_name)} title="Baixar .ovpn">
                        <Download className="h-4 w-4" />
                      </Button>
                      {c.status === "active" && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => revoke.mutate(c.id)} title="Revogar">
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Logs ───
function VpnLogs() {
  const [limit, setLimit] = useState(50);
  const { data, isLoading, refetch } = useVpnAction("vpn_logs", { limit });
  const logs = data?.logs || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" /> Logs de Conexão
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Mensagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum log</TableCell></TableRow>
            ) : (
              logs.map((l: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{l.timestamp ? new Date(l.timestamp).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell className="font-medium text-sm">{l.client_name}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{l.ip_vpn}</code></TableCell>
                  <TableCell>
                    <Badge variant={l.event === "connected" ? "default" : "secondary"}>
                      {l.event === "connected" ? "Conectou" : l.event === "disconnected" ? "Desconectou" : l.event}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.message || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ─── Main Page ───
export default function VPN() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">VPN</h1>
        <p className="text-muted-foreground">Gerenciamento de VPN e certificados</p>
      </div>

      <ServerStatus />

      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Clientes Conectados</TabsTrigger>
          <TabsTrigger value="certificates">Certificados</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="clients"><ConnectedClients /></TabsContent>
        <TabsContent value="certificates"><Certificates /></TabsContent>
        <TabsContent value="logs"><VpnLogs /></TabsContent>
      </Tabs>
    </div>
  );
}
