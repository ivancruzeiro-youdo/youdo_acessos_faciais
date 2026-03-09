import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Wifi, WifiOff, RefreshCw, Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Equipamentos() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [acessoId, setAcessoId] = useState("");
  const [ipVpn, setIpVpn] = useState("");
  const [modelo, setModelo] = useState("");
  const [firmware, setFirmware] = useState("");
  const [serial, setSerial] = useState("");
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[] | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: acessos } = useQuery({
    queryKey: ["acessos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("acessos").select("*, empreendimentos(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*, acessos(nome, empreendimentos(nome))").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: vpnClients } = useQuery({
    queryKey: ["vpn_clients_status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action: "vpn_clients" },
      });
      if (error) return { clients: [] };
      return data;
    },
    refetchInterval: 30000,
    retry: 1,
  });

  const connectedIps = new Set(
    (vpnClients?.clients || []).map((c: any) => c.ip_vpn)
  );

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        nome,
        acesso_id: acessoId,
        ip_vpn: ipVpn,
        modelo: modelo || null,
        firmware: firmware || null,
        serial: serial || null,
      };
      if (editId) {
        const { error } = await supabase.from("equipamentos").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipamentos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipamentos"] });
      toast.success(editId ? "Atualizado!" : "Criado!");
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipamentos"] });
      toast.success("Removido!");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setNome(""); setAcessoId(""); setIpVpn(""); setModelo(""); setFirmware(""); setSerial("");
    setEditId(null); setOpen(false);
  };

  const startEdit = (item: any) => {
    setEditId(item.id); setNome(item.nome); setAcessoId(item.acesso_id);
    setIpVpn(item.ip_vpn); setModelo(item.modelo ?? "");
    setFirmware(item.firmware ?? ""); setSerial(item.serial ?? "");
    setOpen(true);
  };

  const loadFromDevice = async (ip?: string) => {
    const targetIp = ip || ipVpn;
    if (!targetIp) {
      toast.error("Informe o IP VPN primeiro");
      return;
    }
    setLoadingDevice(true);
    try {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action: "device_status", ip: targetIp },
      });
      if (error) throw error;
      if (data?.modelo || data?.model) setModelo(data.modelo || data.model || "");
      if (data?.firmware || data?.fw_version) setFirmware(data.firmware || data.fw_version || "");
      if (data?.serial || data?.serial_number) setSerial(data.serial || data.serial_number || "");
      toast.success("Dados carregados do leitor!");
    } catch (err: any) {
      toast.error("Erro ao consultar leitor: " + err.message);
    } finally {
      setLoadingDevice(false);
    }
  };

  const scanVpn = async () => {
    setScanning(true);
    setScanResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("device-proxy", {
        body: { action: "scan_vpn" },
      });
      if (error) throw error;
      
      const knownIps = items?.map((i) => i.ip_vpn) || [];
      const results = (data?.devices || data || []).map((d: any) => ({
        ...d,
        known: knownIps.includes(d.ip),
      }));
      setScanResults(results);
      setScanOpen(true);
      toast.success(`Varredura concluída: ${results.length} dispositivo(s) encontrado(s)`);
    } catch (err: any) {
      toast.error("Erro na varredura: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  const addFromScan = (device: any) => {
    setIpVpn(device.ip);
    setNome(device.model || device.nome || `Leitor ${device.ip}`);
    setModelo(device.model || "");
    setFirmware(device.firmware || device.fw_version || "");
    setSerial(device.serial || device.serial_number || "");
    setScanOpen(false);
    setOpen(true);
  };

  const filtered = items?.filter((i) =>
    i.nome.toLowerCase().includes(search.toLowerCase()) ||
    i.ip_vpn.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipamentos</h1>
          <p className="text-muted-foreground">Leitores faciais ControlID</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={scanVpn} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radar className="h-4 w-4 mr-2" />}
            Varrer VPN
          </Button>
          <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editId ? "Editar" : "Novo"} Equipamento</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>IP VPN</Label>
                    <Input value={ipVpn} onChange={(e) => setIpVpn(e.target.value)} placeholder="10.8.0.x" required />
                  </div>
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
                  <div className="flex items-center justify-between">
                    <Label>Dados do Leitor</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadFromDevice()}
                      disabled={loadingDevice || !ipVpn}
                    >
                      {loadingDevice ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Carregar do Leitor
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Modelo</Label>
                      <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Firmware</Label>
                      <Input value={firmware} onChange={(e) => setFirmware(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Serial</Label>
                      <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
                    </div>
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

      {/* Scan results dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dispositivos encontrados na VPN</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scanResults?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum dispositivo encontrado</TableCell></TableRow>
              ) : (
                scanResults?.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{d.ip}</code></TableCell>
                    <TableCell>{d.model || "—"}</TableCell>
                    <TableCell>{d.serial || d.serial_number || "—"}</TableCell>
                    <TableCell>
                      {d.known ? (
                        <Badge variant="secondary">Vinculado</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">Novo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!d.known && (
                        <Button size="sm" variant="outline" onClick={() => addFromScan(d)}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou IP..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP VPN</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Modelo</TableHead>
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
                    <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{item.ip_vpn}</code></TableCell>
                    <TableCell>{(item.acessos as any)?.nome}</TableCell>
                    <TableCell>{item.modelo || "—"}</TableCell>
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
