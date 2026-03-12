import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Search, Camera, Upload, Loader2, CheckCircle2, UserRound,
  RefreshCw, Plus, Trash2, Link, Unlink, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { getUserpCredentials, getUserpBaseUrl } from "@/pages/Configuracoes";

interface FuncLocal {
  id: string;
  nome: string;
  userp_id: number | null;
  tem_foto: boolean;
  created_at: string;
  acessos: { id: string; nome: string; empreendimento: string }[];
}

interface AcessoLocal {
  id: string;
  nome: string;
  empreendimento: string;
}

const PAGE_SIZE = 100;

export default function Funcionarios() {
  const queryClient = useQueryClient();

  // ---- Importação do Userp ----
  const [importSearch, setImportSearch] = useState("");
  const [importStart, setImportStart] = useState(0);
  const [importResult, setImportResult] = useState<{ total: number; has_more: boolean; next_start: number | null; items: { funcionario_id: number; funcionario_nome: string }[] } | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const importTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [importingIds, setImportingIds] = useState<Set<number>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSearchInput, setImportSearchInput] = useState("");

  // ---- Acessos ----
  const [vinculoTarget, setVinculoTarget] = useState<FuncLocal | null>(null);
  const [vinculoDialogOpen, setVinculoDialogOpen] = useState(false);
  const [acessoSelecionado, setAcessoSelecionado] = useState("");

  // ---- Foto ----
  const [fotoTarget, setFotoTarget] = useState<FuncLocal | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false);
  const [sendingFoto, setSendingFoto] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Sync com leitores ----
  const [syncingReaders, setSyncingReaders] = useState(false);

  // ---- Lista local ----
  const { data: funcionarios, isLoading } = useQuery<FuncLocal[]>({
    queryKey: ["funcionarios-local"],
    queryFn: () => api.get("/funcionarios"),
  });

  const { data: acessosDisponiveis } = useQuery<AcessoLocal[]>({
    queryKey: ["acessos-para-vincular"],
    queryFn: async () => {
      const rows = await api.get<any[]>("/acessos");
      return rows.map((a: any) => ({ id: a.id, nome: a.nome, empreendimento: a.empreendimentos?.nome || "" }));
    },
  });

  // ---- Equipamentos (leitores online) ----
  const { data: equipamentos } = useQuery<any[]>({
    queryKey: ["equipamentos-sync"],
    queryFn: () => api.get("/equipamentos"),
  });

  // ---- Mutations ----
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/funcionarios/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["funcionarios-local"] }); toast.success("Funcionário removido!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const vincularMutation = useMutation({
    mutationFn: ({ id, acesso_id }: { id: string; acesso_id: string }) =>
      api.post(`/funcionarios/${id}/acessos`, { acesso_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funcionarios-local"] });
      toast.success("Acesso vinculado!");
      setAcessoSelecionado("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const desvincularMutation = useMutation({
    mutationFn: ({ id, acesso_id }: { id: string; acesso_id: string }) =>
      api.delete(`/funcionarios/${id}/acessos/${acesso_id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["funcionarios-local"] }); toast.success("Acesso desvinculado!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const salvarFotoMutation = useMutation({
    mutationFn: ({ id, foto_base64 }: { id: string; foto_base64: string }) =>
      api.put(`/funcionarios/${id}/foto`, { foto_base64 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["funcionarios-local"] }),
  });

  // ---- Importação do Userp ----
  const buscarNoUserp = async (overrideStart = 0, overrideNome?: string) => {
    const creds = getUserpCredentials();
    if (!creds.email || !creds.senha) { toast.error("Credenciais Userp não configuradas."); return; }
    const nome = overrideNome !== undefined ? overrideNome : importSearch;
    setLoadingImport(true);
    setImportProgress(0);
    let cur = 0;
    importTimerRef.current = setInterval(() => { cur += cur < 70 ? 4 : 0.5; setImportProgress(Math.min(cur, 92)); }, 300);
    try {
      const data = await api.post<any>("/userp/sync/funcionarios", {
        email: creds.email, senha: creds.senha, userp_base_url: getUserpBaseUrl(),
        start: overrideStart, limit: PAGE_SIZE, nome: nome || undefined,
      });
      setImportResult(data);
      setImportStart(overrideStart);
    } catch (err: any) {
      toast.error("Erro ao buscar no Userp: " + err.message);
    } finally {
      if (importTimerRef.current) clearInterval(importTimerRef.current);
      setImportProgress(100);
      setTimeout(() => setImportProgress(0), 600);
      setLoadingImport(false);
    }
  };

  const importarFuncionario = async (f: { funcionario_id: number; funcionario_nome: string }) => {
    setImportingIds(prev => new Set(prev).add(f.funcionario_id));
    try {
      await api.post("/funcionarios/import", { userp_id: f.funcionario_id, nome: f.funcionario_nome });
      queryClient.invalidateQueries({ queryKey: ["funcionarios-local"] });
      toast.success(`${f.funcionario_nome} importado!`);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setImportingIds(prev => { const s = new Set(prev); s.delete(f.funcionario_id); return s; });
    }
  };

  const jaImportado = (userp_id: number) =>
    funcionarios?.some(f => f.userp_id === userp_id) ?? false;

  // ---- Sync com leitores ----
  const syncComLeitores = async () => {
    if (!equipamentos?.length) { toast.error("Nenhum equipamento cadastrado."); return; }
    const leitoresOnline = equipamentos.filter(e => e.ip_vpn && e.acesso_id);
    if (!leitoresOnline.length) { toast.error("Nenhum leitor com IP VPN e acesso configurado."); return; }
    setSyncingReaders(true);
    let ok = 0, err = 0;
    for (const eq of leitoresOnline) {
      try {
        await api.post("/vpn/sync-funcionarios", { reader_ip: eq.ip_vpn, acesso_id: eq.acesso_id });
        ok++;
      } catch { err++; }
    }
    setSyncingReaders(false);
    toast.success(`Sincronização iniciada: ${ok} leitor(es)${err > 0 ? `, ${err} erro(s)` : ""}`);
  };

  // ---- Foto ----
  const closeFotoDialog = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setFotoDialogOpen(false);
    setFotoTarget(null);
    setFotoPreview(null);
    setFotoBase64(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; setFotoPreview(r); setFotoBase64(r); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch { toast.error("Não foi possível acessar a câmera."); }
  };

  const capturarFoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setFotoPreview(dataUrl); setFotoBase64(dataUrl);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const salvarFotoLocal = async () => {
    if (!fotoBase64 || !fotoTarget) return;
    setSendingFoto(true);
    try {
      // Salvar local
      await salvarFotoMutation.mutateAsync({ id: fotoTarget.id, foto_base64: fotoBase64 });
      // Enviar ao Userp se tiver userp_id
      if (fotoTarget.userp_id) {
        const creds = getUserpCredentials();
        if (creds.email && creds.senha) {
          await api.post("/userp/sync/funcionarios/sync-foto", {
            email: creds.email, senha: creds.senha, userp_base_url: getUserpBaseUrl(),
            funcionario_id: fotoTarget.userp_id, foto_base64: fotoBase64,
          });
        }
      }
      toast.success("Foto salva!");
      closeFotoDialog();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSendingFoto(false);
    }
  };

  const acessosVinculadosIds = new Set(vinculoTarget?.acessos.map(a => a.id) ?? []);
  const acessosParaVincular = acessosDisponiveis?.filter(a => !acessosVinculadosIds.has(a.id)) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funcionários</h1>
          <p className="text-muted-foreground text-sm">{funcionarios?.length ?? 0} funcionário(s) cadastrado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportResult(null); setImportSearchInput(""); setImportDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Importar do Userp
          </Button>
          <Button onClick={syncComLeitores} disabled={syncingReaders}>
            {syncingReaders ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar com Leitores
          </Button>
        </div>
      </div>

      {/* Tabela principal */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Acessos</TableHead>
                <TableHead className="w-36">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !funcionarios?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum funcionário. Use "Importar do Userp".</TableCell></TableRow>
              ) : funcionarios.map(f => (
                <TableRow key={f.id}>
                  <TableCell>
                    {f.tem_foto ? (
                      <div className="w-8 h-8 rounded-full bg-muted overflow-hidden cursor-pointer"
                        onClick={() => { setFotoTarget(f); setFotoPreview(null); setFotoBase64(null); setFotoDialogOpen(true); }}>
                        <FotoThumb id={f.id} />
                      </div>
                    ) : (
                      <button className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80"
                        onClick={() => { setFotoTarget(f); setFotoPreview(null); setFotoBase64(null); setFotoDialogOpen(true); }}>
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                      {f.nome}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {f.userp_id ? `FUN${f.userp_id}` : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {f.acessos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhum acesso</span>
                      ) : f.acessos.map(a => (
                        <Badge key={a.id} variant="secondary" className="text-xs gap-1">
                          {a.empreendimento ? `${a.empreendimento} — ` : ""}{a.nome}
                          <button onClick={() => desvincularMutation.mutate({ id: f.id, acesso_id: a.id })}
                            className="ml-0.5 text-muted-foreground hover:text-destructive">
                            <Unlink className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" title="Vincular acesso"
                        onClick={() => { setVinculoTarget(f); setAcessoSelecionado(""); setVinculoDialogOpen(true); }}>
                        <Link className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Foto"
                        onClick={() => { setFotoTarget(f); setFotoPreview(null); setFotoBase64(null); setFotoDialogOpen(true); }}>
                        <Camera className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Remover" className="text-destructive"
                        onClick={() => { if (confirm(`Remover "${f.nome}"?`)) deleteMutation.mutate(f.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog importar do Userp */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Funcionários do Userp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Buscar por nome..." value={importSearchInput}
                onChange={e => setImportSearchInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && buscarNoUserp(0, importSearchInput)} />
              <Button onClick={() => { setImportSearch(importSearchInput); buscarNoUserp(0, importSearchInput); }} disabled={loadingImport}>
                {loadingImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {loadingImport && <Progress value={importProgress} className="h-1.5" />}
            {importResult && (
              <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
                {importResult.items.length === 0 ? (
                  <p className="text-center py-4 text-sm text-muted-foreground">Nenhum resultado</p>
                ) : importResult.items.map(f => (
                  <div key={f.funcionario_id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">{f.funcionario_nome}</span>
                      <Badge variant="outline" className="ml-2 font-mono text-xs">FUN{f.funcionario_id}</Badge>
                    </div>
                    {jaImportado(f.funcionario_id) ? (
                      <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Importado</Badge>
                    ) : (
                      <Button size="sm" variant="outline" disabled={importingIds.has(f.funcionario_id)}
                        onClick={() => importarFuncionario(f)}>
                        {importingIds.has(f.funcionario_id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        <span className="ml-1">Importar</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {importResult && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{importResult.total} total</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={importStart === 0 || loadingImport}
                    onClick={() => buscarNoUserp(Math.max(0, importStart - PAGE_SIZE), importSearchInput)}>← Anterior</Button>
                  <Button size="sm" variant="ghost" disabled={!importResult.has_more || loadingImport}
                    onClick={() => buscarNoUserp(importResult.next_start!, importSearchInput)}>Próxima →</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog vincular acesso */}
      <Dialog open={vinculoDialogOpen} onOpenChange={setVinculoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular Acesso — {vinculoTarget?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vinculoTarget?.acessos.length ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Acessos atuais</p>
                <div className="flex flex-wrap gap-1.5">
                  {vinculoTarget.acessos.map(a => (
                    <Badge key={a.id} variant="secondary" className="gap-1.5">
                      {a.empreendimento ? `${a.empreendimento} — ` : ""}{a.nome}
                      <button onClick={() => desvincularMutation.mutate({ id: vinculoTarget.id, acesso_id: a.id })}
                        className="text-muted-foreground hover:text-destructive">
                        <Unlink className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Adicionar acesso</p>
              <Select value={acessoSelecionado} onValueChange={setAcessoSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um acesso..." />
                </SelectTrigger>
                <SelectContent>
                  {acessosParaVincular.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.empreendimento ? `${a.empreendimento} — ` : ""}{a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full mt-1" disabled={!acessoSelecionado || vincularMutation.isPending}
                onClick={() => vinculoTarget && vincularMutation.mutate({ id: vinculoTarget.id, acesso_id: acessoSelecionado })}>
                {vincularMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link className="h-4 w-4 mr-2" />}
                Vincular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog foto */}
      <Dialog open={fotoDialogOpen} onOpenChange={open => !open && closeFotoDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Foto — {fotoTarget?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              {cameraOpen ? (
                <div className="w-full max-w-xs aspect-square rounded-lg overflow-hidden bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
              ) : fotoPreview ? (
                <img src={fotoPreview} alt="preview" className="w-48 h-48 object-cover rounded-lg border" />
              ) : (
                <div className="w-48 h-48 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Camera className="h-10 w-10 opacity-30" />
                  <span className="text-xs">Nenhuma foto</span>
                </div>
              )}
            </div>
            {cameraOpen ? (
              <div className="flex gap-2 justify-center">
                <Button onClick={capturarFoto} className="gap-2"><Camera className="h-4 w-4" /> Capturar</Button>
                <Button variant="outline" onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); setCameraOpen(false); }}>Cancelar</Button>
              </div>
            ) : (
              <div className="flex gap-2 justify-center">
                <Button variant="outline" className="gap-2" onClick={startCamera}><Camera className="h-4 w-4" /> Câmera</Button>
                <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> Arquivo</Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            )}
            {fotoPreview && !cameraOpen && (
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setFotoPreview(null); setFotoBase64(null); }}>Trocar</Button>
                <Button onClick={salvarFotoLocal} disabled={sendingFoto} className="gap-2">
                  {sendingFoto ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4" /> Salvar</>}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente auxiliar para miniatura de foto (carrega sob demanda)
function FotoThumb({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["func-foto-thumb", id],
    queryFn: () => api.get<{ foto_base64: string }>(`/funcionarios/${id}/foto`),
    staleTime: 5 * 60 * 1000,
  });
  if (!data?.foto_base64) return <UserRound className="h-4 w-4 m-auto text-muted-foreground" />;
  return <img src={data.foto_base64} alt="foto" className="w-full h-full object-cover" />;
}
