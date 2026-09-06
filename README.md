# TENAS • PROSPECÇÃO SAÚDE V3

Dashboard/mini CRM para prospecção de profissionais da saúde.

## O que esta versão faz

- Dashboard com métricas e pipeline.
- Prospect A/B/C fixados no painel.
- Cadastro de doutoras/profissionais da saúde.
- Médicas, dentistas, enfermeiras e outros.
- Upload de prints de anúncio, perfil e conversa.
- Análise por IA via endpoint `/api/analyze`.
- A IA pode:
  - ler os prints;
  - sugerir @, nome, profissão, especialidade, cidade e contato quando estiverem visíveis;
  - identificar sinais de anúncio/agência;
  - sugerir prioridade A/B/C;
  - dar próxima ação comercial;
  - sugerir a próxima mensagem.
- Botão separado para "Analisar prints com IA" e "Me diga a próxima ação".
- Follow-ups.
- Histórico comercial.
- CSV.

## PUBLICAR NO VERCEL AGORA

### 1. GitHub
Crie um repositório, por exemplo:
`tenas-prospeccao-saude`

Suba:
- `index.html`
- pasta `api/`
  - `analyze.js`
- `README.md`

### 2. Vercel
Importe o repositório no Vercel.

Não precisa de framework nem build command.

### 3. Variável de ambiente OBRIGATÓRIA para a IA
No projeto Vercel:
Settings → Environment Variables

Adicione:
`OPENAI_API_KEY`

Valor:
sua chave da API.

Opcional:
`OPENAI_MODEL`
Valor padrão já usado: `gpt-5.6-luna`

Depois faça um novo Deploy/Redeploy.

## IMPORTANTE: segurança
A chave da API nunca deve ser colocada no `index.html`.
Ela fica somente no servidor em `process.env.OPENAI_API_KEY`.

## Dados locais
A versão atual guarda registros e imagens no navegador (localStorage). Isso permite usar imediatamente, mas não sincroniza automaticamente entre computador e celular.

Para uma V4 profissional:
- Supabase/Postgres para dados;
- Storage para prints;
- autenticação;
- histórico de alterações;
- IA persistente por lead;
- acesso em qualquer dispositivo.

## Limite das imagens
A IA recebe até 12 imagens por análise para evitar chamadas exageradamente grandes.
