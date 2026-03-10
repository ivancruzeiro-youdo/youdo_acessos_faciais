import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Plus, Pencil, Trash2, Search } from "lucide-react";

import { toast } from "sonner";



export default function Empreendimentos() {

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [nome, setNome] = useState("");

  const [fase, setFase] = useState("");

  const queryClient = useQueryClient();



  const { data: items, isLoading } = useQuery({

    queryKey: ["empreendimentos"],

    queryFn: async () => api.get<any[]>("/empreendimentos"),

  });



  const upsert = useMutation({

    mutationFn: async () => {

      const payload = { nome, fase: fase || null };

      if (editId) {

        await api.put(`/empreendimentos/${editId}`, payload);

      } else {

        await api.post("/empreendimentos", payload);

      }

    },

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["empreendimentos"] });

      toast.success(editId ? "Atualizado!" : "Criado!");

      resetForm();

    },

    onError: (e) => toast.error(e.message),

  });



  const remove = useMutation({

    mutationFn: async (id: string) => api.delete(`/empreendimentos/${id}`),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["empreendimentos"] });

      toast.success("Removido!");

    },

    onError: (e) => toast.error(e.message),

  });



  const resetForm = () => {

    setNome("");

    setFase("");

    setEditId(null);

    setOpen(false);

  };



  const startEdit = (item: any) => {

    setEditId(item.id);

    setNome(item.nome);

    setFase(item.fase ?? "");

    setOpen(true);

  };



  const filtered = items?.filter((i) =>

    i.nome.toLowerCase().includes(search.toLowerCase()) ||

    (i.fase ?? "").toLowerCase().includes(search.toLowerCase())

  );



  return (

    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-2xl font-bold text-foreground">Empreendimentos</h1>

          <p className="text-muted-foreground">Gerencie seus empreendimentos</p>

        </div>

        <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>

          <DialogTrigger asChild>

            <Button><Plus className="h-4 w-4 mr-2" /> Novo</Button>

          </DialogTrigger>

          <DialogContent>

            <DialogHeader>

              <DialogTitle>{editId ? "Editar" : "Novo"} Empreendimento</DialogTitle>

            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">

              <div className="space-y-2">

                <Label>Nome</Label>

                <Input value={nome} onChange={(e) => setNome(e.target.value)} required />

              </div>

              <div className="space-y-2">

                <Label>Fase (Identificação)</Label>

                <Input value={fase} onChange={(e) => setFase(e.target.value)} placeholder="Ex: Fase 1, Bloco A" />

              </div>

              <Button type="submit" className="w-full" disabled={upsert.isPending}>

                {upsert.isPending ? "Salvando..." : "Salvar"}

              </Button>

            </form>

          </DialogContent>

        </Dialog>

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

                <TableHead>Fase</TableHead>

                <TableHead className="w-24">Ações</TableHead>

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

                    <TableCell>{item.fase || "—"}</TableCell>

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

