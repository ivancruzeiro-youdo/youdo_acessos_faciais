import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, KeyRound, Eye, EyeOff, UserCog } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

export default function GerenciarUsuarios() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Criar usuário
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  // Resetar senha
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [showResetPass, setShowResetPass] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["system-users"],
    queryFn: () => api.get<any[]>("/auth/users"),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/auth/register", { email: newEmail, password: newPass, display_name: newName || newEmail }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-users"] });
      toast.success("Usuário criado!");
      setCreateOpen(false);
      setNewEmail(""); setNewName(""); setNewPass("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-users"] });
      toast.success("Usuário removido!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/auth/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-users"] });
      toast.success("Perfil atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post(`/auth/users/${resetTarget!.id}/reset-password`, { password: resetPass }),
    onSuccess: () => {
      toast.success("Senha redefinida!");
      setResetOpen(false);
      setResetPass(""); setResetTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmDelete = (user: any) => {
    if (!confirm(`Remover o usuário "${user.email}"? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate(user.user_id);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários do Sistema</h1>
          <p className="text-muted-foreground">Gerencie quem pode acessar o painel em acessos.youdobrasil.com.br</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : users?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum usuário</TableCell></TableRow>
              ) : (
                users?.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
                        {u.display_name}
                        {u.user_id === currentUser?.id && (
                          <Badge variant="outline" className="text-xs">você</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={(u.roles as string[])[0] || 'operador'}
                        onValueChange={(role) => roleMutation.mutate({ id: u.user_id, role })}
                        disabled={roleMutation.isPending}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operador">Operador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.created_at ? format(new Date(u.created_at), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon"
                          title="Redefinir senha"
                          onClick={() => { setResetTarget({ id: u.user_id, email: u.email }); setResetPass(""); setResetOpen(true); }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive"
                          title="Remover usuário"
                          disabled={u.user_id === currentUser?.id}
                          onClick={() => confirmDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog criar usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Ex: João Silva" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="usuario@dominio.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showNewPass ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  required minLength={6}
                  className="pr-10"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPass(v => !v)} tabIndex={-1}>
                  {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || !newEmail || newPass.length < 6}>
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog resetar senha */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{resetTarget?.email}</p>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); resetMutation.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <div className="relative">
                <Input
                  type={showResetPass ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={resetPass}
                  onChange={e => setResetPass(e.target.value)}
                  required minLength={6}
                  className="pr-10"
                  autoFocus
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowResetPass(v => !v)} tabIndex={-1}>
                  {showResetPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={resetMutation.isPending || resetPass.length < 6}>
                {resetMutation.isPending ? "Salvando..." : "Redefinir"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
