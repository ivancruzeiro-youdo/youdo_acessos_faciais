-- Verificar políticas RLS que podem estar bloqueando a contagem no dashboard
-- Execute no Supabase SQL Editor

-- 1. Verificar se RLS está habilitado nas tabelas
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('empreendimentos', 'acessos', 'equipamentos', 'usuarios')
ORDER BY tablename;

-- 2. Verificar políticas existentes
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('empreendimentos', 'acessos', 'equipamentos', 'usuarios')
ORDER BY tablename, policyname;

-- 3. Contar registros reais (como admin, ignora RLS)
SELECT 
    'empreendimentos' as tabela,
    COUNT(*) as total
FROM empreendimentos
UNION ALL
SELECT 
    'acessos' as tabela,
    COUNT(*) as total
FROM acessos
UNION ALL
SELECT 
    'equipamentos' as tabela,
    COUNT(*) as total
FROM equipamentos
UNION ALL
SELECT 
    'usuarios' as tabela,
    COUNT(*) as total
FROM usuarios;

-- SOLUÇÃO: Se RLS estiver bloqueando, criar políticas de SELECT para todos
-- Descomente e execute se necessário:

-- ALTER TABLE empreendimentos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Permitir SELECT para todos" ON empreendimentos FOR SELECT USING (true);

-- ALTER TABLE acessos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Permitir SELECT para todos" ON acessos FOR SELECT USING (true);

-- ALTER TABLE equipamentos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Permitir SELECT para todos" ON equipamentos FOR SELECT USING (true);

-- ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Permitir SELECT para todos" ON usuarios FOR SELECT USING (true);
