import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Search } from "lucide-react";
import { UserpSyncButton } from "@/components/UserpSyncButton";

import { toast } from "sonner";



export default function Acessos() {

  const [search, setSearch] = useState("");

  const [filterEmp, setFilterEmp] = useState("all");

  const [open, setOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [nome, setNome] = useState("");

  const [empreendimentoId, setEmpreendimentoId] = useState("");

  const queryClient = useQueryClient();



  const { data: empreendimentos } = useQuery({

    queryKey: ["empreendimentos"],

    queryFn: async () => api.get<any[]>("/empreendimentos"),

  });



  const { data: items, isLoading } = useQuery({

    queryKey: ["acessos"],

    queryFn: async () => api.get<any[]>("/acessos"),

  });



  const upsert = useMutation({

    mutationFn: async () => {

      if (editId) {

        await api.put(`/acessos/${editId}`, { nome, empreendimento_id: empreendimentoId });

      } else {

        await api.post("/acessos", { nome, empreendimento_id: empreendimentoId });

      }

    },

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["acessos"] });

      toast.success(editId ? "Atualizado!" : "Criado!");

      resetForm();

    },

    onError: (e) => toast.error(e.message),

  });



  const remove = useMutation({

    mutationFn: async (id: string) => api.delete(`/acessos/${id}`),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["acessos"] });

      toast.success("Removido!");

    },

    onError: (e) => toast.error(e.message),

  });



  const resetForm = () => {

    setNome("");

    setEmpreendimentoId("");

    setEditId(null);

    setOpen(false);

  };



  const startEdit = (item: any) => {

    setEditId(item.id);

    setNome(item.nome);

    setEmpreendimentoId(item.empreendimento_id);

    setOpen(true);

  };



  const filtered = items?.filter((i) => {
    const matchSearch = i.nome.toLowerCase().includes(search.toLowerCase());
    const matchEmp = filterEmp === "all" || i.empreendimento_id === filterEmp;
    return matchSearch && matchEmp;
  });



  return (

    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-2xl font-bold text-foreground">Acessos</h1>

          <p className="text-muted-foreground">Gerencie os pontos de acesso</p>

        </div>

        <div className="flex gap-2">
          <UserpSyncButton tipo="unidades" label="Importar Unidades" onSuccess={() => queryClient.invalidateQueries({ queryKey: ["acessos"] })} />
          <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>

          <DialogContent>

            <DialogHeader>

              <DialogTitle>{editId ? "Editar" : "Novo"} Acesso</DialogTitle>

            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">

              <div className="space-y-2">

                <Label>Nome</Label>

                <Input value={nome} onChange={(e) => setNome(e.target.value)} required />

              </div>

              <div className="space-y-2">

                <Label>Empreendimento</Label>

                <Select value={empreendimentoId} onValueChange={setEmpreendimentoId} required>

                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>

                  <SelectContent>

                    {empreendimentos?.map((e) => (

                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>

                    ))}

                  </SelectContent>

                </Select>

              </div>

              <Button type="submit" className="w-full" disabled={upsert.isPending}>

                {upsert.isPending ? "Salvando..." : "Salvar"}

              </Button>

            </form>

          </DialogContent>

        </Dialog>
        </div>

      </div>



      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterEmp} onValueChange={setFilterEmp}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os empreendimentos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os empreendimentos</SelectItem>
            {empreendimentos?.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>



      <Card>

        <CardContent className="p-0">

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>Nome</TableHead>

                <TableHead>Empreendimento</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {isLoading ? (

                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>

              ) : filtered?.length === 0 ? (

                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>

              ) : (

                filtered?.map((item) => (

                  <TableRow key={item.id}>

                    <TableCell className="font-medium">{item.nome}</TableCell>

                    <TableCell>{(item.empreendimentos as any)?.nome}</TableCell>

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

