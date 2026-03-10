const express = require('express');
const router = express.Router();

// POST /api/equipamentos/apply-config
// Aplica configurações padrão em todos os leitores online
router.post('/apply-config', async (req, res) => {
  try {
    const { logotipo, mensagem_display, sincronizar_hora } = req.body;
    const axios = require('axios');

    // Buscar status VPN para saber quais leitores estão online
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync('sudo cat /var/log/openvpn/status.log');
    
    // Parse do arquivo de status
    const lines = stdout.split('\n');
    const clients = [];
    let inRoutingSection = false;

    for (const line of lines) {
      if (line.startsWith('ROUTING TABLE')) {
        inRoutingSection = true;
        continue;
      }
      if (line.startsWith('GLOBAL STATS')) {
        break;
      }
      
      if (inRoutingSection && line.trim() && !line.startsWith('Virtual Address')) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const vpnIp = parts[0];
          const commonName = parts[1];
          clients.push({ vpn_ip: vpnIp, name: commonName });
        }
      }
    }

    if (clients.length === 0) {
      return res.json({
        success: true,
        success_count: 0,
        error_count: 0,
        message: 'Nenhum leitor online'
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const details = [];

    // Aplicar configurações em cada leitor
    for (const client of clients) {
      const result = {
        reader: client.name,
        ip: client.vpn_ip,
        logotipo: null,
        mensagem: null,
        hora: null,
        errors: []
      };

      try {
        // Login no dispositivo
        const loginResponse = await axios.post(`http://${client.vpn_ip}/login.fcgi`, 
          { login: 'admin', password: 'admin' },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          }
        );

        const sessionId = loginResponse.data?.session;
        if (!sessionId) {
          result.errors.push('Falha ao autenticar');
          errorCount++;
          details.push(result);
          continue;
        }

        // 1. Aplicar logotipo se fornecido
        if (logotipo) {
          try {
            // Remover prefixo data:image/...;base64, se existir
            const base64Image = logotipo.replace(/^data:image\/[a-z]+;base64,/, '');
            
            const logoResponse = await axios.post(
              `http://${client.vpn_ip}/set_logotype.fcgi?session=${sessionId}`,
              { image: base64Image },
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
              }
            );
            result.logotipo = 'OK';
          } catch (err) {
            result.logotipo = 'ERRO';
            result.errors.push(`Logotipo: ${err.message}`);
          }
        }

        // 2. Aplicar mensagem do display
        if (mensagem_display) {
          try {
            // Substituir variáveis na mensagem
            let mensagem = mensagem_display;
            mensagem = mensagem.replace('{nome}', client.name);
            mensagem = mensagem.replace('{status}', 'Online');

            const msgResponse = await axios.post(
              `http://${client.vpn_ip}/set_display_message.fcgi?session=${sessionId}`,
              { message: mensagem },
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
              }
            );
            result.mensagem = 'OK';
          } catch (err) {
            result.mensagem = 'ERRO';
            result.errors.push(`Mensagem: ${err.message}`);
          }
        }

        // 3. Sincronizar hora se solicitado
        if (sincronizar_hora) {
          try {
            const now = new Date();
            const timeData = {
              year: now.getFullYear(),
              month: now.getMonth() + 1,
              day: now.getDate(),
              hour: now.getHours(),
              minute: now.getMinutes(),
              second: now.getSeconds()
            };

            const timeResponse = await axios.post(
              `http://${client.vpn_ip}/set_system_time.fcgi?session=${sessionId}`,
              timeData,
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
              }
            );
            result.hora = 'OK';
          } catch (err) {
            result.hora = 'ERRO';
            result.errors.push(`Hora: ${err.message}`);
          }
        }

        if (result.errors.length === 0) {
          successCount++;
        } else {
          errorCount++;
        }

      } catch (err) {
        result.errors.push(`Erro geral: ${err.message}`);
        errorCount++;
      }

      details.push(result);
    }

    res.json({
      success: true,
      success_count: successCount,
      error_count: errorCount,
      total_readers: clients.length,
      details: details,
      message: `Configurações aplicadas em ${successCount}/${clients.length} leitor(es)`
    });

  } catch (err) {
    console.error('Erro ao aplicar configurações:', err.message);
    res.status(500).json({ error: 'Erro ao aplicar configurações: ' + err.message });
  }
});

module.exports = router;
