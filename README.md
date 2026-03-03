# 💰 Investment Advisor

Aplicação completa para gerenciamento de carteira de investimentos com suporte a ativos brasileiros e globais.

![Dashboard Preview](./docs/preview.png)

## ✨ Funcionalidades

- 🔐 **Autenticação segura** com JWT + bcrypt
- 📊 **Dashboard interativo** com visão consolidada da carteira
- 💼 **Cadastro de ativos** por classe (Renda Fixa, FIIs, Ações BR, REITs, Ações EUA, Metais)
- 📈 **Cotações em tempo real** via Brapi (BR) + Alpha Vantage (Global)
- ⚖️ **Rebalanceamento automático** com sugestões inteligentes
- 🎯 **Calculadora de aportes** - onde investir para rebalancear
- 📉 **Histórico de transações** com exportação CSV
- 💵 **Projeção de renda passiva** mensal e anual
- 🔄 **Botão de sincronização** para atualizar tudo de uma vez
- 📱 **Responsivo** - funciona em desktop e mobile

## 🛠️ Stack Tecnológica

### Frontend
- React 18 + Vite
- TailwindCSS
- Recharts (gráficos)
- React Router DOM
- Axios
- Lucide Icons

### Backend
- Node.js + Express
- PostgreSQL
- JWT + bcrypt
- Axios (APIs externas)

### APIs de Cotação
- **Brapi** - Ativos brasileiros (gratuito)
- **Alpha Vantage** - Ativos globais (gratuito)

## 🚀 Deploy no Railway

### 1. Criar Projeto no Railway

1. Acesse [railway.app](https://railway.app)
2. Crie um novo projeto
3. Adicione um serviço PostgreSQL

### 2. Deploy do Backend

1. No Railway, clique em "New Service" > "GitHub Repo"
2. Selecione o repositório e aponte para a pasta `/backend`
3. Configure as variáveis de ambiente:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=sua-chave-secreta-muito-segura-min-32-chars
FRONTEND_URL=https://seu-frontend.railway.app
BRAPI_TOKEN=seu-token-opcional
ALPHAVANTAGE_KEY=sua-key-opcional
```

4. Em Settings > Build, defina:
   - Root Directory: `backend`
   - Build Command: `npm ci`
   - Start Command: `npm run db:migrate && npm start`

### 3. Deploy do Frontend

1. Adicione outro serviço GitHub
2. Configure as variáveis:

```env
VITE_API_URL=https://seu-backend.railway.app/api
```

3. Em Settings > Build:
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Start Command: (usa Dockerfile)

### 4. Configurar Domínios

1. No Railway, vá em Settings de cada serviço
2. Gere um domínio público ou configure um domínio próprio

## 💻 Desenvolvimento Local

### Pré-requisitos

- Node.js 18+
- Docker e Docker Compose (recomendado)
- PostgreSQL (se não usar Docker)

### Com Docker (Recomendado)

```bash
# Clonar repositório
git clone https://github.com/seu-usuario/investment-advisor.git
cd investment-advisor

# Subir todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f

# Acessar
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
# Banco: localhost:5432
```

### Sem Docker

```bash
# 1. Configurar banco PostgreSQL local
createdb investment_advisor

# 2. Backend
cd backend
cp .env.example .env
# Editar .env com suas credenciais
npm install
npm run db:migrate
npm run dev

# 3. Frontend (outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## 📁 Estrutura do Projeto

```
investment-advisor/
├── frontend/                # React + Vite
│   ├── src/
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── contexts/        # Context API (Auth)
│   │   ├── pages/           # Páginas da aplicação
│   │   ├── services/        # Chamadas à API
│   │   └── hooks/           # Custom hooks
│   ├── Dockerfile           # Produção
│   └── Dockerfile.dev       # Desenvolvimento
│
├── backend/                 # Node.js + Express
│   ├── src/
│   │   ├── config/          # Configurações (DB, migrations)
│   │   ├── controllers/     # Lógica dos endpoints
│   │   ├── middleware/      # Auth, validações
│   │   ├── routes/          # Definição de rotas
│   │   ├── services/        # Lógica de negócio
│   │   └── server.js        # Entry point
│   └── Dockerfile
│
├── database/                # Scripts SQL extras
├── docker-compose.yml       # Ambiente local
└── README.md
```

## 🔑 Obtendo API Keys

### Brapi (Gratuito)
1. Acesse [brapi.dev](https://brapi.dev)
2. Crie uma conta
3. Copie seu token

### Alpha Vantage (Gratuito)
1. Acesse [alphavantage.co](https://www.alphavantage.co/support/#api-key)
2. Preencha o formulário
3. Receba a key por email

## 📖 Endpoints da API

### Autenticação
- `POST /api/auth/register` - Criar conta
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuário atual

### Classes de Ativos
- `GET /api/classes` - Listar classes
- `POST /api/classes` - Criar classe
- `PUT /api/classes/:id` - Atualizar
- `DELETE /api/classes/:id` - Excluir

### Ativos
- `GET /api/assets` - Listar ativos
- `POST /api/assets` - Cadastrar ativo
- `PUT /api/assets/:id` - Atualizar
- `DELETE /api/assets/:id` - Excluir
- `POST /api/assets/:id/transaction` - Registrar compra/venda

### Portfólio
- `GET /api/portfolio/dashboard` - Dashboard completo
- `POST /api/portfolio/sync` - **Sincronizar tudo** (cotações + rebalanceamento)
- `GET /api/portfolio/rebalance` - Sugestões de rebalanceamento
- `POST /api/portfolio/contribution` - Calcular onde aportar
- `GET /api/portfolio/projection` - Projeção de patrimônio

### Configurações
- `GET /api/settings` - Obter configurações
- `PUT /api/settings` - Atualizar
- `GET /api/settings/export` - Exportar dados (backup)
- `POST /api/settings/import` - Importar dados

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é apenas para fins educacionais.

---

Desenvolvido com ❤️ para gerenciamento de investimentos
