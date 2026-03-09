# Deploy na EC2

## 1. Copiar arquivos para EC2
```bash
scp -i "$HOME/openvpn-key.pem" -r ec2-api/ ubuntu@52.205.23.149:~/facial-v3-api/
```

## 2. Conectar na EC2
```bash
ssh -i "$HOME/openvpn-key.pem" ubuntu@52.205.23.149
cd ~/facial-v3-api
```

## 3. Instalar dependências
```bash
# Se não tiver Node.js:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

npm install
```

## 4. Configurar .env
```bash
cp .env.example .env
nano .env
# Preencher: DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
```

## 5. Criar banco (se necessário)
```bash
sudo -u postgres createdb youdodb
# Ou se já existe, as tabelas serão criadas automaticamente pelo app
```

## 6. Build do frontend (no seu PC)
```bash
# No diretório do projeto Lovable:
npm run build
# Copiar dist/ para EC2:
scp -i "$HOME/openvpn-key.pem" -r dist/ ubuntu@52.205.23.149:~/facial-v3-api/dist/
```

## 7. Rodar com PM2 (produção)
```bash
sudo npm install -g pm2
pm2 start src/index.js --name facial-v3
pm2 save
pm2 startup
```

## 8. Nginx (opcional, para porta 80)
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Endpoints disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login (email, password) |
| POST | /api/auth/register | Registro (auth required) |
| GET | /api/auth/me | Usuário logado |
| GET/POST/PUT/DELETE | /api/empreendimentos | CRUD |
| GET/POST/PUT/DELETE | /api/acessos | CRUD |
| GET/POST/PUT/DELETE | /api/equipamentos | CRUD |
| GET/POST/PUT/DELETE | /api/usuarios | CRUD |
| POST | /api/proxy | Proxy para leitor VPN |
| POST | /api/proxy/scan | Varrer IPs na VPN |
| GET | /api/proxy/status/:ip | Status de um leitor |
