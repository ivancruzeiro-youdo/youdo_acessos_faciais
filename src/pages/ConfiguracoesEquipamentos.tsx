import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Upload, Settings, Clock, Image as ImageIcon, Monitor, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracoesEquipamentos() {
  const [logotipo, setLogotipo] = useState<string>("");
  const [mensagemDisplay, setMensagemDisplay] = useState("Bem-vindo");
  const [sincronizarHora, setSincronizarHora] = useState(true);
  const [applying, setApplying] = useState(false);

  // Buscar equipamentos online
  const { data: vpnClients } = useQuery({
    queryKey: ["vpn_clients_status"],
    queryFn: async () => {
      const response = await fetch('/api/vpn/status');
      if (!response.ok) return { clients: [] };
      return await response.json();
    },
    refetchInterval: 30000,
  });

  const onlineCount = vpnClients?.clients?.length || 0;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    // Validar tamanho (max 500KB)
    if (file.size > 500 * 1024) {
      toast.error("Imagem muito grande. Máximo 500KB");
      return;
    }

    // Converter para base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLogotipo(base64);
      toast.success("Logotipo carregado");
    };
    reader.readAsDataURL(file);
  };

  const applyConfigurations = async () => {
    if (onlineCount === 0) {
      toast.error("Nenhum equipamento online");
      return;
    }

    setApplying(true);
    try {
      const response = await fetch('/api/equipamentos/apply-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logotipo: logotipo || null,
          mensagem_display: mensagemDisplay,
          sincronizar_hora: sincronizarHora,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao aplicar configurações');
      }

      const result = await response.json();
      
      if (result.success_count > 0) {
        toast.success(`Configurações aplicadas em ${result.success_count} equipamento(s)!`);
      }
      
      if (result.error_count > 0) {
        toast.error(`${result.error_count} erro(s) ao aplicar configurações`);
      }

      if (result.details) {
        console.log("Detalhes da aplicação:", result.details);
      }
    } catch (err: any) {
      toast.error("Erro ao aplicar configurações: " + err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações dos Equipamentos</h1>
        <p className="text-muted-foreground">
          Configure padrões que serão aplicados a todos os leitores online ({onlineCount} online)
        </p>
      </div>

      <div className="grid gap-6">
        {/* Logotipo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Logotipo
            </CardTitle>
            <CardDescription>
              Imagem exibida na tela inicial dos leitores (max 500KB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="logo-upload">Selecionar Imagem</Label>
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="cursor-pointer"
              />
            </div>
            {logotipo && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg p-4 bg-muted/50 flex justify-center">
                  <img
                    src={logotipo}
                    alt="Preview do logotipo"
                    className="max-h-32 object-contain"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mensagem do Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Mensagem do Display
            </CardTitle>
            <CardDescription>
              Texto exibido na tela dos leitores
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Input
                id="mensagem"
                value={mensagemDisplay}
                onChange={(e) => setMensagemDisplay(e.target.value)}
                placeholder="Ex: Bem-vindo ao Condomínio"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: {"{nome}"} (nome do leitor), {"{status}"} (status VPN)
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Preview:</p>
              <p className="text-sm text-muted-foreground">
                {mensagemDisplay.replace("{nome}", "Leitor-5").replace("{status}", "Online")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sincronização de Hora */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sincronização de Hora
            </CardTitle>
            <CardDescription>
              Ajustar data e hora dos leitores com o servidor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sync-time"
                checked={sincronizarHora}
                onChange={(e) => setSincronizarHora(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="sync-time" className="cursor-pointer">
                Sincronizar hora automaticamente ao aplicar configurações
              </Label>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Hora atual do servidor: {new Date().toLocaleString('pt-BR')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Botão de Aplicar */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div>
          <p className="font-medium">Aplicar Configurações</p>
          <p className="text-sm text-muted-foreground">
            Será aplicado em {onlineCount} equipamento(s) online
          </p>
        </div>
        <Button
          onClick={applyConfigurations}
          disabled={applying || onlineCount === 0}
          size="lg"
        >
          {applying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Aplicando...
            </>
          ) : (
            <>
              <Settings className="h-4 w-4 mr-2" />
              Aplicar em Todos
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
