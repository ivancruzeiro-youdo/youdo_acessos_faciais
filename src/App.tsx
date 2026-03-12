import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Empreendimentos from "@/pages/Empreendimentos";
import Acessos from "@/pages/Acessos";
import Equipamentos from "@/pages/Equipamentos";
import Usuarios from "@/pages/Usuarios";
import VPN from "@/pages/VPN";
import ConfiguracoesEquipamentos from "@/pages/ConfiguracoesEquipamentos";
import Logs from "@/pages/Logs";
import ConfiguradorLocal from "@/pages/ConfiguradorLocal";
import Configuracoes from "@/pages/Configuracoes";
import GerenciarUsuarios from "@/pages/GerenciarUsuarios";
import Funcionarios from "@/pages/Funcionarios";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/empreendimentos" element={<Empreendimentos />} />
              <Route path="/acessos" element={<Acessos />} />
              <Route path="/equipamentos" element={<Equipamentos />} />
              <Route path="/equipamentos/configuracoes" element={<ConfiguracoesEquipamentos />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/vpn" element={<VPN />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/configurador-de-equipamento-local" element={<ConfiguradorLocal />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
              <Route path="/funcionarios" element={<Funcionarios />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
