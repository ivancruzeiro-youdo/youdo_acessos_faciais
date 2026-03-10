# Setup: Configurações dos Equipamentos

## Implementação Completa

Criei uma tela de **Configurações Padrão dos Equipamentos** onde você pode aplicar configurações em todos os leitores online simultaneamente.

## Arquivos criados/modificados:

1. **`ConfiguracoesEquipamentos.tsx`** - Página de configurações com:
   - Upload de logotipo (imagem)
   - Mensagem personalizada do display
   - Sincronização de hora/data
   - Aplicação em todos os leitores online

2. **`equipamentos-config.js`** - Endpoint backend que:
   - Busca leitores online na VPN
   - Envia logotipo via `/set_logotype.fcgi`
   - Envia mensagem via `/set_display_message.fcgi`
   - Sincroniza hora via `/set_system_time.fcgi`

3. **`App.tsx`** - Rota adicionada: `/equipamentos/configuracoes`

4. **`AppSidebar.tsx`** - Menu atualizado com "Config. Equipamentos"

5. **`index.js`** - Rota registrada no backend

## Como usar:

### 1. Upload para EC2

```powershell
# Upload do endpoint de configurações
scp -i "$HOME\openvpn-key.pem" C:\Users\gofas\Documents\youdo-facial-v3\ec2-api\src\routes\equipamentos-config.js ubuntu@52.205.23.149:/home/ubuntu/youdo-facial-v3-api/src/routes/

# Upload do index.js atualizado
scp -i "$HOME\openvpn-key.pem" C:\Users\gofas\Documents\youdo-facial-v3\ec2-api\src\index.js ubuntu@52.205.23.149:/home/ubuntu/youdo-facial-v3-api/src/
```

### 2. Reiniciar backend na EC2

```bash
# Dentro da EC2
cd /home/ubuntu/youdo-facial-v3-api
pkill -f "node src/index.js"
nohup node src/index.js > /tmp/api.log 2>&1 &
```

### 3. Build e deploy do frontend

```bash
cd C:\Users\gofas\Documents\youdo-facial-v3
npm run build
# Deploy via Netlify
```

## Funcionalidades:

### 📷 Logotipo
- Upload de imagem (max 500KB)
- Preview antes de aplicar
- Enviado em base64 para `/set_logotype.fcgi`

### 💬 Mensagem do Display
- Texto personalizado
- Variáveis: `{nome}` (nome do leitor), `{status}` (status VPN)
- Exemplo: "Bem-vindo ao {nome} - {status}"
- Enviado para `/set_display_message.fcgi`

### 🕐 Sincronização de Hora
- Checkbox para ativar/desativar
- Sincroniza com hora do servidor EC2
- Enviado para `/set_system_time.fcgi`

## Endpoints da API ControlID utilizados:

```javascript
// 1. Logotipo
POST http://{ip_vpn}/set_logotype.fcgi?session={session}
Body: { "image": "base64_string" }

// 2. Mensagem do display
POST http://{ip_vpn}/set_display_message.fcgi?session={session}
Body: { "message": "Texto da mensagem" }

// 3. Hora do sistema
POST http://{ip_vpn}/set_system_time.fcgi?session={session}
Body: {
  "year": 2026,
  "month": 3,
  "day": 10,
  "hour": 18,
  "minute": 30,
  "second": 0
}
```

## Fluxo de aplicação:

1. Usuário acessa `/equipamentos/configuracoes`
2. Configura logotipo, mensagem e hora
3. Clica em "Aplicar em Todos"
4. Backend:
   - Busca leitores online no OpenVPN status
   - Para cada leitor:
     - Faz login (`/login.fcgi`)
     - Envia logotipo (se configurado)
     - Envia mensagem do display
     - Sincroniza hora (se ativado)
5. Retorna resultado com sucesso/erro por leitor

## Resposta da API:

```json
{
  "success": true,
  "success_count": 2,
  "error_count": 0,
  "total_readers": 2,
  "details": [
    {
      "reader": "leitor-5",
      "ip": "10.8.0.14",
      "logotipo": "OK",
      "mensagem": "OK",
      "hora": "OK",
      "errors": []
    }
  ],
  "message": "Configurações aplicadas em 2/2 leitor(es)"
}
```

## Acesso:

Após deploy, acesse:
`https://acessos.youdobrasil.com.br/equipamentos/configuracoes`

Ou pelo menu: **Config. Equipamentos**
