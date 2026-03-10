# Setup: Webcam e Sincronização de Usuários

## Passos para finalizar a implementação

### 1. Adicionar coluna no banco de dados (Supabase)

Execute o SQL no **Supabase SQL Editor**:

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT;
COMMENT ON COLUMN usuarios.foto_base64 IS 'Foto do usuário em base64 para sincronização com leitores faciais';
```

### 2. Instalar dependência react-webcam

No diretório do frontend:

```bash
cd C:\Users\gofas\Documents\youdo-facial-v3
npm install react-webcam
```

### 3. Fazer upload dos arquivos para EC2

```powershell
# Upload do novo endpoint de sincronização
scp -i "$HOME\openvpn-key.pem" C:\Users\gofas\Documents\youdo-facial-v3\ec2-api\src\routes\sync-users.js ubuntu@52.205.23.149:/home/ubuntu/youdo-facial-v3-api/src/routes/

# Upload do index.js atualizado
scp -i "$HOME\openvpn-key.pem" C:\Users\gofas\Documents\youdo-facial-v3\ec2-api\src\index.js ubuntu@52.205.23.149:/home/ubuntu/youdo-facial-v3-api/src/

# Upload do provision-device.sh com cipher corrigido
scp -i "$HOME\openvpn-key.pem" C:\Users\gofas\Documents\youdo-facial-v3\provision-device.sh ubuntu@52.205.23.149:/home/ubuntu/youdo-facial-v3-api/scripts/
```

### 4. Reiniciar backend na EC2

```bash
# Dentro da EC2
cd /home/ubuntu/youdo-facial-v3-api
pkill -f "node src/index.js"
nohup node src/index.js > /tmp/api.log 2>&1 &
```

### 5. Build e deploy do frontend

```bash
cd C:\Users\gofas\Documents\youdo-facial-v3
npm run build
# Deploy via Netlify ou outro serviço
```

## Funcionalidades implementadas

### ✅ Captura de foto via webcam
- Componente `WebcamCapture` criado
- Integrado no formulário de usuários
- Foto salva em base64 no campo `foto_base64`

### ✅ Sincronização com leitores
- Botão "Sincronizar com Leitores" na página de usuários
- Envia todos os usuários para os leitores online via VPN
- Verifica se usuário já existe no leitor (atualiza ou cria)
- Envia foto facial em base64 para o dispositivo ControlID

## Como usar

1. **Cadastrar usuário com foto**:
   - Ir em Usuários → Novo
   - Preencher nome e acesso
   - Clicar em "Capturar Foto"
   - Permitir acesso à webcam
   - Capturar e confirmar a foto
   - Salvar

2. **Sincronizar com leitores**:
   - Clicar em "Sincronizar com Leitores"
   - Sistema busca leitores online na VPN
   - Envia todos os usuários para cada leitor
   - Mostra resultado da sincronização

## Endpoints criados

- `POST /api/vpn/sync-user` - Sincroniza um usuário com um leitor específico
  - Body: `{ reader_ip: "10.8.0.x", user: { id, name, photo } }`
  - Verifica se usuário existe no leitor
  - Cria ou atualiza conforme necessário

## Correções aplicadas

- ✅ Adicionado `cipher AES-256-CBC` no provision-device.sh
- ✅ Configurada rota VPN `10.8.0.0/24 dev tun0` na EC2
- ✅ Adicionado `client-to-client` no OpenVPN server
- ✅ Backend atualizado com endpoints de sincronização
