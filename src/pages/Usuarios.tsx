import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Plus, Pencil, Trash2, Search, RefreshCw, Upload } from "lucide-react";

import { toast } from "sonner";

import { format } from "date-fns";

import { WebcamCapture } from "@/components/WebcamCapture";



export default function Usuarios() {

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [nome, setNome] = useState("");

  const [acessoId, setAcessoId] = useState("");

  const [dataInicio, setDataInicio] = useState("");

  const [dataFim, setDataFim] = useState("");

  const [fotoBase64, setFotoBase64] = useState("");

  const [syncing, setSyncing] = useState(false);

  const queryClient = useQueryClient();



  const { data: acessos } = useQuery({

    queryKey: ["acessos"],

    queryFn: async () => api.get<any[]>("/acessos"),

  });



  const { data: items, isLoading } = useQuery({

    queryKey: ["usuarios"],

    queryFn: async () => api.get<any[]>("/usuarios"),

  });



  const upsert = useMutation({

    mutationFn: async () => {

      const payload = {

        nome,

        acesso_id: acessoId,

        data_inicio: dataInicio || null,

        data_fim: dataFim || null,

        foto_base64: fotoBase64 || null,

      };

      if (editId) {

        await api.put(`/usuarios/${editId}`, payload);

      } else {

        await api.post("/usuarios", payload);

      }

    },

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["usuarios"] });

      toast.success(editId ? "Atualizado!" : "Criado!");

      resetForm();

    },

    onError: (e) => toast.error(e.message),

  });



  const remove = useMutation({

    mutationFn: async (id: string) => api.delete(`/usuarios/${id}`),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["usuarios"] });

      toast.success("Removido!");

    },

    onError: (e) => toast.error(e.message),

  });



  const resetForm = () => {

    setNome(""); setAcessoId(""); setDataInicio(""); setDataFim(""); setFotoBase64("");

    setEditId(null); setOpen(false);

  };



  const startEdit = (item: any) => {

    setEditId(item.id); setNome(item.nome); setAcessoId(item.acesso_id);

    setDataInicio(item.data_inicio ? item.data_inicio.slice(0, 16) : "");

    setDataFim(item.data_fim ? item.data_fim.slice(0, 16) : "");

    setFotoBase64(item.foto_base64 || "");

    setOpen(true);

  };



  const filtered = items?.filter((i) =>

    i.nome.toLowerCase().includes(search.toLowerCase())

  );



  const formatDate = (d: string | null) => {

    if (!d) return "—";

    try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }

  };



  const syncUsersToReaders = async () => {

    setSyncing(true);

    try {

      // Buscar equipamentos online

      const equipamentos = await api.get<any[]>("/equipamentos");

      if (!equipamentos?.length) {

        toast.error("Nenhum equipamento cadastrado");

        return;

      }



      // Buscar status VPN para saber quais estão online

      const vpnData = await api.get<any>('/vpn/clients');

      const onlineIps = new Set((vpnData?.clients || []).map((c: any) => c.ip_vpn));



      const onlineReaders = equipamentos.filter(eq => onlineIps.has(eq.ip_vpn));



      if (onlineReaders.length === 0) {

        toast.error("Nenhum leitor online no momento");

        return;

      }



      // Buscar todos os usuários

      const usuarios = await api.get<any[]>("/usuarios");



      let successCount = 0;

      let errorCount = 0;



      for (const user of (usuarios || [])) {

        const readersForUser = onlineReaders.filter(r => r.acesso_id === user.acesso_id);

        for (const reader of readersForUser) {

          try {

            await api.post('/vpn/sync-user', {

              reader_ip: reader.ip_vpn,

              user: { id: user.id, name: user.nome, photo: user.foto_base64 },

            });

            successCount++;

          } catch {

            errorCount++;

          }

        }

      }



      if (successCount > 0) {

        toast.success(`${successCount} usuário(s) sincronizado(s) com sucesso!`);

      }

      if (errorCount > 0) {

        toast.error(`${errorCount} erro(s) durante a sincronização`);

      }

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

          <Button variant="outline" onClick={syncUsersToReaders} disabled={syncing}>

            {syncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}

            Sincronizar com Leitores

          </Button>

          <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>

          <DialogTrigger asChild>

            <Button><Plus className="h-4 w-4 mr-2" /> Novo</Button>

          </DialogTrigger>

          <DialogContent>

            <DialogHeader>

              <DialogTitle>{editId ? "Editar" : "Novo"} Usuário</DialogTitle>

            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">

              <div className="space-y-2">

                <Label>Nome</Label>

                <Input value={nome} onChange={(e) => setNome(e.target.value)} required />

              </div>

              <div className="space-y-2">

                <Label>Acesso</Label>

                <Select value={acessoId} onValueChange={setAcessoId} required>

                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>

                  <SelectContent>

                    {acessos?.map((a) => (

                      <SelectItem key={a.id} value={a.id}>

                        {a.nome} — {(a.empreendimentos as any)?.nome}

                      </SelectItem>

                    ))}

                  </SelectContent>

                </Select>

              </div>

              <div className="space-y-2">

                <Label>Foto</Label>

                <WebcamCapture onCapture={setFotoBase64} currentImage={fotoBase64} />

              </div>

              <div className="grid grid-cols-2 gap-4">

                <div className="space-y-2">

                  <Label>Início do Acesso</Label>

                  <Input type="datetime-local" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />

                </div>

                <div className="space-y-2">

                  <Label>Fim do Acesso</Label>

                  <Input type="datetime-local" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />

                </div>

              </div>

              <Button type="submit" className="w-full" disabled={upsert.isPending}>

                {upsert.isPending ? "Salvando..." : "Salvar"}

              </Button>

            </form>

          </DialogContent>

          </Dialog>

        </div>

      </div>



      <div className="relative max-w-sm">

        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />

      </div>



      <Card>

        <CardContent className="p-0">

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>Nome</TableHead>

                <TableHead>Acesso</TableHead>

                <TableHead>Início</TableHead>

                <TableHead>Fim</TableHead>

                <TableHead className="w-24">Ações</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {isLoading ? (

                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>

              ) : filtered?.length === 0 ? (

                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>

              ) : (

                filtered?.map((item) => (

                  <TableRow key={item.id}>

                    <TableCell className="font-medium">{item.nome}</TableCell>

                    <TableCell>{(item.acessos as any)?.nome}</TableCell>

                    <TableCell>{formatDate(item.data_inicio)}</TableCell>

                    <TableCell>{formatDate(item.data_fim)}</TableCell>

                    <TableCell>

                      <div className="flex gap-1">

                        <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>

                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(item.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>

                      </div>

                    </TableCell>

                  </TableRow>

                ))

              )}

            </TableBody>

          </Table>

        </CardContent>

      </Card>

    </div>

  );

}

