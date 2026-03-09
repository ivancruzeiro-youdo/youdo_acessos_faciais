import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, DoorOpen, Cpu, Users } from "lucide-react";

export default function Dashboard() {
  const { data: empreendimentos } = useQuery({
    queryKey: ["empreendimentos-count"],
    queryFn: async () => {
      const { count } = await supabase.from("empreendimentos").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: acessos } = useQuery({
    queryKey: ["acessos-count"],
    queryFn: async () => {
      const { count } = await supabase.from("acessos").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: equipamentos } = useQuery({
    queryKey: ["equipamentos-count"],
    queryFn: async () => {
      const { count } = await supabase.from("equipamentos").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: usuarios } = useQuery({
    queryKey: ["usuarios-count"],
    queryFn: async () => {
      const { count } = await supabase.from("usuarios").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const stats = [
    { title: "Empreendimentos", value: empreendimentos ?? 0, icon: Building2, color: "text-primary" },
    { title: "Acessos", value: acessos ?? 0, icon: DoorOpen, color: "text-primary" },
    { title: "Equipamentos", value: equipamentos ?? 0, icon: Cpu, color: "text-primary" },
    { title: "Usuários", value: usuarios ?? 0, icon: Users, color: "text-primary" },
  ];

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
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
