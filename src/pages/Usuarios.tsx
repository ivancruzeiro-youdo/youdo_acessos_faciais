import { useState, useEffect } from "react";
import { getUserpCredentials, getUserpBaseUrl } from "@/pages/Configuracoes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Search, RefreshCw, Upload, CheckCircle2, Circle, Loader2, XCircle, ArrowDownToLine, AlertTriangle, UserX } from "lucide-react";
import { UserpSyncButton } from "@/components/UserpSyncButton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";
import { WebcamCapture } from "@/components/WebcamCapture";

type SyncStepStatus = 'pending' | 'running' | 'done' | 'error' | 'warning';

export default function Usuarios() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const [filterEmp, setFilterEmp] = useState("all");
  const [filterAcesso, setFilterAcesso] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"active" | "deleted" | "all">("active");

  // Atualizar foto
  const [fotoOpen, setFotoOpen] = useState(false);
  const [fotoTargetId, setFotoTargetId] = useState<string | null>(null);
  const [fotoTargetNome, setFotoTargetNome] = useState("");
  const [fotoTargetUserpId, setFotoTargetUserpId] = useState<number | null>(null);
  const [fotoBase64, setFotoBase64] = useState("");
  const [fotoSaving, setFotoSaving] = useState(false);
  // credenciais Userp lidas do localStorage (configuradas em /configuracoes)
  const [userpEmail, setUserpEmail] = useState("");
  const [userpSenha, setUserpSenha] = useState("");
  // resultado do envio de foto
  const [fotoResult, setFotoResult] = useState<{
    localOk: boolean;
    userpStatus: 'idle'|'sending'|'ok'|'error'|'skipped';
    userpMsg: string;
  } | null>(null);

  // Preview Userp individual
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCredOpen, setPreviewCredOpen] = useState(false);
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  // Sincronizar com leitores
  const [syncing, setSyncing] = useState(false);
  const [syncSteps, setSyncSteps] = useState<{label: string; status: SyncStepStatus; detail?: string}[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; readers: number } | null>(null);
  // nomes (lowercase) de usuários com foto rejeitada pelo leitor
  const [photoRejectedNames, setPhotoRejectedNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    const creds = getUserpCredentials();
    if (creds.email) setUserpEmail(creds.email);
    if (creds.senha) setUserpSenha(creds.senha);
  }, []);

  const { data: acessosOpts } = useQuery({
    queryKey: ["acessos"],
    queryFn: async () => api.get<any[]>("/acessos"),
  });

  const { data: empreendimentosOpts } = useQuery({
    queryKey: ["empreendimentos"],
    queryFn: async () => api.get<any[]>("/empreendimentos"),
  });

  const acessosFiltradosPorEmp = filterEmp === "all"
    ? (acessosOpts || [])
    : (acessosOpts || []).filter((a) => a.empreendimento_id === filterEmp);

  const { data: items, isLoading } = useQuery({
    queryKey: ["usuarios", filterStatus],
    queryFn: async () => api.get<any[]>(`/usuarios?status=${filterStatus}`),
  });

  const openFotoDialog = (item: any) => {
    setFotoTargetId(item.id);
    setFotoTargetNome(item.nome);
    // userp_id é a matrícula do usuário
    setFotoTargetUserpId(item.matricula || item.userp_id || null);
    setFotoBase64(item.foto_base64 || "");
    setFotoResult(null);
    setFotoOpen(true);
  };

  const handleSaveFoto = async () => {
    if (!fotoTargetId || !fotoBase64) return;
    setFotoSaving(true);
    setFotoResult(null);

    // Etapa 1: salvar localmente
    try {
      await api.put(`/usuarios/${fotoTargetId}`, { foto_base64: fotoBase64 });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (err: any) {
      toast.error("Erro ao salvar foto: " + err.message);
      setFotoSaving(false);
      return;
    }

    // Etapa 2: enviar ao Userp
    if (!userpEmail || !userpSenha) {
      setFotoResult({ localOk: true, userpStatus: 'skipped', userpMsg: 'Configure as credenciais Userp em Configurações para enviar automaticamente.' });
    } else {
      setFotoResult({ localOk: true, userpStatus: 'sending', userpMsg: '' });
      try {
        await api.post(`/usuarios/${fotoTargetId}/sync-foto`, { email: userpEmail, senha: userpSenha, userp_base_url: getUserpBaseUrl() });
        setFotoResult({ localOk: true, userpStatus: 'ok', userpMsg: 'Foto enviada ao Userp com sucesso!' });
      } catch (err: any) {
        setFotoResult({ localOk: true, userpStatus: 'error', userpMsg: err.message });
      }
    }

    setFotoSaving(false);
  };

  const [previewTargetItem, setPreviewTargetItem] = useState<any | null>(null);

  const handlePreview = async (item: any) => {
    if (!userpEmail || !userpSenha) {
      toast.error("Informe as credenciais Userp no topo da página antes de continuar.");
      return;
    }
    setPreviewLoading(true);
    setPreviewItem(null);
    setPreviewOpen(true);
    setPreviewCredOpen(false);
    try {
      const data = await api.post<any>("/userp/sync/preview-usuario", {
        email: userpEmail,
        senha: userpSenha,
        usuario_local_id: item.id,
        userp_base_url: getUserpBaseUrl(),
      });
      setPreviewItem({ ...data, usuario_local_id: item.id, local_foto_base64: item.foto_base64 || null });
    } catch (err: any) {
      toast.error("Erro ao buscar dados do Userp: " + err.message);
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCredSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (previewTargetItem) handlePreview(previewTargetItem);
  };

  const handleApply = async () => {
    if (!previewItem) return;
    setApplyLoading(true);
    try {
      const result = await api.post<any>("/userp/sync/apply-usuario", {
        email: userpEmail,
        senha: userpSenha,
        usuario_local_id: previewItem.usuario_local_id,
        userp_base_url: getUserpBaseUrl(),
      });
      toast.success(`Usuário atualizado!${result.foto_atualizada ? " Foto sincronizada." : ""}`);
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setPreviewOpen(false);
      setPreviewItem(null);
    } catch (err: any) {
      toast.error("Erro ao aplicar: " + err.message);
    } finally {
      setApplyLoading(false);
    }
  };




  const filtered = items?.filter((i) => {
    const matchSearch = i.nome.toLowerCase().includes(search.toLowerCase()) ||
      (i.matricula || "").toLowerCase().includes(search.toLowerCase());
    const matchEmp = filterEmp === "all" ||
      i.acessos?.some((a: any) => {
        const acesso = acessosOpts?.find((o: any) => o.id === a.id);
        return acesso?.empreendimento_id === filterEmp;
      });
    const matchAcesso = filterAcesso === "all" ||
      i.acessos?.some((a: any) => a.id === filterAcesso);
    return matchSearch && matchEmp && matchAcesso;
  });

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
  };



  const syncUsersToReaders = async () => {
    setSyncing(true);
    setSyncSteps([]);
    setSyncProgress(0);

    const setStep = (steps: {label: string; status: SyncStepStatus; detail?: string}[]) => {
      setSyncSteps([...steps]);
    };

    try {
      // Etapa 1: buscar equipamentos
      const steps: {label: string; status: SyncStepStatus; detail?: string}[] = [
        { label: 'Buscando leitores online', status: 'running' },
      ];
      setStep(steps);
      setSyncProgress(5);

      const equipamentos = await api.get<any[]>("/equipamentos");
      if (!equipamentos?.length) { toast.error("Nenhum equipamento cadastrado"); setSyncing(false); return; }

      const vpnData = await api.get<any>('/vpn/clients');
      const onlineIps = new Set((vpnData?.clients || []).map((c: any) => c.ip_vpn));
      const onlineReaders = equipamentos.filter(eq => onlineIps.has(eq.ip_vpn));

      if (onlineReaders.length === 0) {
        steps[0] = { label: 'Buscando leitores online', status: 'error', detail: 'Nenhum leitor online' };
        setStep(steps); toast.error("Nenhum leitor online no momento"); setSyncing(false); return;
      }
      steps[0] = { label: 'Buscando leitores online', status: 'done', detail: `${onlineReaders.length} leitor(es) online` };
      setSyncProgress(15);

      // Etapa 2: aplicar configurações do equipamento em cada leitor
      steps.push({ label: 'Aplicando configurações dos leitores (NTP, logo, senha)', status: 'running' });
      setStep(steps);

      try {
        await api.post('/equipamentos/apply-config', {});
        steps[1] = { label: 'Aplicando configurações dos leitores (NTP, logo, senha)', status: 'done', detail: 'Configurações aplicadas' };
      } catch {
        steps[1] = { label: 'Aplicando configurações dos leitores (NTP, logo, senha)', status: 'error', detail: 'Erro ao aplicar config (continuando...)' };
      }
      setSyncProgress(35);
      setStep(steps);

      // Etapa 3+: sync de usuários por leitor
      let totalSynced = 0;
      let totalDeleted = 0;
      const errors: string[] = [];

      for (let i = 0; i < onlineReaders.length; i++) {
        const reader = onlineReaders[i];
        steps.push({ label: `Sincronizando ${reader.nome} (${reader.ip_vpn})`, status: 'running' });
        setStep(steps);
        setSyncProgress(35 + Math.round(((i + 0.5) / onlineReaders.length) * 60));

        try {
          const result = await api.post<any>('/vpn/sync-reader', {
            reader_ip: reader.ip_vpn,
            acesso_id: reader.acesso_id,
          });
          const s = result?.synced || 0;
          const d = result?.deleted || 0;
          const photoErrs: string[] = result?.photo_errors || [];
          totalSynced += s;
          totalDeleted += d;
          const detail = [
            s > 0 ? `${s} sincronizado(s)` : '',
            d > 0 ? `${d} removido(s)` : '',
            photoErrs.length > 0 ? `${photoErrs.length} foto(s) rejeitada(s)` : '',
          ].filter(Boolean).join(', ') || 'OK';
          steps[steps.length - 1] = {
            label: `Sincronizando ${reader.nome} (${reader.ip_vpn})`,
            status: photoErrs.length > 0 ? 'warning' : 'done',
            detail,
          };

          if (photoErrs.length > 0) {
            // Extrair nomes dos erros (formato "Nome do Usuário: motivo")
            const rejectedNomes = photoErrs.map((e: string) => e.split(':')[0].trim().toLowerCase());
            setPhotoRejectedNames(prev => new Set([...prev, ...rejectedNomes]));
            photoErrs.forEach((e: string) => toast.warning(`Foto rejeitada — ${e}`, { duration: 8000 }));
          }
        } catch (err: any) {
          errors.push(`${reader.nome}: ${err.message}`);
          steps[steps.length - 1] = { label: `Sincronizando ${reader.nome} (${reader.ip_vpn})`, status: 'error', detail: err.message };
        }
        setSyncProgress(35 + Math.round(((i + 1) / onlineReaders.length) * 60));
        setStep(steps);
      }

      setSyncProgress(100);
      setLastSyncResult({ synced: totalSynced, readers: onlineReaders.length });

      if (totalSynced > 0 || totalDeleted > 0) {
        const parts = [];
        if (totalSynced > 0) parts.push(`${totalSynced} usuário(s) sincronizado(s)`);
        if (totalDeleted > 0) parts.push(`${totalDeleted} removido(s) dos leitores`);
        toast.success(parts.join(', ') + '!');
      }
      if (errors.length > 0) errors.forEach(e => toast.error(e, { duration: 6000 }));
      if (totalSynced === 0 && totalDeleted === 0 && errors.length === 0) toast.info("Leitores já atualizados.");

    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + err.message);
    } finally {
      setSyncing(false);

    }

  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários de Acesso</h1>
          <p className="text-muted-foreground">Gerencie os usuários do controle facial</p>
        </div>
        <div className="flex gap-2">
          <UserpSyncButton tipo="usuarios" onSuccess={() => queryClient.invalidateQueries({ queryKey: ["usuarios"] })} />
          <Button variant="outline" onClick={syncUsersToReaders} disabled={syncing}>
            {syncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Sincronizar com Leitores
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px] rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Usuários ativos</p>
          <p className="text-2xl font-bold">{items?.length ?? "—"}</p>
        </div>
        <div className="flex-1 min-w-[160px] rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Sincronizados com leitores</p>
          <p className="text-2xl font-bold">
            {lastSyncResult !== null ? lastSyncResult.synced : <span className="text-muted-foreground text-base">—</span>}
          </p>
          {lastSyncResult !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">{lastSyncResult.readers} leitor(es) atualizado(s)</p>
          )}
        </div>
      </div>

      {/* Aviso se credenciais não configuradas */}
      {(!userpEmail || !userpSenha) && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Credenciais Userp não configuradas.
              <a href="/configuracoes" className="ml-1 underline font-medium">Configurar agora →</a>
            </p>
          </CardContent>
        </Card>
      )}



      {/* Painel de progresso de sincronização */}
      {syncSteps.length > 0 && (
        <Card className="border-primary/20 bg-muted/30">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Sincronização em andamento...</span>
              <span className="text-xs text-muted-foreground">{syncProgress}%</span>
            </div>
            <Progress value={syncProgress} className="h-2" />
            <div className="space-y-1.5 mt-2">
              {syncSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {step.status === 'running' && <Loader2 className="h-4 w-4 mt-0.5 text-primary animate-spin shrink-0" />}
                  {step.status === 'done' && <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />}
                  {step.status === 'error' && <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />}
                  {step.status === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />}
                  {step.status === 'pending' && <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <div>
                    <span className={step.status === 'error' ? 'text-destructive' : step.status === 'warning' ? 'text-amber-700 dark:text-amber-400' : step.status === 'done' ? 'text-foreground' : 'text-muted-foreground'}>
                      {step.label}
                    </span>
                    {step.detail && (
                      <span className="ml-2 text-xs text-muted-foreground">— {step.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou matrícula..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterEmp} onValueChange={(v) => { setFilterEmp(v); setFilterAcesso("all"); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os empreendimentos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os empreendimentos</SelectItem>
            {empreendimentosOpts?.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAcesso} onValueChange={setFilterAcesso}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os acessos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os acessos</SelectItem>
            {acessosFiltradosPorEmp.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nome}{filterEmp === "all" ? ` — ${(a.empreendimentos as any)?.nome ?? ""}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "active" | "deleted" | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="deleted">Excluídos por sync</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Acessos</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>
              ) : (
                filtered?.map((item) => {
                  const fotoRejeitada = photoRejectedNames.has(item.nome?.toLowerCase());
                  const excluido = item.deleted_by_sync === true;
                  return (
                  <TableRow key={item.id} className={excluido ? 'bg-red-50/60 dark:bg-red-950/20 opacity-70' : fotoRejeitada ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                    <TableCell className="p-2">
                      <div className="relative inline-block">
                        {item.foto_base64 ? (
                          <img src={item.foto_base64} alt={item.nome} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium">
                            {item.nome?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {fotoRejeitada && (
                          <span className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5" title="Foto rejeitada pelo leitor">
                            <AlertTriangle className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={excluido ? 'line-through text-muted-foreground' : ''}>{item.nome}</span>
                        {excluido && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded px-1.5 py-0.5">
                            <UserX className="h-3 w-3" /> excluído por sync
                          </span>
                        )}
                        {fotoRejeitada && !excluido && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 rounded px-1.5 py-0.5">
                            <AlertTriangle className="h-3 w-3" /> foto rejeitada
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.matricula || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.acessos?.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                        {item.acessos?.map((a: any) => (
                          <Badge key={a.id} variant="secondary" className="text-xs">
                            {a.nome}
                            {a.data_inicio && <span className="ml-1 text-muted-foreground">{formatDate(a.data_inicio)}→{formatDate(a.data_fim)}</span>}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Atualizar foto" onClick={() => openFotoDialog(item)}>
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Atualizar do Userp" onClick={() => handlePreview(item)}>
                          <ArrowDownToLine className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Dialog — Atualizar Foto */}
      <Dialog open={fotoOpen} onOpenChange={(o) => { if (!o) { setFotoOpen(false); setFotoResult(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atualizar Foto — {fotoTargetNome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <WebcamCapture onCapture={(b64) => { setFotoBase64(b64); setFotoResult(null); }} currentImage={fotoBase64} />

            <Button className="w-full" disabled={fotoSaving || !fotoBase64} onClick={handleSaveFoto}>
              {fotoSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Foto"}
            </Button>

            {/* Resultado */}
            {fotoResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-green-700 dark:text-green-400">Foto salva localmente</span>
                </div>
                {fotoResult.userpStatus === 'sending' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Enviando ao Userp...</span>
                  </div>
                )}
                {fotoResult.userpStatus === 'ok' && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-green-700 dark:text-green-400">{fotoResult.userpMsg}</span>
                  </div>
                )}
                {fotoResult.userpStatus === 'error' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      <span className="text-destructive">Erro ao enviar ao Userp: {fotoResult.userpMsg}</span>
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" disabled={fotoSaving}
                      onClick={async () => {
                        setFotoResult(r => r ? { ...r, userpStatus: 'sending' } : r);
                        try {
                          await api.post(`/usuarios/${fotoTargetId}/sync-foto`, { email: userpEmail, senha: userpSenha, userp_base_url: getUserpBaseUrl() });
                          setFotoResult(r => r ? { ...r, userpStatus: 'ok', userpMsg: 'Foto enviada ao Userp com sucesso!' } : r);
                        } catch (e: any) {
                          setFotoResult(r => r ? { ...r, userpStatus: 'error', userpMsg: e.message } : r);
                        }
                      }}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {fotoResult.userpStatus === 'skipped' && fotoResult.userpMsg && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                    <Upload className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{fotoResult.userpMsg}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Preview comparação USERP x SISTEMA */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) { setPreviewOpen(false); setPreviewItem(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparação — Userp vs Sistema Acessos</DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Consultando API Userp...</span>
            </div>
          ) : previewItem ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Coluna USERP */}
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3">USERP</h3>
                    <dl className="space-y-2 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Nome</dt><dd className="font-medium">{previewItem.userp.nome}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Telefone</dt><dd>{previewItem.userp.fone || "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Empreendimento</dt><dd>{previewItem.userp.empreendimento_nome || "—"}</dd></div>
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Acessos ({(previewItem.userp.unidades_acesso || []).length})</dt>
                        <dd>
                          {previewItem.userp.unidades_acesso?.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {previewItem.userp.unidades_acesso.map((ua: any) => (
                                <span key={ua.unidade_acesso_id} className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded px-1.5 py-0.5">
                                  <span className="font-mono text-blue-500">#{ua.unidade_acesso_id}</span> {ua.unidade_acesso_nome}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Nenhuma área de acesso vinculada</span>
                          )}
                        </dd>
                      </div>
                      <div><dt className="text-xs text-muted-foreground">Vigência início</dt><dd>{previewItem.userp.vigencia_inicio ? formatDate(previewItem.userp.vigencia_inicio) : "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Vigência fim</dt><dd>{previewItem.userp.vigencia_fim ? formatDate(previewItem.userp.vigencia_fim) : "—"}</dd></div>
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Foto</dt>
                        <dd>
                          {previewItem.userp.foto_url ? (() => {
                            const raw: string = previewItem.userp.foto_url;
                            // base64 pura: JPEG começa com /9j/ ou iVBO (PNG), ou já tem prefixo data:
                            const isBase64 = raw.startsWith('/9j/') || raw.startsWith('iVBO') || raw.startsWith('data:image');
                            const src = isBase64
                              ? (raw.startsWith('data:image') ? raw : `data:image/jpeg;base64,${raw}`)
                              : raw.startsWith('http')
                                ? raw
                                : `${getUserpBaseUrl()}/${raw.replace(/^\//, '')}`;
                            return (
                              <img
                                src={src}
                                alt="Foto Userp"
                                className="w-24 h-24 rounded-lg object-cover border"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            );
                          })() : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3 w-3" />Sem foto</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Coluna SISTEMA ACESSOS */}
                <div className="space-y-3">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-foreground mb-3">SISTEMA ACESSOS</h3>
                    <dl className="space-y-2 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Nome</dt><dd className="font-medium">{previewItem.local.nome}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Matrícula</dt><dd>{previewItem.local.matricula || "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Telefone</dt><dd>{previewItem.local.fone || "—"}</dd></div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Acessos vinculados</dt>
                        <dd className="mt-1">
                          {previewItem.local.acessos?.length === 0
                            ? <span className="text-muted-foreground text-xs">Nenhum</span>
                            : previewItem.local.acessos.map((a: any) => (
                              <Badge key={a.id} variant="secondary" className="text-xs mr-1 mb-1">
                                {a.nome}{a.empreendimento ? ` — ${a.empreendimento}` : ""}
                              </Badge>
                            ))}
                        </dd>
                      </div>
                      <div><dt className="text-xs text-muted-foreground">Vigência início</dt><dd>{previewItem.local.vigencia_inicio ? formatDate(previewItem.local.vigencia_inicio) : "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Vigência fim</dt><dd>{previewItem.local.vigencia_fim ? formatDate(previewItem.local.vigencia_fim) : "—"}</dd></div>
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Foto</dt>
                        <dd>
                          {previewItem.local_foto_base64 ? (
                            <img
                              src={previewItem.local_foto_base64}
                              alt="Foto local"
                              className="w-24 h-24 rounded-lg object-cover border"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3 w-3" />Sem foto</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
                <strong>O que será atualizado:</strong> nome, telefone, vigência e acesso vinculado.{previewItem.userp.foto_url ? " A foto do Userp também será importada." : " Foto local será mantida (Userp não tem foto)."}
              </div>

              <Button className="w-full" disabled={applyLoading} onClick={handleApply}>
                {applyLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Atualizando...</> : <><ArrowDownToLine className="h-4 w-4 mr-2" />Aplicar atualização do Userp</>}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
