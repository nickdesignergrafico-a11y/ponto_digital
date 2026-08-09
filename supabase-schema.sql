-- =====================================================================
-- SCHEMA DE BANCO DE DADOS SUPABASE - SISTEMA DE GESTÃO DE RECURSOS HUMANOS (RH)
-- =====================================================================
-- Este script configura toda a estrutura do PostgreSQL no Supabase,
-- incluindo enums, tabelas, índices, Row Level Security (RLS) e triggers.

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. ENUMS E TIPOS CUSTOMIZADOS (DE FORMA IDEMPOTENTE / RESILIENTE)
-- =====================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_type AS ENUM ('entry', 'lunch_out', 'lunch_in', 'exit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_type AS ENUM ('vacation', 'allowance', 'per_diem', 'shift_swap');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- 2. CRIAÇÃO DAS TABELAS
-- =====================================================================

-- Tabela de Configuração da Empresa (Registro Único)
CREATE TABLE IF NOT EXISTS public.company_config (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Garante registro único
    name text NOT NULL,
    cnpj text,
    address text,
    contact text,
    logo_url text,
    email text,
    meal_ticket_value numeric(10, 2) DEFAULT 0.00,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Profiles (Integrada com o auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    cpf text UNIQUE NOT NULL,
    employee_id text,
    name text NOT NULL,
    email text UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'employee'::user_role,
    department text,
    salary numeric(10, 2) DEFAULT 0.00,
    benefits text[] DEFAULT '{}'::text[],
    active boolean NOT NULL DEFAULT true,
    work_scale text DEFAULT 'default',
    photo_url text,
    phone text,
    address text,
    birth_date date,
    signature_url text,
    admission_date date,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Registros de Ponto (Attendance)
CREATE TABLE IF NOT EXISTS public.attendance (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_name text NOT NULL,
    type attendance_type NOT NULL,
    timestamp timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    signature text,
    location jsonb, -- { "latitude": -23.123, "longitude": -46.123 }
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Solicitações (Férias, Abonos, Troca de Escala)
CREATE TABLE IF NOT EXISTS public.requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user_name text NOT NULL,
    type request_type NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text NOT NULL,
    status request_status NOT NULL DEFAULT 'pending'::request_status,
    response text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Diárias (Daily Allowances / Despesas)
CREATE TABLE IF NOT EXISTS public.diarias (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
    description text NOT NULL,
    status request_status NOT NULL DEFAULT 'pending'::request_status,
    date date NOT NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Holerites / Folhas de Pagamento (Salary Slips)
CREATE TABLE IF NOT EXISTS public.salary_slips (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    year integer NOT NULL,
    base_salary numeric(10, 2) NOT NULL CHECK (base_salary >= 0),
    taxes jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array: [ { "name": "INSS", "amount": 120, "type": "deduction" } ]
    discounts jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array: [ { "name": "Falta", "amount": 80 } ]
    net_salary numeric(10, 2) NOT NULL CHECK (net_salary >= 0),
    signed boolean NOT NULL DEFAULT false,
    signature text,
    issued_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, month, year) -- Impede holerites duplicados para o mesmo mês/ano
);

-- Tabela de Pedidos / Compras (Orders)
-- "orders" é palavra reservada em muitos analisadores SQL, protegemos com aspas duplas
CREATE TABLE IF NOT EXISTS public."orders" (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status order_status NOT NULL DEFAULT 'pending'::order_status,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Notificações
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type notification_type NOT NULL DEFAULT 'info'::notification_type,
    read boolean NOT NULL DEFAULT false,
    link text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================================
-- 3. CRIAÇÃO DE ÍNDICES DE DESEMPENHO
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);
CREATE INDEX IF NOT EXISTS idx_attendance_user_timestamp ON public.attendance(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_user ON public.requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_dates ON public.requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_salary_slips_user_date ON public.salary_slips(user_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE (read = false);

-- =====================================================================
-- 4. FUNÇÕES AUXILIARES DE SEGURANÇA (SECURITY DEFINER)
-- =====================================================================

-- Função para verificar se o usuário atual é admin sem causar recursão infinita no RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  );
END;
$$;

-- =====================================================================
-- 5. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS
-- =====================================================================

ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- --- POLÍTICAS: public.company_config ---
DROP POLICY IF EXISTS "Qualquer usuário logado pode ler as configurações da empresa" ON public.company_config;
CREATE POLICY "Qualquer usuário logado pode ler as configurações da empresa" ON public.company_config
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Apenas administradores podem gerenciar configurações da empresa" ON public.company_config;
CREATE POLICY "Apenas administradores podem gerenciar configurações da empresa" ON public.company_config
    FOR ALL TO authenticated USING (public.is_admin());

-- --- POLÍTICAS: public.profiles ---
DROP POLICY IF EXISTS "Usuários podem visualizar o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem visualizar o próprio perfil" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Apenas administradores podem inserir perfis" ON public.profiles;
CREATE POLICY "Apenas administradores podem inserir perfis" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Usuários e administradores podem editar o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários e administradores podem editar o próprio perfil" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Apenas administradores podem excluir perfis" ON public.profiles;
CREATE POLICY "Apenas administradores podem excluir perfis" ON public.profiles
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- POLÍTICAS: public.attendance ---
DROP POLICY IF EXISTS "Usuários podem ver seus próprios pontos, admins veem de todos" ON public.attendance;
CREATE POLICY "Usuários podem ver seus próprios pontos, admins veem de todos" ON public.attendance
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Colaboradores podem registrar seus próprios pontos" ON public.attendance;
CREATE POLICY "Colaboradores podem registrar seus próprios pontos" ON public.attendance
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Apenas administradores podem editar registros de ponto" ON public.attendance;
CREATE POLICY "Apenas administradores podem editar registros de ponto" ON public.attendance
    FOR UPDATE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Apenas administradores podem deletar registros de ponto" ON public.attendance;
CREATE POLICY "Apenas administradores podem deletar registros de ponto" ON public.attendance
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- POLÍTICAS: public.requests ---
DROP POLICY IF EXISTS "Usuários veem suas solicitações, admins veem de todos" ON public.requests;
CREATE POLICY "Usuários veem suas solicitações, admins veem de todos" ON public.requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Colaboradores e admins podem criar solicitações" ON public.requests;
CREATE POLICY "Colaboradores e admins podem criar solicitações" ON public.requests
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Colaboradores podem alterar solicitações se pendentes, admins podem alterar livremente" ON public.requests;
CREATE POLICY "Colaboradores podem alterar solicitações se pendentes, admins podem alterar livremente" ON public.requests
    FOR UPDATE TO authenticated USING (
        (auth.uid() = user_id AND status = 'pending'::public.request_status) OR public.is_admin()
    );

DROP POLICY IF EXISTS "Colaboradores podem deletar solicitações se pendentes, admins podem deletar livremente" ON public.requests;
CREATE POLICY "Colaboradores podem deletar solicitações se pendentes, admins podem deletar livremente" ON public.requests
    FOR DELETE TO authenticated USING (
        (auth.uid() = user_id AND status = 'pending'::public.request_status) OR public.is_admin()
    );

-- --- POLÍTICAS: public.diarias ---
DROP POLICY IF EXISTS "Usuários veem suas diárias, admins veem de todos" ON public.diarias;
CREATE POLICY "Usuários veem suas diárias, admins veem de todos" ON public.diarias
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Colaboradores e admins podem criar solicitações de diárias" ON public.diarias;
CREATE POLICY "Colaboradores e admins podem criar solicitações de diárias" ON public.diarias
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Modificação de diárias sob termos restritos ou por admins" ON public.diarias;
CREATE POLICY "Modificação de diárias sob termos restritos ou por admins" ON public.diarias
    FOR UPDATE TO authenticated USING (
        (auth.uid() = user_id AND status = 'pending'::public.request_status) OR public.is_admin()
    );

DROP POLICY IF EXISTS "Deleção de diárias sob termos restritos ou por admins" ON public.diarias;
CREATE POLICY "Deleção de diárias sob termos restritos ou por admins" ON public.diarias
    FOR DELETE TO authenticated USING (
        (auth.uid() = user_id AND status = 'pending'::public.request_status) OR public.is_admin()
    );

-- --- POLÍTICAS: public.salary_slips ---
DROP POLICY IF EXISTS "Colaboradores visualizam seus próprios holerites, admins de todos" ON public.salary_slips;
CREATE POLICY "Colaboradores visualizam seus próprios holerites, admins de todos" ON public.salary_slips
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Apenas admins criam holerites" ON public.salary_slips;
CREATE POLICY "Apenas admins criam holerites" ON public.salary_slips
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Colaboradores assinam seus próprios holerites, admins editam livremente" ON public.salary_slips;
CREATE POLICY "Colaboradores assinam seus próprios holerites, admins editam livremente" ON public.salary_slips
    FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Apenas admins removem holerites" ON public.salary_slips;
CREATE POLICY "Apenas admins removem holerites" ON public.salary_slips
    FOR DELETE TO authenticated USING (public.is_admin());

-- --- POLÍTICAS: public."orders" ---
DROP POLICY IF EXISTS "Usuários veem e gerenciam seus pedidos, admins gerenciam todos" ON public."orders";
CREATE POLICY "Usuários veem e gerenciam seus pedidos, admins gerenciam todos" ON public."orders"
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Qualquer colaborador autenticado pode criar pedidos" ON public."orders";
CREATE POLICY "Qualquer colaborador autenticado pode criar pedidos" ON public."orders"
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Edição de pedidos pelo criador ou admin" ON public."orders";
CREATE POLICY "Edição de pedidos pelo criador ou admin" ON public."orders"
    FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- --- POLÍTICAS: public.notifications ---
DROP POLICY IF EXISTS "Usuários leem suas próprias notificações" ON public.notifications;
CREATE POLICY "Usuários leem suas próprias notificações" ON public.notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Qualquer um pode mandar notificações públicas ou admins específicas" ON public.notifications;
CREATE POLICY "Qualquer um pode mandar notificações públicas ou admins específicas" ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários atualizam suas notificações (Ex: marcar como lido)" ON public.notifications;
CREATE POLICY "Usuários atualizam suas notificações (Ex: marcar como lido)" ON public.notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- =====================================================================
-- 6. TRIGGERS DE SINCRONIZAÇÃO ENTRE AUTH DO SUPABASE E PUBLIC.PROFILES
-- =====================================================================

-- Função executada automaticamente ao registrar um novo usuário no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    cpf, 
    role, 
    active,
    admission_date,
    department,
    salary
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'Colaborador'),
    COALESCE(new.raw_user_meta_data->>'cpf', ''),
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'employee'::public.user_role),
    true,
    COALESCE((new.raw_user_meta_data->>'admissionDate')::date, CURRENT_DATE),
    COALESCE(new.raw_user_meta_data->>'department', 'Geral'),
    COALESCE((new.raw_user_meta_data->>'salary')::numeric, 0.00)
  );
  RETURN new;
END;
$$;

-- Gatilho de inserção associado (Seguro contra erros de versão do PostgreSQL 14)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 7. IMPORTAR CONFIGURAÇÕES INICIAIS (SEED)
-- =====================================================================
INSERT INTO public.company_config (id, name, cnpj, address, contact, email)
VALUES (1, 'Sua Empresa LTDA', '00.000.000/0001-00', 'Rua Corporativa, 100', '(11) 99999-9999', 'contato@empresa.com.br')
ON CONFLICT (id) DO NOTHING;
