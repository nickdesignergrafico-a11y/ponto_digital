# Sistema de Gestão de Colaboradores (RH)

Este é um sistema completo de gestão de RH desenvolvido com React, Tailwind CSS e Firebase.

## 🚀 Funcionalidades

- **Dashboard Administrativo:**
  - Gestão de colaboradores (Cadastro, Edição, Exclusão).
  - Gerenciamento de solicitações de férias, abonos e ajustes de ponto.
  - Emissão de holerites em massa.
  - Relatórios de produtividade e presença.
  - Configurações da empresa.

- **Portal do Colaborador:**
  - Registro de ponto digital.
  - Visualização de folha de ponto mensal.
  - Solicitação de férias, abonos e ajustes de ponto.
  - Visualização e assinatura digital de holerites.
  - Consulta de benefícios ativos.
  - Perfil personalizado com foto e assinatura.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React + Vite
- **Estilização:** Tailwind CSS (Modern UI/UX)
- **Database & Auth:** Firebase (Firestore / Authentication)
- **Animações:** Motion (Framer Motion)
- **Ícones:** Lucide React

## 📦 Como rodar localmente

1. Clone o repositório:
   ```bash
   git clone <url-do-repositorio>
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env` na raiz do projeto com suas credenciais do Firebase:
   ```env
   VITE_FIREBASE_API_KEY=seu_api_key
   VITE_FIREBASE_AUTH_DOMAIN=seu_auth_domain
   VITE_FIREBASE_PROJECT_ID=seu_project_id
   VITE_FIREBASE_STORAGE_BUCKET=seu_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
   VITE_FIREBASE_APP_ID=seu_app_id
   ```

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

## 📄 Estrutura do Projeto

- `/src/components/admin`: Telas e componentes de gestão (RH).
- `/src/components/employee`: Telas e componentes do portal do colaborador.
- `/src/components/layout`: Componentes de estrutura (Dashboard, Sidebar).
- `/src/hooks`: Hooks personalizados (Auth, etc).
- `/src/lib`: Configurações de bibliotecas (Firebase, Utils).

## 📝 Licença

Este projeto está sob a licença MIT.
