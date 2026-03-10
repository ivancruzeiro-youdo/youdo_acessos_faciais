const express = require('express');
const router = express.Router();

// POST /api/vpn/sync-user
// Sincroniza um usuário com um leitor via VPN
router.post('/sync-user', async (req, res) => {
  try {
    const { reader_ip, user } = req.body;

    if (!reader_ip || !user) {
      return res.status(400).json({ error: 'reader_ip e user são obrigatórios' });
    }

    // Validar IP VPN
    if (!reader_ip.match(/^10\.8\.0\.\d{1,3}$/)) {
      return res.status(400).json({ error: 'IP VPN inválido' });
    }

    const axios = require('axios');

    // Fazer login no dispositivo
    const loginResponse = await axios.post(`http://${reader_ip}/login.fcgi`, 
      { login: 'admin', password: 'admin' },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );

    const sessionId = loginResponse.data?.session;
    if (!sessionId) {
      return res.status(401).json({ error: 'Falha ao autenticar no dispositivo' });
    }

    // Verificar se usuário já existe no leitor
    const checkResponse = await axios.post(`http://${reader_ip}/load_objects.fcgi?session=${sessionId}`, 
      { object: 'users', where: { users: { id: user.id } } },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    const existingUsers = checkResponse.data?.users || [];
    const userExists = existingUsers.length > 0;

    // Preparar dados do usuário para envio
    const userData = {
      id: user.id,
      name: user.name,
      registration: user.id.toString(),
    };

    // Se tem foto, adicionar
    if (user.photo) {
      // Remover prefixo data:image/jpeg;base64, se existir
      const base64Photo = user.photo.replace(/^data:image\/[a-z]+;base64,/, '');
      userData.image = base64Photo;
    }

    let syncResponse;
    if (userExists) {
      // Atualizar usuário existente
      syncResponse = await axios.post(`http://${reader_ip}/set_objects.fcgi?session=${sessionId}`, 
        { object: 'users', values: [userData] },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
    } else {
      // Criar novo usuário
      syncResponse = await axios.post(`http://${reader_ip}/create_objects.fcgi?session=${sessionId}`, 
        { object: 'users', values: [userData] },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
    }

    res.json({
      success: true,
      action: userExists ? 'updated' : 'created',
      user_id: user.id,
      message: `Usuário ${userExists ? 'atualizado' : 'criado'} com sucesso no leitor`
    });

  } catch (err) {
    console.error('Erro ao sincronizar usuário:', err.message);
    res.status(500).json({ error: 'Erro ao sincronizar usuário: ' + err.message });
  }
});

module.exports = router;
