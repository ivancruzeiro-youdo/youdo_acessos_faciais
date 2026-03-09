# Facial V3 - Sistema de Gestão de Controle de Acesso Facial

## Visão Geral

Painel web com autenticação para gerenciar empreendimentos, acessos, equipamentos ControlID e usuários de acesso facial. O backend rodará na EC2 da VPN (52.205.23.149) e se comunicará com os leitores ControlID via API. O sistema importará dados do ERP USERP.

---

## Páginas e Funcionalidades

### 1. Login / Autenticação

- Tela de login com email e senha
- Recuperação de senha
- Proteção de todas as rotas do sistema

### 2. Dashboard

- Resumo geral: total de empreendimentos, acessos, equipamentos e usuários
- Status dos equipamentos (online/offline via VPN)
- Alertas de equipamentos desconectados

### 3. Empreendimentos (CRUD)

- Listagem com busca e filtros
- Cadastro/edição: Nome e ID
- Visualização dos acessos vinculados ao empreendimento

### 4. Acessos (CRUD)

- Listagem com busca e filtros
- Cadastro/edição: Nome, ID, empreendimento vinculado (select)
- Visualização dos equipamentos e usuários vinculados

### 5. Equipamentos (CRUD + Comunicação com Leitor)

- Cadastro/edição: Nome, acesso vinculado, IP VPN, modelo, firmware, etc.
- **Status do Leitor** — consulta `device_status.fcgi` via backend na EC2 para mostrar status em tempo real
- **Verificar Usuários no Leitor** — consulta `load_objects.fcgi` no leitor para listar usuários cadastrados diretamente no equipamento (sem banco de dados)
- **Sincronizar Usuários** — envia usuários do banco para o leitor via `create_objects.fcgi` / `destroy_objects.fcgi`
- Exibição de todos os dados consultáveis do leitor (serial, versão, capacidade, etc.)

### 6. Usuários de Acesso (CRUD)

- Cadastro/edição: Nome, data/hora início de acesso, data/hora fim de acesso, ID, acesso vinculado
- Importação do USERP (ERP externo)
- Botão para sincronizar usuário com o(s) leitor(es) do acesso vinculado

### 7. Integração USERP

- Tela de configuração da conexão com o ERP (URL/credenciais)
- Importação de usuários do USERP para o sistema
- Mapeamento de campos entre USERP e o sistema

---

## Backend (EC2 - Especificação para o programador)

O sistema web (Lovable) **não** se comunica diretamente com os leitores. Um serviço backend na EC2 (mesma máquina da VPN) servirá como intermediário:

### API REST na EC2 deve expor:

- `GET /api/devices/:id/status` → chama `http://{ip_vpn}/device_status.fcgi` no leitor
- `GET /api/devices/:id/users` → chama `http://{ip_vpn}/load_objects.fcgi?object=users` no leitor
- `POST /api/devices/:id/sync-users` → envia usuários via `create_objects.fcgi` / `user_set_image.fcgi`
- `DELETE /api/devices/:id/users/:userId` → remove usuário via `destroy_objects.fcgi`
- `POST /api/devices/:id/reboot` → chama `reboot.fcgi`
- Autenticação via token/API key para proteger os endpoints

O frontend chamará essa API da EC2 (que precisa estar exposta na internet com HTTPS).

---

## Banco de Dados (Lovable Cloud / Supabase)

- **Tabelas**: empreendimentos, acessos, equipamentos, usuarios, user_roles
- **RLS**: políticas de segurança por role (admin/operador)
- Relacionamentos: Empreendimento → Acessos → Equipamentos; Acesso → Usuários

---

## Design

- Interface limpa e profissional com sidebar de navegação
- Cards de status com indicadores visuais (verde/vermelho para online/offline)
- Tabelas com paginação, busca e ordenação
- Modais para cadastro/edição
- Siga o visual do site [https://youdobrasil.com.br/](https://youdobrasil.com.br/)