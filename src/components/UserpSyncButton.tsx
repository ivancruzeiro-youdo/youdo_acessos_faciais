import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getUserpCredentials, getUserpBaseUrl } from "@/pages/Configuracoes";

interface Props {
  tipo: "empreendimentos" | "unidades" | "usuarios";
  onSuccess?: () => void;
  label?: string;
}

export function UserpSyncButton({ tipo, onSuccess, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startProgress = () => {
    setProgress(0);
    let current = 0;
    timerRef.current = setInterval(() => {
      // Progresso simulado: sobe rápido até 70%, depois desacelera até 92%
      current += current < 70 ? 3 : current < 92 ? 0.5 : 0;
      setProgress(Math.min(current, 92));
    }, 400);
  };

  const finishProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  };

  const handleSync = async () => {
    const { email, senha } = getUserpCredentials();
    if (!email || !senha) {
      toast.error(
        <span>
          Credenciais Userp não configuradas.{" "}
          <a href="/configuracoes" className="underline font-medium">Configurar agora →</a>
        </span>
      );
      return;
    }
    setLoading(true);
    startProgress();
    try {
      const result = await api.post<any>(`/userp/sync/${tipo}`, { email, senha, userp_base_url: getUserpBaseUrl() });
      finishProgress();
      const parts = [];
      if (result.inserted > 0) parts.push(`${result.inserted} inserido(s)`);
      if (result.updated > 0) parts.push(`${result.updated} atualizado(s)`);
      if (result.skipped > 0) parts.push(`${result.skipped} ignorado(s)`);
      toast.success(
        `Importação concluída — ${result.total} registro(s) processado(s)${parts.length ? `: ${parts.join(", ")}` : ""}`
      );
      onSuccess?.();
    } catch (err: any) {
      finishProgress();
      toast.error("Erro na importação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="outline" onClick={handleSync} disabled={loading}>
        {loading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
        ) : (
          <><Download className="h-4 w-4 mr-2" />{label ?? "Importar do Sistema"}</>
        )}
      </Button>
      {loading && (
        <div className="w-full min-w-[140px]">
          <Progress value={progress} className="h-1.5" />
        </div>
      )}
    </div>
  );
}
