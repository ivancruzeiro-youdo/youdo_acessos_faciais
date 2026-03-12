const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getUserpBase(override) {
  return (override && override.trim()) || process.env.USERP_BASE_URL || 'https://homologa.userpweb.youdobrasil.com.br';
}

async function getUserpToken(email, senha, baseUrl) {
  const USERP_BASE = getUserpBase(baseUrl);
  const res = await fetch(`${USERP_BASE}/api/userp-satelite/auth/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Falha na autenticação com o sistema externo');
  return data.access_token;
}

async function fetchAllPages(token, endpoint, params = {}, baseUrl) {
  const USERP_BASE = getUserpBase(baseUrl);
  const items = [];
  let start = 0;
  const limit = 100;
  while (true) {
    const url = new URL(`${USERP_BASE}${endpoint}`);
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(limit));
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // API retornou resposta inválida — se já temos itens, é fim natural da paginação
      if (items.length > 0) {
        console.warn(`[userp-sync] Fim de paginação em ${endpoint} start=${start} (${items.length} itens coletados)`);
        break;
      }
      throw new Error(`Resposta inválida da API externa em start=${start}: ${text.slice(0, 100)}`);
    }
    if (!res.ok) throw new Error(data.message || `Erro ao buscar ${endpoint} (HTTP ${res.status})`);
    const batch = data.items || [];
    items.push(...batch);
    if (!data.has_more || batch.length === 0) break;
    if (data.total && items.length >= data.total) break;
    if (data.next_start == null || data.next_start <= start) break;
    start = data.next_start;
  }
  return items;
}

// POST /api/userp/sync/empreendimentos
// Campos reais da API: empreendimento_id (int), empreendimento (string)
router.post('/empreendimentos', async (req, res) => {
  const { email, senha, userp_base_url } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });

  try {
    const token = await getUserpToken(email, senha, userp_base_url);
    const items = await fetchAllPages(token, '/api/userp-satelite/empreendimentos/index.php', {}, userp_base_url);

    let inserted = 0, updated = 0, skipped = 0;
    for (const item of items) {
      const nome = item.empreendimento;
      const userpId = item.empreendimento_id;
      if (!nome || !userpId) { skipped++; continue; }

      // Busca por userp_id primeiro (mais preciso), depois por fase como fallback
      const { rows } = await pool.query(
        `SELECT id FROM empreendimentos WHERE userp_id = $1`,
        [userpId]
      );
      if (rows.length > 0) {
        await pool.query(
          `UPDATE empreendimentos SET nome = $1 WHERE id = $2`,
          [nome, rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO empreendimentos (nome, fase, userp_id) VALUES ($1, $2, $3)`,
          [nome, String(userpId), userpId]
        );
        inserted++;
      }
    }

    res.json({ success: true, total: items.length, inserted, updated, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/unidades
// "Unidade" no Userp = "Acesso" no sistema local
// Campos reais da API: unidade_id (int), unidade (string), empreendimento_id (int)
router.post('/unidades', async (req, res) => {
  const { email, senha, userp_base_url } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });

  try {
    const token = await getUserpToken(email, senha, userp_base_url);
    const items = await fetchAllPages(token, '/api/userp-satelite/unidades/index.php', {}, userp_base_url);

    let inserted = 0, updated = 0, skipped = 0;
    for (const item of items) {
      const nome = item.unidade;
      const userpId = item.unidade_id;
      const userpEmpId = item.empreendimento_id;
      if (!nome || !userpId) { skipped++; continue; }

      // Buscar empreendimento local pelo userp_id
      const { rows: empRows } = await pool.query(
        `SELECT id FROM empreendimentos WHERE userp_id = $1`,
        [userpEmpId]
      );
      const empreendimento_id = empRows[0]?.id || null;

      if (!empreendimento_id) { skipped++; continue; }

      // Upsert em acessos por userp_id
      const { rows } = await pool.query(
        `SELECT id FROM acessos WHERE userp_id = $1`,
        [userpId]
      );

      if (rows.length > 0) {
        await pool.query(
          `UPDATE acessos SET nome = $1, empreendimento_id = $2 WHERE id = $3`,
          [nome, empreendimento_id, rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO acessos (nome, empreendimento_id, userp_id) VALUES ($1, $2, $3)`,
          [nome, empreendimento_id, userpId]
        );
        inserted++;
      }
    }

    res.json({ success: true, total: items.length, inserted, updated, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/usuarios
// Campos reais da API: usuario_id, usuario_nome, usuario_fone, usuario_foto,
//                      empreendimento_id, unidade_id, vigencia_inicio, vigencia_fim,
//                      unidades_acesso: [{unidade_acesso_id, unidade_acesso_nome}, ...]
router.post('/usuarios', async (req, res) => {
  const { email, senha, userp_base_url } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });

  try {
    const token = await getUserpToken(email, senha, userp_base_url);
    const items = await fetchAllPages(token, '/api/userp-satelite/usuarios/index.php', {}, userp_base_url);

    // Conjunto de userp_ids que vieram da API — para detectar excluídos
    const userpIdsRecebidos = new Set(items.map(i => String(i.usuario_id)).filter(Boolean));

    let inserted = 0, updated = 0, skipped = 0, deleted = 0;
    for (const item of items) {
      if (!item.usuario_id || !item.usuario_nome) { skipped++; continue; }

      const userpId   = item.usuario_id;
      const nome      = item.usuario_nome;
      const fone      = item.usuario_fone || null;
      const matricula = String(userpId);
      const vigIni    = item.vigencia_inicio || null;
      const vigFim    = item.vigencia_fim    || null;

      // Buscar empreendimento local pelo userp_id para poder criar acessos automaticamente
      let empreendimento_id_local = null;
      if (item.empreendimento_id) {
        const { rows: empRows } = await pool.query(
          `SELECT id FROM empreendimentos WHERE userp_id = $1`, [item.empreendimento_id]
        );
        empreendimento_id_local = empRows[0]?.id || null;
      }

      // Construir lista completa de acessos: unidade_id + todas as unidades_acesso
      // Ambos são acessos válidos para o usuário
      const todosAcessosUserp = [];
      if (item.unidade_id) {
        todosAcessosUserp.push({ id: item.unidade_id, nome: item.unidade || `Unidade ${item.unidade_id}` });
      }
      for (const ua of (Array.isArray(item.unidades_acesso) ? item.unidades_acesso : [])) {
        if (ua.unidade_acesso_id && ua.unidade_acesso_nome) {
          // evitar duplicata se unidade_id == unidade_acesso_id
          if (!todosAcessosUserp.find(x => x.id === ua.unidade_acesso_id)) {
            todosAcessosUserp.push({ id: ua.unidade_acesso_id, nome: ua.unidade_acesso_nome });
          }
        }
      }

      // Resolver IDs locais — criar automaticamente se não existir
      const acessoIdsLocais = [];
      for (const ua of todosAcessosUserp) {
        const { rows: aRows } = await pool.query(
          `SELECT id FROM acessos WHERE userp_id = $1`, [ua.id]
        );
        if (aRows[0]?.id) {
          acessoIdsLocais.push(aRows[0].id);
        } else if (empreendimento_id_local) {
          const { rows: newAcesso } = await pool.query(
            `INSERT INTO acessos (nome, empreendimento_id, userp_id) VALUES ($1, $2, $3) RETURNING id`,
            [ua.nome, empreendimento_id_local, ua.id]
          );
          acessoIdsLocais.push(newAcesso[0].id);
        }
        // Se não há empreendimento local correspondente, ignora o acesso (sem erro)
      }

      // Foto — usuario_foto é base64 pura (JPEG começa com /9j/, PNG com iVBO)
      let foto_base64 = null;
      if (item.usuario_foto) {
        const raw = item.usuario_foto;
        if (raw.startsWith('data:image')) {
          foto_base64 = raw;
        } else if (raw.startsWith('/9j/') || raw.startsWith('iVBO')) {
          foto_base64 = `data:image/jpeg;base64,${raw}`;
        } else if (!raw.startsWith('http') && raw.length > 100) {
          foto_base64 = `data:image/jpeg;base64,${raw}`;
        }
      }

      const { rows } = await pool.query(
        `SELECT id FROM usuarios WHERE userp_id = $1`,
        [userpId]
      );

      let usuarioId;
      if (rows.length > 0) {
        usuarioId = rows[0].id;
        await pool.query(
          `UPDATE usuarios SET nome=$1, fone=$2, vigencia_inicio=$3, vigencia_fim=$4
           ${foto_base64 ? ', foto_base64=$6' : ''}
           WHERE id=$5`,
          foto_base64
            ? [nome, fone, vigIni, vigFim, usuarioId, foto_base64]
            : [nome, fone, vigIni, vigFim, usuarioId]
        );
        updated++;
      } else {
        const { rows: newRows } = await pool.query(
          `INSERT INTO usuarios (nome, matricula, userp_id, fone, vigencia_inicio, vigencia_fim, foto_base64)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [nome, matricula, userpId, fone, vigIni, vigFim, foto_base64]
        );
        usuarioId = newRows[0].id;
        inserted++;
      }

      // Sincronizar acessos: upsert todos os da lista e remover os que não estão mais
      if (acessoIdsLocais.length > 0) {
        // Remover acessos que não estão na nova lista
        await pool.query(
          `DELETE FROM usuario_acessos WHERE usuario_id=$1 AND acesso_id != ALL($2::uuid[])`,
          [usuarioId, acessoIdsLocais]
        );
        // Upsert cada acesso da lista
        for (const acessoId of acessoIdsLocais) {
          await pool.query(
            `INSERT INTO usuario_acessos (usuario_id, acesso_id, data_inicio, data_fim)
             VALUES ($1,$2,$3,$4) ON CONFLICT (usuario_id,acesso_id)
             DO UPDATE SET data_inicio=$3, data_fim=$4`,
            [usuarioId, acessoId, vigIni, vigFim]
          );
        }
      }
    }

    // Marcar como deleted_by_sync usuários com userp_id que NÃO vieram na lista
    // (só afeta usuários com userp_id preenchido — ignorar usuários criados manualmente)
    if (userpIdsRecebidos.size > 0) {
      const { rows: toDelete } = await pool.query(
        `SELECT id FROM usuarios
         WHERE userp_id IS NOT NULL
           AND deleted_by_sync = false
           AND userp_id != ALL($1::text[])`,
        [Array.from(userpIdsRecebidos).map(String)]
      );
      for (const row of toDelete) {
        await pool.query(
          `UPDATE usuarios SET deleted_by_sync=true, deleted_by_sync_at=now(), updated_at=now() WHERE id=$1`,
          [row.id]
        );
        // Remover todos os acessos do usuário excluído
        await pool.query(`DELETE FROM usuario_acessos WHERE usuario_id=$1`, [row.id]);
        deleted++;
      }
      // Reativar usuários que voltaram na lista (caso tenham sido marcados antes)
      for (const userpId of userpIdsRecebidos) {
        await pool.query(
          `UPDATE usuarios SET deleted_by_sync=false, deleted_by_sync_at=null WHERE userp_id=$1 AND deleted_by_sync=true`,
          [String(userpId)]
        );
      }
    }

    res.json({ success: true, total: items.length, inserted, updated, skipped, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/preview-usuario
// Busca um usuário específico no Userp por userp_id e retorna comparação com dados locais
router.post('/preview-usuario', async (req, res) => {
  const { email, senha, usuario_local_id, userp_base_url } = req.body;
  if (!email || !senha || !usuario_local_id) {
    return res.status(400).json({ error: 'email, senha e usuario_local_id obrigatórios' });
  }

  try {
    // Buscar usuário local
    const { rows: localRows } = await pool.query(
      `SELECT u.id, u.nome, u.matricula, u.fone, u.userp_id, u.vigencia_inicio, u.vigencia_fim,
              u.foto_base64 IS NOT NULL AS tem_foto,
              COALESCE(json_agg(json_build_object(
                'id', a.id, 'nome', a.nome,
                'empreendimento', e.nome,
                'data_inicio', ua.data_inicio,
                'data_fim', ua.data_fim
              ) ORDER BY a.nome) FILTER (WHERE a.id IS NOT NULL), '[]') AS acessos
       FROM usuarios u
       LEFT JOIN usuario_acessos ua ON ua.usuario_id = u.id
       LEFT JOIN acessos a ON a.id = ua.acesso_id
       LEFT JOIN empreendimentos e ON e.id = a.empreendimento_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [usuario_local_id]
    );

    if (!localRows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    const local = localRows[0];

    // Buscar dados no Userp — por userp_id se disponível, senão por matrícula
    const token = await getUserpToken(email, senha, userp_base_url);
    const url = new URL(`${getUserpBase(userp_base_url)}/api/userp-satelite/usuarios/index.php`);
    url.searchParams.set('start', '0');
    url.searchParams.set('limit', '10');

    if (local.userp_id) {
      url.searchParams.set('usuario_id', String(local.userp_id));
    } else if (local.matricula) {
      url.searchParams.set('usuario_id', String(local.matricula));
    } else {
      return res.status(400).json({ error: 'Usuário sem userp_id e sem matrícula — não é possível identificar no Userp' });
    }

    const userpRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const userpData = await userpRes.json();
    if (!userpRes.ok) throw new Error(userpData.message || `Erro HTTP ${userpRes.status}`);

    const userpItem = userpData.items?.[0] || null;
    if (!userpItem) {
      return res.status(404).json({ error: `Usuário não encontrado na API Userp (matrícula=${local.matricula})` });
    }

    // Buscar acesso local correspondente à unidade do Userp
    let acessoUserp = null;
    if (userpItem.unidade_id) {
      const { rows: aRows } = await pool.query(
        `SELECT a.id, a.nome, e.nome AS empreendimento
         FROM acessos a
         LEFT JOIN empreendimentos e ON e.id = a.empreendimento_id
         WHERE a.userp_id = $1`,
        [userpItem.unidade_id]
      );
      if (aRows.length) acessoUserp = aRows[0];
    }

    // Buscar nome do empreendimento pelo empreendimento_id do Userp
    let empNomeUserp = null;
    if (userpItem.empreendimento_id) {
      const { rows: empRows } = await pool.query(
        `SELECT nome FROM empreendimentos WHERE userp_id = $1`,
        [userpItem.empreendimento_id]
      );
      empNomeUserp = empRows[0]?.nome || `ID ${userpItem.empreendimento_id}`;
    }

    res.json({
      userp: {
        usuario_id: userpItem.usuario_id,
        nome: userpItem.usuario_nome,
        fone: userpItem.usuario_fone,
        foto_url: userpItem.usuario_foto,
        empreendimento_id: userpItem.empreendimento_id,
        empreendimento_nome: empNomeUserp,
        unidade_id: userpItem.unidade_id,
        unidade_nome: acessoUserp?.nome || null,
        vigencia_inicio: userpItem.vigencia_inicio,
        vigencia_fim: userpItem.vigencia_fim,
        unidades_acesso: (() => {
          // Combinar unidade_id + unidades_acesso como lista única de acessos
          const lista = [];
          if (userpItem.unidade_id) {
            lista.push({ unidade_acesso_id: userpItem.unidade_id, unidade_acesso_nome: userpItem.unidade || acessoUserp?.nome || `Unidade ${userpItem.unidade_id}` });
          }
          for (const ua of (userpItem.unidades_acesso || [])) {
            if (ua.unidade_acesso_id && !lista.find(x => x.unidade_acesso_id === ua.unidade_acesso_id)) {
              lista.push(ua);
            }
          }
          return lista;
        })(),
      },
      local: {
        id: local.id,
        nome: local.nome,
        matricula: local.matricula,
        fone: local.fone,
        userp_id: local.userp_id,
        vigencia_inicio: local.vigencia_inicio,
        vigencia_fim: local.vigencia_fim,
        tem_foto: local.tem_foto,
        acessos: local.acessos,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/apply-usuario
// Aplica atualização de um usuário específico do Userp para o sistema local
router.post('/apply-usuario', async (req, res) => {
  const { email, senha, usuario_local_id, userp_base_url } = req.body;
  if (!email || !senha || !usuario_local_id) {
    return res.status(400).json({ error: 'email, senha e usuario_local_id obrigatórios' });
  }

  try {
    const { rows: localRows } = await pool.query(
      `SELECT id, userp_id FROM usuarios WHERE id = $1`, [usuario_local_id]
    );
    if (!localRows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    const local = localRows[0];
    if (!local.userp_id) return res.status(400).json({ error: 'Usuário sem userp_id' });

    const token = await getUserpToken(email, senha, userp_base_url);
    const url = new URL(`${getUserpBase(userp_base_url)}/api/userp-satelite/usuarios/index.php`);
    url.searchParams.set('start', '0');
    url.searchParams.set('limit', '10');
    url.searchParams.set('usuario_id', String(local.userp_id));

    const userpRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const userpData = await userpRes.json();
    if (!userpRes.ok) throw new Error(userpData.message || `Erro HTTP ${userpRes.status}`);

    const item = userpData.items?.[0];
    if (!item) return res.status(404).json({ error: 'Usuário não encontrado no Userp' });

    const nome   = item.usuario_nome;
    const fone   = item.usuario_fone || null;
    const vigIni = item.vigencia_inicio || null;
    const vigFim = item.vigencia_fim || null;

    // Foto — usuario_foto é base64 pura
    let foto_base64 = null;
    if (item.usuario_foto) {
      const raw = item.usuario_foto;
      if (raw.startsWith('data:image')) {
        foto_base64 = raw;
      } else if (raw.startsWith('/9j/') || raw.startsWith('iVBO')) {
        foto_base64 = `data:image/jpeg;base64,${raw}`;
      } else if (!raw.startsWith('http') && raw.length > 100) {
        foto_base64 = `data:image/jpeg;base64,${raw}`;
      }
    }

    // Buscar empreendimento local para criar acessos automaticamente
    let empIdLocal = null;
    if (item.empreendimento_id) {
      const { rows: eRows } = await pool.query(
        `SELECT id FROM empreendimentos WHERE userp_id = $1`, [item.empreendimento_id]
      );
      empIdLocal = eRows[0]?.id || null;
    }

    // Construir lista completa: unidade_id + unidades_acesso
    const todosAcessos = [];
    if (item.unidade_id) {
      todosAcessos.push({ id: item.unidade_id, nome: item.unidade || `Unidade ${item.unidade_id}` });
    }
    for (const ua of (Array.isArray(item.unidades_acesso) ? item.unidades_acesso : [])) {
      if (ua.unidade_acesso_id && ua.unidade_acesso_nome) {
        if (!todosAcessos.find(x => x.id === ua.unidade_acesso_id)) {
          todosAcessos.push({ id: ua.unidade_acesso_id, nome: ua.unidade_acesso_nome });
        }
      }
    }

    // Resolver IDs locais — criar automaticamente se não existir
    const acessoIdsLocais = [];
    for (const ua of todosAcessos) {
      const { rows: aRows } = await pool.query(
        `SELECT id FROM acessos WHERE userp_id = $1`, [ua.id]
      );
      if (aRows[0]?.id) {
        acessoIdsLocais.push(aRows[0].id);
      } else {
        const { rows: newA } = await pool.query(
          `INSERT INTO acessos (nome, empreendimento_id, userp_id) VALUES ($1, $2, $3) RETURNING id`,
          [ua.nome, empIdLocal, ua.id]
        );
        acessoIdsLocais.push(newA[0].id);
      }
    }

    // Atualizar usuário
    await pool.query(
      `UPDATE usuarios SET nome=$1, fone=$2, vigencia_inicio=$3, vigencia_fim=$4
       ${foto_base64 ? ', foto_base64=$6' : ''}
       WHERE id=$5`,
      foto_base64
        ? [nome, fone, vigIni, vigFim, local.id, foto_base64]
        : [nome, fone, vigIni, vigFim, local.id]
    );

    // Sincronizar acessos: upsert todos + remover os que não estão mais
    if (acessoIdsLocais.length > 0) {
      await pool.query(
        `DELETE FROM usuario_acessos WHERE usuario_id=$1 AND acesso_id != ALL($2::uuid[])`,
        [local.id, acessoIdsLocais]
      );
      for (const acessoId of acessoIdsLocais) {
        await pool.query(
          `INSERT INTO usuario_acessos (usuario_id, acesso_id, data_inicio, data_fim)
           VALUES ($1,$2,$3,$4) ON CONFLICT (usuario_id,acesso_id)
           DO UPDATE SET data_inicio=$3, data_fim=$4`,
          [local.id, acessoId, vigIni, vigFim]
        );
      }
    }

    res.json({ success: true, foto_atualizada: !!foto_base64, acessos_vinculados: acessoIdsLocais.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/debug-usuario — retorna resposta bruta da API Userp para um usuario_id
router.post('/debug-usuario', async (req, res) => {
  const { email, senha, usuario_id } = req.body;
  if (!email || !senha || !usuario_id) return res.status(400).json({ error: 'email, senha e usuario_id obrigatórios' });
  try {
    const token = await getUserpToken(email, senha);
    const url = new URL(`${getUserpBase()}/api/userp-satelite/usuarios/index.php`);
    url.searchParams.set('start', '0');
    url.searchParams.set('limit', '10');
    url.searchParams.set('usuario_id', String(usuario_id));
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    // Retornar apenas campos relevantes (sem foto base64 que é gigante)
    const items = (data.items || []).map(item => ({
      usuario_id: item.usuario_id,
      usuario_nome: item.usuario_nome,
      usuario_fone: item.usuario_fone,
      empreendimento_id: item.empreendimento_id,
      unidade_id: item.unidade_id,
      vigencia_inicio: item.vigencia_inicio,
      vigencia_fim: item.vigencia_fim,
      unidades_acesso: item.unidades_acesso,
      tem_foto: !!item.usuario_foto,
    }));
    res.json({ total: data.total, has_more: data.has_more, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/funcionarios — lista funcionários do Userp (paginado)
router.post('/funcionarios', async (req, res) => {
  const { email, senha, userp_base_url, start = 0, limit = 100, nome } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });
  try {
    const token = await getUserpToken(email, senha, userp_base_url);
    const USERP_BASE = getUserpBase(userp_base_url);
    const url = new URL(`${USERP_BASE}/api/userp-satelite/funcionarios/index.php`);
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort_field', 'nome');
    url.searchParams.set('sort_dir', 'ASC');
    if (nome) url.searchParams.set('nome', nome);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `Erro HTTP ${resp.status}`);
    res.json({ total: data.total, has_more: data.has_more, next_start: data.next_start, items: data.items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/userp/sync/funcionarios/sync-foto — envia foto de um funcionário para o Userp
router.post('/funcionarios/sync-foto', async (req, res) => {
  const { email, senha, userp_base_url, funcionario_id, foto_base64 } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });
  if (!funcionario_id || !foto_base64) return res.status(400).json({ error: 'funcionario_id e foto_base64 obrigatórios' });
  try {
    const token = await getUserpToken(email, senha, userp_base_url);
    const USERP_BASE = getUserpBase(userp_base_url);
    // Remover prefixo data URI se presente — API aceita apenas base64 pura
    const base64Pura = foto_base64.replace(/^data:image\/[a-z]+;base64,/i, '');
    const resp = await fetch(`${USERP_BASE}/api/userp-satelite/funcionarios/update-foto.php`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ funcionario_id: Number(funcionario_id), funcionario_foto: base64Pura }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `Erro HTTP ${resp.status}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
