
-- Add fase column
ALTER TABLE public.empreendimentos ADD COLUMN fase TEXT;

-- Drop restrictive policies and recreate as permissive
DROP POLICY "Authenticated users can read empreendimentos" ON public.empreendimentos;
DROP POLICY "Admins can manage empreendimentos" ON public.empreendimentos;

CREATE POLICY "Authenticated users can read empreendimentos" ON public.empreendimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert empreendimentos" ON public.empreendimentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update empreendimentos" ON public.empreendimentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete empreendimentos" ON public.empreendimentos FOR DELETE TO authenticated USING (true);

-- Fix acessos policies too
DROP POLICY "Authenticated users can read acessos" ON public.acessos;
DROP POLICY "Admins can manage acessos" ON public.acessos;

CREATE POLICY "Authenticated users can read acessos" ON public.acessos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert acessos" ON public.acessos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update acessos" ON public.acessos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete acessos" ON public.acessos FOR DELETE TO authenticated USING (true);

-- Fix equipamentos policies
DROP POLICY "Authenticated users can read equipamentos" ON public.equipamentos;
DROP POLICY "Admins can manage equipamentos" ON public.equipamentos;

CREATE POLICY "Authenticated users can read equipamentos" ON public.equipamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipamentos" ON public.equipamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipamentos" ON public.equipamentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete equipamentos" ON public.equipamentos FOR DELETE TO authenticated USING (true);

-- Fix usuarios policies
DROP POLICY "Authenticated users can read usuarios" ON public.usuarios;
DROP POLICY "Admins can manage usuarios" ON public.usuarios;

CREATE POLICY "Authenticated users can read usuarios" ON public.usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert usuarios" ON public.usuarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update usuarios" ON public.usuarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete usuarios" ON public.usuarios FOR DELETE TO authenticated USING (true);
