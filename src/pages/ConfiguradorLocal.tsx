import { Download, Terminal, Shield, Wifi, Clock, MonitorCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const PROVISIONER_VERSION = "1.1.0";

export default function ConfiguradorLocal() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ControlID Provisioner</h1>
        <p className="text-muted-foreground">
          Configurador local de leitores ControlID — executa direto no seu computador, sem necessidade de VPN.
        </p>
      </div>

      {/* Card principal de download */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <MonitorCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">ControlIDProvisioner.exe</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">v{PROVISIONER_VERSION}</Badge>
              <span className="text-xs text-muted-foreground">Windows 10/11</span>
            </div>
          </div>
          <div className="shrink-0">
            <a href="/ControlIDProvisioner.exe" download="ControlIDProvisioner.exe">
              <Button size="lg" className="gap-2">
                <Download className="h-4 w-4" />
                Baixar .exe
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* O que faz */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que o Provisioner faz</CardTitle>
          <CardDescription>Automatiza a configuração inicial dos leitores na rede local</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { icon: Wifi, title: "Detecção automática", desc: "Varre a rede local e lista todos os leitores ControlID encontrados" },
            { icon: Shield, title: "Configuração de credenciais", desc: "Define login e senha de administrador nos leitores para uso com o sistema YouDo" },
            { icon: Clock, title: "Sincronização de hora (NTP)", desc: "Ativa NTP e configura o fuso horário (UTC-3 Brasília por padrão)" },
            { icon: Terminal, title: "Ativação de SNMP", desc: "Habilita o protocolo SNMP para monitoramento remoto" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3 items-start p-3 rounded-lg bg-muted/40">
              <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Como usar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como usar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {[
            {
              step: "1",
              title: "Baixe o ControlIDProvisioner.exe",
              desc: 'Clique em "Baixar .exe" acima e salve em qualquer pasta.',
            },
            {
              step: "2",
              title: "Execute o arquivo",
              desc: 'Dê duplo clique no .exe. Se o Windows SmartScreen aparecer, clique em "Mais informações" → "Executar assim mesmo".',
            },
            {
              step: "3",
              title: "Escolha o modo de operação",
              desc: 'Opção 1 varre a rede automaticamente e lista todos os leitores encontrados. Opção 2 configura um IP específico.',
            },
            {
              step: "4",
              title: "Informe as credenciais",
              desc: 'Digite o login e senha atuais do leitor (padrão de fábrica: admin / admin). Em seguida defina as novas credenciais.',
            },
            {
              step: "5",
              title: "Aguarde a aplicação",
              desc: "O provisioner configura credenciais, NTP (UTC-3) e SNMP em todos os leitores selecionados.",
            },
          ].map(({ step, title, desc, code }: { step: string; title: string; desc?: string; code?: string }) => (
            <div key={step} className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step}
              </div>
              <div className="flex-1">
                <p className="font-medium">{title}</p>
                {desc && <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>}
                {code && (
                  <pre className="mt-1 text-xs bg-muted rounded px-3 py-2 font-mono overflow-x-auto">{code}</pre>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Requisitos */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm flex items-center gap-1"><FileCode className="h-3 w-3" /> Requisitos</p>
        <p>• Windows 10 ou 11 (PowerShell 5.1 ou superior)</p>
        <p>• Computador na mesma rede local dos leitores ControlID</p>
        <p>• Leitores com senha padrão <code className="bg-muted px-1 rounded">admin</code> ou credenciais conhecidas</p>
        <p>• Não requer instalação — apenas execução do script</p>
      </div>
    </div>
  );
}
