import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, CheckCircle2, KeyRound, Save, Link } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "youdo_userp_credentials";
const USERP_URL_KEY = "youdo_userp_base_url";
const USERP_URL_DEFAULT = "https://homologa.userpweb.youdobrasil.com.br";

export function getUserpBaseUrl(): string {
  return localStorage.getItem(USERP_URL_KEY) || USERP_URL_DEFAULT;
}

export function getUserpCredentials(): { email: string; senha: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { email: "", senha: "" };
    return JSON.parse(raw);
  } catch {
    return { email: "", senha: "" };
  }
}

export default function Configuracoes() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userpUrl, setUserpUrl] = useState("");
  const [urlSaved, setUrlSaved] = useState(false);

  useEffect(() => {
    const creds = getUserpCredentials();
    setEmail(creds.email);
    setSenha(creds.senha);
    if (creds.email && creds.senha) setSaved(true);
    setUserpUrl(localStorage.getItem(USERP_URL_KEY) || USERP_URL_DEFAULT);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, senha }));
    setSaved(true);
    toast.success("Credenciais salvas!");
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEmail(""); setSenha(""); setSaved(false);
    toast.info("Credenciais removidas.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Configurações gerais do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-blue-600" />
            Credenciais Userp
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Usadas para atualizar usuários e enviar fotos para o sistema Userp.
            Ficam salvas localmente no navegador.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="userp-email">E-mail</Label>
              <Input
                id="userp-email"
                type="email"
                placeholder="usuario@dominio.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setSaved(false); }}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="userp-senha">Senha</Label>
              <div className="relative">
                <Input
                  id="userp-senha"
                  type={showSenha ? "text" : "password"}
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setSaved(false); }}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSenha(v => !v)}
                  tabIndex={-1}
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {saved && email && senha && (
              <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Credenciais salvas e prontas para uso
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={!email || !senha}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
              {saved && (
                <Button type="button" variant="ghost" className="text-destructive" onClick={handleClear}>
                  Remover credenciais
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link className="h-4 w-4 text-blue-600" />
            URL do Sistema Userp
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            URL base usada para exibir fotos e integrar com o Userp.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={e => { e.preventDefault(); localStorage.setItem(USERP_URL_KEY, userpUrl.trim().replace(/\/$/, "")); setUrlSaved(true); toast.success("URL salva!"); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="userp-url">URL base</Label>
              <Input
                id="userp-url"
                type="url"
                placeholder="https://homologa.userpweb.youdobrasil.com.br"
                value={userpUrl}
                onChange={e => { setUserpUrl(e.target.value); setUrlSaved(false); }}
              />
            </div>
            {urlSaved && (
              <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                URL salva
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={!userpUrl}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setUserpUrl(USERP_URL_DEFAULT); setUrlSaved(false); }}>
                Restaurar padrão
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
