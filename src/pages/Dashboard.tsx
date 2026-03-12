import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, DoorOpen, Cpu, Users, ImageOff, Image } from "lucide-react";

export default function Dashboard() {
  const { data: empreendimentosList } = useQuery({
    queryKey: ["empreendimentos"],
    queryFn: async () => api.get<any[]>("/empreendimentos"),
  });

  const { data: acessosList } = useQuery({
    queryKey: ["acessos"],
    queryFn: async () => api.get<any[]>("/acessos"),
  });

  const { data: equipamentosList } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => api.get<any[]>("/equipamentos"),
  });

  const { data: usuariosList } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => api.get<any[]>("/usuarios"),
  });

  const stats = [
    { title: "Empreendimentos", value: empreendimentosList?.length ?? 0, icon: Building2 },
    { title: "Acessos", value: acessosList?.length ?? 0, icon: DoorOpen },
    { title: "Equipamentos", value: equipamentosList?.length ?? 0, icon: Cpu },
    { title: "Usuários", value: usuariosList?.length ?? 0, icon: Users },
  ];

  // Montar tabela: usuários por empreendimento
  const porEmpreendimento = (empreendimentosList || []).map((emp) => {
    // acessos deste empreendimento
    const acessosEmp = (acessosList || []).filter((a) => a.empreendimento_id === emp.id);
    const acessoIds = new Set(acessosEmp.map((a: any) => a.id));

    // usuários que têm pelo menos um acesso neste empreendimento
    const usuariosEmp = (usuariosList || []).filter((u: any) =>
      u.acessos?.some((a: any) => acessoIds.has(a.id))
    );

    const comFoto = usuariosEmp.filter((u: any) => !!u.foto_base64).length;
    const semFoto = usuariosEmp.length - comFoto;

    return { emp, total: usuariosEmp.length, comFoto, semFoto };
  });

  const semEmpreendimento = (usuariosList || []).filter((u: any) =>
    !u.acessos?.length ||
    u.acessos.every((a: any) =>
      !(acessosList || []).find((o: any) => o.id === a.id)
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema de controle de acesso</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Usuários por Empreendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empreendimento</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Com foto</TableHead>
                <TableHead className="text-center">Sem foto</TableHead>
                <TableHead className="text-center">Cobertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porEmpreendimento.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : (
                <>
                  {porEmpreendimento.map(({ emp, total, comFoto, semFoto }) => {
                    const pct = total > 0 ? Math.round((comFoto / total) * 100) : 0;
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.nome}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{total}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                            <Image className="h-3.5 w-3.5" />{comFoto}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <ImageOff className="h-3.5 w-3.5" />{semFoto}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {semEmpreendimento.length > 0 && (
                    <TableRow>
                      <TableCell className="text-muted-foreground italic">Sem empreendimento</TableCell>
                      <TableCell className="text-center"><Badge variant="outline">{semEmpreendimento.length}</Badge></TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                          <Image className="h-3.5 w-3.5" />{semEmpreendimento.filter((u: any) => !!u.foto_base64).length}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ImageOff className="h-3.5 w-3.5" />{semEmpreendimento.filter((u: any) => !u.foto_base64).length}
                        </span>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
