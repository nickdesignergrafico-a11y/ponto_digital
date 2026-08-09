# Guia de Migração para o Supabase ⚡

Este guia contém as instruções passo a passo para configurar o Supabase como seu provedor de banco de dados e autenticação para o **Sistema de Gestão de Colaboradores (RH)**.

---

## 📅 Passo 1: Executar o Schema do Banco de Dados

1. Acesse o painel do seu projeto no **[Supabase](https://supabase.com/)**.
2. No menu lateral, acesse **SQL Editor** > **New Query**.
3. Copie todo o conteúdo do arquivo `supabase-schema.sql` (que está na raiz deste projeto) e cole-o no editor.
4. Clique no botão **Run** no canto inferior direito para criar toda a estrutura (enums, tabelas, índices, Row Level Security e Triggers de sincronização).

---

## 🗝️ Passo 2: Configurar o Provedor de Autenticação (Auth)

O Supabase gerencia o cadastro de usuários e vincula-os automaticamente à tabela `public.profiles` através de uma Trigger (gatilho de banco) incluída no script principal.

Para que as informações extras (CPF, Cargo, Admissão, etc.) sejam injetadas ao cadastrar no RH:
- O sistema de cadastro do RH deve fazer a criação no Auth usando `adminAuthClient` (do Supabase) ou através de `signUp` convencional salvando as informações extras em `options.data` (para persistência no `raw_user_meta_data`).

---

## 📦 Passo 3: Adicionar a Biblioteca do Supabase ao Projeto

Para integrar com o seu frontend em React, instale o SDK oficial do Supabase:

```bash
npm install @supabase/supabase-js
```

---

## 🛠️ Passo 4: Criar o Cliente da Conexão no React

Recomendamos criar o arquivo `/src/lib/supabaseClient.ts` com as seguintes linhas de código:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Atenção: Variáveis do Supabase não configuradas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## ⚙️ Passo 5: Configurar Variáveis de Ambiente (`.env`)

Adicione e popule as variáveis correspondentes no seu arquivo conceitual `.env` de produção e do GitHub:

```env
VITE_SUPABASE_URL=https://seu-id-do-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica-do-supabase
```

---

## 💻 Exemplo Prático de Troca de Consultas (Comparativo)

Quando for migrar suas consultas de Firebase para Supabase, use a tabela comparativa abaixo:

### 🔴 No Firebase (Firestore):
```typescript
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
const querySnapshot = await getDocs(q);
const requests = querySnapshot.docs.map(doc => doc.data());
```

### 🟢 No Supabase:
```typescript
import { supabase } from './supabaseClient';

const { data, error } = await supabase
  .from('requests')
  .select('*')
  .eq('user_id', user.id);

if (error) console.error(error);
const requests = data;
```

Tudo pronto! Com esse Guia e o SQL gerados, sua transição para o Supabase será rápida, robusta, altamente protegida por políticas de segurança RLS no nível do PostgreSQL.
