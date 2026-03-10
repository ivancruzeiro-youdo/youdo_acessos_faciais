import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";

const APP_VERSION = "1.0.0";
const BUILD_DATE = new Date().toISOString().split('T')[0];

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
          <footer className="h-8 flex items-center justify-center border-t bg-muted/30 px-4">
            <p className="text-xs text-muted-foreground">
              v{APP_VERSION} • Build {BUILD_DATE} • {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
