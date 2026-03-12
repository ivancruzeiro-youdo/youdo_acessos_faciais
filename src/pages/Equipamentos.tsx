import { useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Checkbox } from "@/components/ui/checkbox";

import { Separator } from "@/components/ui/separator";

import { Plus, Pencil, Trash2, Search, Wifi, WifiOff, RefreshCw, Radar, Loader2, ChevronRight, Users, Info, AlertTriangle } from "lucide-react";

import { toast } from "sonner";



export default function Equipamentos() {

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [nome, setNome] = useState("");

  const [acessoId, setAcessoId] = useState("");

  const [formEmp, setFormEmp] = useState("all");

  const [ipVpn, setIpVpn] = useState("");

  const [modelo, setModelo] = useState("");

  const [firmware, setFirmware] = useState("");

  const [serial, setSerial] = useState("");

  const [macAddress, setMacAddress] = useState("");

  const [loadingDevice, setLoadingDevice] = useState(false);

  const [scanning, setScanning] = useState(false);

  const [scanResults, setScanResults] = useState<any[] | null>(null);

  const [scanOpen, setScanOpen] = useState(false);

  const [detailItem, setDetailItem] = useState<any | null>(null);

  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  const [deletingUsers, setDeletingUsers] = useState(false);

  const queryClient = useQueryClient();



  const { data: acessos } = useQuery({

    queryKey: ["acessos"],

    queryFn: async () => api.get<any[]>("/acessos"),

  });

  const { data: empreendimentos } = useQuery({

    queryKey: ["empreendimentos"],

    queryFn: async () => api.get<any[]>("/empreendimentos"),

  });

  const acessosFiltrados = formEmp === "all"
    ? (acessos || [])
    : (acessos || []).filter((a) => a.empreendimento_id === formEmp);



  const { data: items, isLoading } = useQuery({

    queryKey: ["equipamentos"],

    queryFn: async () => api.get<any[]>("/equipamentos"),

  });



  const { data: vpnClients } = useQuery({

    queryKey: ["vpn_clients_status"],

    queryFn: async () => {

      try {
        const data = await api.get<any>("/vpn/clients");
        return data;
      } catch { return { clients: [] }; }

    },

    refetchInterval: 30000,

    retry: 1,

  });



  const connectedIps = new Set(

    (vpnClients?.clients || []).map((c: any) => c.ip_vpn)

  );

  const ipLocalMap = new Map<string, string>(
    (vpnClients?.clients || []).filter((c: any) => c.ip_real).map((c: any) => [c.ip_vpn, c.ip_real])
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

        await api.put(`/equipamentos/${editId}`, payload);

      } else {

        await api.post("/equipamentos", payload);

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

    mutationFn: async (id: string) => api.delete(`/equipamentos/${id}`),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["equipamentos"] });

      toast.success("Removido!");

    },

    onError: (e) => toast.error(e.message),

  });



  const resetForm = () => {

    setNome(""); setAcessoId(""); setIpVpn(""); setModelo(""); setFirmware(""); setSerial(""); setMacAddress("");

    setFormEmp("all"); setEditId(null); setOpen(false);

  };



  const startEdit = (item: any) => {

    setEditId(item.id); setNome(item.nome); setAcessoId(item.acesso_id);

    setIpVpn(item.ip_vpn); setModelo(item.modelo ?? "");

    setFirmware(item.firmware ?? ""); setSerial(item.serial ?? "");

    setMacAddress("");

    setOpen(true);

    // Buscar MAC address do leitor em background
    if (item.ip_vpn) {
      api.get<any>(`/proxy/status/${item.ip_vpn}`)
        .then((data) => {
          const mac = data?.mac || data?.mac_address || data?.macAddress || "";
          if (mac) setMacAddress(mac);
        })
        .catch(() => {});
    }

  };



  const loadFromDevice = async (ip?: string) => {

    const targetIp = ip || ipVpn;

    if (!targetIp) {

      toast.error("Informe o IP VPN primeiro");

      return;

    }

    setLoadingDevice(true);

    try {

      const data = await api.get<any>(`/proxy/status/${targetIp}`);

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

      const data = await api.get<any>("/vpn/clients");

      const knownIps = items?.map((i) => i.ip_vpn) || [];

      const clients = data?.clients || [];

      const results = clients.map((d: any) => ({

        ip: d.ip_vpn,

        model: d.client_name,

        serial: "",

        known: knownIps.includes(d.ip_vpn),

      }));

      setScanResults(results);

      setScanOpen(true);

      toast.success(`${results.length} cliente(s) conectado(s) na VPN`);

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



  const isOnline = (ip: string) => connectedIps.has(ip);

  // Query de informações do leitor selecionado
  const { data: deviceInfo, isLoading: loadingInfo, refetch: refetchInfo } = useQuery({
    queryKey: ["device_info", detailItem?.ip_vpn],
    queryFn: async () => api.get<any>(`/proxy/status/${detailItem?.ip_vpn}`),
    enabled: !!detailItem?.ip_vpn && isOnline(detailItem?.ip_vpn),
    retry: 1,
  });

  // Query de usuários no leitor
  const { data: deviceUsers, isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["device_users", detailItem?.ip_vpn],
    queryFn: async () => api.post<any>("/proxy/device-users", { ip: detailItem?.ip_vpn }),
    enabled: !!detailItem?.ip_vpn && isOnline(detailItem?.ip_vpn),
    retry: 1,
  });

  const deleteDeviceUsers = async () => {
    if (!selectedUsers.length || !detailItem) return;
    setDeletingUsers(true);
    try {
      await api.post("/proxy/device-users/delete", { ip: detailItem.ip_vpn, user_ids: selectedUsers });
      toast.success(`${selectedUsers.length} usuário(s) removido(s) do leitor`);
      setSelectedUsers([]);
      refetchUsers();
    } catch (err: any) {
      toast.error("Erro ao remover: " + err.message);
    } finally {
      setDeletingUsers(false);
    }
  };

  const toggleUser = (id: number) =>
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = (users: any[]) => {
    const allIds = users.map((u: any) => u.id);
    setSelectedUsers(prev => prev.length === allIds.length ? [] : allIds);
  };

  const filtered = items?.filter((i) =>

    i.nome.toLowerCase().includes(search.toLowerCase()) ||

    i.ip_vpn.toLowerCase().includes(search.toLowerCase())

  );



  return (

    <>

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

                    {editId ? (
                      <Input value={ipVpn} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                    ) : (
                      <Input value={ipVpn} onChange={(e) => setIpVpn(e.target.value)} placeholder="10.8.0.x" required />
                    )}

                  </div>

                </div>

                <div className="space-y-2">

                  <Label>Empreendimento</Label>

                  <Select value={formEmp} onValueChange={(v) => { setFormEmp(v); setAcessoId(""); }}>

                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>

                    <SelectContent>

                      <SelectItem value="all">Todos</SelectItem>

                      {empreendimentos?.map((e) => (

                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>

                      ))}

                    </SelectContent>

                  </Select>

                </div>

                <div className="space-y-2">

                  <Label>Acesso</Label>

                  <Select value={acessoId} onValueChange={setAcessoId} required>

                    <SelectTrigger><SelectValue placeholder="Selecione o acesso" /></SelectTrigger>

                    <SelectContent>

                      {acessosFiltrados.map((a) => (

                        <SelectItem key={a.id} value={a.id}>

                          {a.nome}{formEmp === "all" ? ` — ${(a.empreendimentos as any)?.nome}` : ""}

                        </SelectItem>

                      ))}

                    </SelectContent>

                  </Select>

                </div>

                <div className="space-y-2">

                  <div className="flex items-center justify-between">

                    <Label>Dados do Leitor</Label>

                    {!editId && (
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
                    )}

                  </div>

                  {editId ? (
                    <div className="space-y-1">

                      <Label className="text-xs text-muted-foreground">MAC Address</Label>

                      <div className="flex items-center gap-2">

                        <Input
                          value={macAddress || (loadingDevice ? "Carregando..." : "Não disponível")}
                          readOnly
                          className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-sm"
                        />

                        {loadingDevice && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}

                      </div>

                    </div>
                  ) : (
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
                  )}

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

                <TableHead>Empreendimento</TableHead>

                <TableHead>Acesso</TableHead>

                <TableHead>IP VPN</TableHead>

                <TableHead>IP Local</TableHead>

                <TableHead className="w-24">Ações</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {isLoading ? (

                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>

              ) : filtered?.length === 0 ? (

                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>

              ) : (

                filtered?.map((item) => (

                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/60" onClick={() => { setDetailItem(item); setSelectedUsers([]); }}>

                    <TableCell className="font-medium">{item.nome}</TableCell>

                    <TableCell>

                      {connectedIps.has(item.ip_vpn) ? (

                        <Badge variant="default" className="bg-green-600 text-xs"><Wifi className="h-3 w-3 mr-1" />Online</Badge>

                      ) : (

                        <Badge variant="secondary" className="text-xs"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>

                      )}

                    </TableCell>

                    <TableCell className="text-sm">{(item.acessos as any)?.empreendimentos?.nome || "—"}</TableCell>

                    <TableCell>{(item.acessos as any)?.nome}</TableCell>

                    <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{item.ip_vpn}</code></TableCell>

                    <TableCell className="text-xs text-muted-foreground">{ipLocalMap.get(item.ip_vpn) || "—"}</TableCell>

                    <TableCell>

                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>

                        <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>

                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(item.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>

                        <Button variant="ghost" size="icon" onClick={() => { setDetailItem(item); setSelectedUsers([]); }}><ChevronRight className="h-4 w-4" /></Button>

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



      {/* Sheet de Detalhes do Equipamento */}


      <Sheet open={!!detailItem} onOpenChange={(o) => { if (!o) { setDetailItem(null); setSelectedUsers([]); } }}>

        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">

          {detailItem && (

            <>

              <SheetHeader className="mb-4">

                <SheetTitle className="flex items-center gap-2">

                  {isOnline(detailItem.ip_vpn)

                    ? <Wifi className="h-5 w-5 text-green-500" />

                    : <WifiOff className="h-5 w-5 text-muted-foreground" />}

                  {detailItem.nome}

                  <code className="text-xs bg-muted px-2 py-1 rounded font-normal ml-1">{detailItem.ip_vpn}</code>

                </SheetTitle>

              </SheetHeader>



              <Tabs defaultValue="info">

                <TabsList className="mb-4">

                  <TabsTrigger value="info"><Info className="h-4 w-4 mr-1" />Informações</TabsTrigger>

                  <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" />Usuários no Leitor</TabsTrigger>

                </TabsList>



                {/* ABA INFORMAÇÕES */}

                <TabsContent value="info" className="space-y-4">

                  {/* Dados do banco */}

                  <Card>

                    <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Cadastro</CardTitle></CardHeader>

                    <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3 text-sm">

                      <div><span className="text-muted-foreground">Acesso:</span><p className="font-medium">{detailItem.acessos?.nome || "—"}</p></div>

                      <div><span className="text-muted-foreground">Modelo:</span><p className="font-medium">{detailItem.modelo || "—"}</p></div>

                      <div><span className="text-muted-foreground">Firmware:</span><p className="font-medium">{detailItem.firmware || "—"}</p></div>

                      <div><span className="text-muted-foreground">Serial:</span><p className="font-medium">{detailItem.serial || "—"}</p></div>

                    </CardContent>

                  </Card>



                  {/* Dados reais do leitor */}

                  {deviceInfo?.device && (
                    <Card>
                      <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Hardware do Leitor</CardTitle></CardHeader>
                      <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-muted-foreground">Modelo:</span><p className="font-medium">{deviceInfo.device.modelo || "—"}</p></div>
                        <div><span className="text-muted-foreground">Serial:</span><p className="font-mono font-medium text-xs">{deviceInfo.device.serial || "—"}</p></div>
                        <div><span className="text-muted-foreground">Firmware:</span><p className="font-medium">{deviceInfo.device.firmware || "—"}</p></div>
                        <div><span className="text-muted-foreground">MAC:</span><p className="font-mono text-xs">{deviceInfo.device.mac || "—"}</p></div>
                        <div><span className="text-muted-foreground">IP Local:</span><p className="font-mono text-xs">{deviceInfo.device.ip_local || "—"}</p></div>
                        <div><span className="text-muted-foreground">Gateway:</span><p className="font-mono text-xs">{deviceInfo.device.gateway || "—"}</p></div>
                        <div><span className="text-muted-foreground">DNS:</span><p className="font-mono text-xs">{deviceInfo.device.dns || "—"}</p></div>
                        <div><span className="text-muted-foreground">SNMP:</span>
                          <p className="font-medium">{deviceInfo.device.snmp_enabled
                            ? <span className="text-green-500">Ativo</span>
                            : <span className="text-muted-foreground">Inativo</span>}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Dados em tempo real */}

                  {!isOnline(detailItem.ip_vpn) ? (

                    <div className="flex items-center gap-2 text-muted-foreground text-sm p-4 border rounded-lg">

                      <AlertTriangle className="h-4 w-4" />

                      Leitor offline — não é possível consultar informações em tempo real.

                    </div>

                  ) : loadingInfo ? (

                    <div className="flex items-center gap-2 text-sm p-4"><Loader2 className="h-4 w-4 animate-spin" />Consultando leitor...</div>

                  ) : deviceInfo?.online ? (

                    <>

                      {/* Resumo do leitor */}

                      <Card>

                        <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Resumo do Leitor</CardTitle></CardHeader>

                        <CardContent className="px-4 pb-4 grid grid-cols-3 gap-3 text-sm">

                          <div className="text-center p-2 bg-muted rounded-lg">

                            <p className="text-2xl font-bold">{deviceInfo.summary?.users ?? "—"}</p>

                            <p className="text-xs text-muted-foreground">Usuários</p>

                          </div>

                          <div className="text-center p-2 bg-muted rounded-lg">

                            <p className="text-2xl font-bold">{deviceInfo.summary?.groups ?? "—"}</p>

                            <p className="text-xs text-muted-foreground">Grupos</p>

                          </div>

                          <div className="text-center p-2 bg-muted rounded-lg">

                            <p className="text-2xl font-bold">{deviceInfo.summary?.portals ?? "—"}</p>

                            <p className="text-xs text-muted-foreground">Portais</p>

                          </div>

                          <div className="text-center p-2 bg-muted rounded-lg">

                            <p className="text-2xl font-bold">{deviceInfo.summary?.access_rules ?? "—"}</p>

                            <p className="text-xs text-muted-foreground">Regras de Acesso</p>

                          </div>

                          <div className="text-center p-2 bg-muted rounded-lg">

                            <p className="text-2xl font-bold">{deviceInfo.summary?.user_groups ?? "—"}</p>

                            <p className="text-xs text-muted-foreground">Vínculos</p>

                          </div>

                        </CardContent>

                      </Card>

                      {/* Portais */}

                      {(deviceInfo.portals || []).length > 0 && (

                        <Card>

                          <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Portais</CardTitle></CardHeader>

                          <CardContent className="px-4 pb-4 space-y-1 text-sm">

                            {deviceInfo.portals.map((p: any) => (

                              <div key={p.id} className="flex items-center justify-between py-1 border-b last:border-0">

                                <span className="font-medium">{p.name}</span>

                                <span className="text-xs text-muted-foreground">Área {p.area_from_id} → {p.area_to_id}</span>

                              </div>

                            ))}

                          </CardContent>

                        </Card>

                      )}

                      {/* Grupos */}

                      {(deviceInfo.groups || []).length > 0 && (

                        <Card>

                          <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Grupos</CardTitle></CardHeader>

                          <CardContent className="px-4 pb-4 space-y-1 text-sm">

                            {deviceInfo.groups.map((g: any) => (

                              <div key={g.id} className="py-1 border-b last:border-0">

                                <span className="font-medium">{g.name}</span>

                              </div>

                            ))}

                          </CardContent>

                        </Card>

                      )}

                    </>

                  ) : (

                    <div className="text-sm text-muted-foreground p-4 border rounded-lg">Sem dados do leitor.</div>

                  )}



                  <div className="flex justify-end">

                    <Button variant="outline" size="sm" onClick={() => { refetchInfo(); }} disabled={!isOnline(detailItem.ip_vpn)}>

                      <RefreshCw className="h-3 w-3 mr-1" />Atualizar

                    </Button>

                  </div>

                </TabsContent>



                {/* ABA USUÁRIOS NO LEITOR */}

                <TabsContent value="users" className="space-y-4">

                  {!isOnline(detailItem.ip_vpn) ? (

                    <div className="flex items-center gap-2 text-muted-foreground text-sm p-4 border rounded-lg">

                      <AlertTriangle className="h-4 w-4" />

                      Leitor offline — não é possível listar usuários.

                    </div>

                  ) : loadingUsers ? (

                    <div className="flex items-center gap-2 text-sm p-4"><Loader2 className="h-4 w-4 animate-spin" />Carregando usuários do leitor...</div>

                  ) : (

                    <>

                      <div className="flex items-center justify-between">

                        <span className="text-sm text-muted-foreground">{deviceUsers?.users?.length || 0} usuário(s) no leitor</span>

                        <div className="flex gap-2">

                          <Button variant="outline" size="sm" onClick={() => refetchUsers()}>

                            <RefreshCw className="h-3 w-3 mr-1" />Recarregar

                          </Button>

                          {selectedUsers.length > 0 && (

                            <Button variant="destructive" size="sm" onClick={deleteDeviceUsers} disabled={deletingUsers}>

                              {deletingUsers ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}

                              Remover {selectedUsers.length} selecionado(s)

                            </Button>

                          )}

                        </div>

                      </div>



                      <Separator />



                      <Table>

                        <TableHeader>

                          <TableRow>

                            <TableHead className="w-10">

                              <Checkbox

                                checked={selectedUsers.length === (deviceUsers?.users?.length || 0) && (deviceUsers?.users?.length || 0) > 0}

                                onCheckedChange={() => toggleAll(deviceUsers?.users || [])}

                              />

                            </TableHead>

                            <TableHead className="w-14">Foto</TableHead>

                            <TableHead>ID</TableHead>

                            <TableHead>Nome</TableHead>

                            <TableHead>Matrícula</TableHead>

                            <TableHead>Data Início</TableHead>

                            <TableHead>Data Fim</TableHead>

                          </TableRow>

                        </TableHeader>

                        <TableBody>

                          {(deviceUsers?.users || []).length === 0 ? (

                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum usuário cadastrado no leitor</TableCell></TableRow>

                          ) : (

                            (deviceUsers?.users || []).map((u: any) => (

                              <TableRow key={u.id}>

                                <TableCell>

                                  <Checkbox

                                    checked={selectedUsers.includes(u.id)}

                                    onCheckedChange={() => toggleUser(u.id)}

                                  />

                                </TableCell>

                                <TableCell>
                                  {u.foto_base64
                                    ? <img src={u.foto_base64} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                                    : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">—</div>}
                                </TableCell>

                                <TableCell><code className="text-xs bg-muted px-1 rounded">{u.id}</code></TableCell>

                                <TableCell className="font-medium">{u.name || u.nome || "—"}</TableCell>

                                <TableCell className="text-muted-foreground">{u.registration || "—"}</TableCell>

                                <TableCell className="text-xs text-muted-foreground">{u.begin_time ? new Date(u.begin_time * 1000).toLocaleDateString('pt-BR') : "—"}</TableCell>

                                <TableCell className="text-xs text-muted-foreground">{u.end_time ? new Date(u.end_time * 1000).toLocaleDateString('pt-BR') : "—"}</TableCell>

                              </TableRow>

                            ))

                          )}

                        </TableBody>

                      </Table>

                    </>

                  )}

                </TabsContent>



              </Tabs>

            </>

          )}

        </SheetContent>

      </Sheet>



    </>

  );

}
