import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Trash2, AlertTriangle, Info, AlertCircle, Bug } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const LEVEL_CONFIG: Record<string, { label: string; variant: "default"|"secondary"|"destructive"|"outline"; icon: any }> = {
  error:   { label: "Erro",      variant: "destructive", icon: AlertCircle },
  warn:    { label: "Aviso",     variant: "default",     icon: AlertTriangle },
  info:    { label: "Info",      variant: "secondary",   icon: Info },
  debug:   { label: "Debug",     variant: "outline",     icon: Bug },
};

export default function Logs() {
  const [levelFilter, setLevelFilter] = useState("all");
  const [origemFilter, setOrigemFilter] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["system_logs", levelFilter, origemFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "300" });
      if (levelFilter !== "all") params.set("level", levelFilter);
      if (origemFilter) params.set("origem", origemFilter);
      return api.get<{ logs: any[]; total: number }>(`/logs?${params}`);
    },
    refetchInterval: 15000,
  });

  const clearLogs = async () => {
    if (!confirm("Limpar todos os logs?")) return;
    try {
      await api.delete("/logs");
      queryClient.invalidateQueries({ queryKey: ["system_logs"] });
      toast.success("Logs limpos!");
    } catch (e: any) {
      toast.error("Erro ao limpar logs: " + e.message);
    }
  };

  const logs = data?.logs || [];
  const total = data?.total || 0;

  const errorCount = logs.filter(l => l.level === "error").length;
  const warnCount = logs.filter(l => l.level === "warn").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs do Sistema</h1>
          <p className="text-muted-foreground">Erros e eventos registrados automaticamente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="destructive" size="sm" onClick={clearLogs} disabled={logs.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-destructive">{errorCount}</div>
            <div className="text-sm text-muted-foreground">Erros</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-500">{warnCount}</div>
            <div className="text-sm text-muted-foreground">Avisos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-sm text-muted-foreground">Total (últimos 300)</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="warn">Aviso</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filtrar por origem..."
          value={origemFilter}
          onChange={e => setOrigemFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Registros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Data/Hora</TableHead>
                <TableHead className="w-20">Nível</TableHead>
                <TableHead className="w-48">Origem</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="w-64">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum log encontrado</TableCell></TableRow>
              ) : (
                logs.map((log) => {
                  const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                  const Icon = cfg.icon;
                  return (
                    <TableRow key={log.id} className={log.level === "error" ? "bg-destructive/5" : log.level === "warn" ? "bg-yellow-500/5" : ""}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant} className="gap-1 text-xs">
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{log.origem}</TableCell>
                      <TableCell className="text-sm">{log.mensagem}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.detalhes ? (
                          <pre className="whitespace-pre-wrap break-all max-w-xs">
                            {typeof log.detalhes === "string"
                              ? log.detalhes
                              : JSON.stringify(log.detalhes, null, 2)}
                          </pre>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
