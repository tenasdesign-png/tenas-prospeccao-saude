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


## V3.1 — correções da IA
- A análise agora retorna também `message` e `nextAction`.
- A mensagem sugerida é preenchida automaticamente no campo de mensagem.
- A IA tenta ler cidade/UF a partir de bio, anúncio, endereço e demais textos visíveis, sem inventar.
- A gravação automática preserva mensagem, próxima ação, observações, follow-up e prints.
- Se a cidade não estiver visível com segurança, o campo permanece vazio.

---

# Gerador Inteligente de Bios (ferramenta pública)

Página pública: **`/bio`** (ex.: `https://SEU-PROJETO.vercel.app/bio`). É esse link que vai no Direct.

Arquivos:
- `bio/index.html` — formulário em 3 etapas + tela de resultado (mobile first).
- `api/bio.js` — análise do print e geração das bios (Gemini, chave só no servidor).
- `api/bio-config.js` — entrega ao navegador apenas configurações públicas (WhatsApp, limites).
- `vercel.json` — dá até 60 s para a geração.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Uso |
|---|---|---|
| `GEMINI_API_KEY` | sim | Mesma chave usada pelo CRM. |
| `TENAS_WHATSAPP` | não | Número do WhatsApp com DDI e DDD, só dígitos. Padrão: WhatsApp oficial da Tenas (`5583991192672`). |
| `TENAS_WHATSAPP_MESSAGE` | não | Substitui a mensagem inicial do WhatsApp. |
| `BIO_CHAR_LIMIT` | não | Limite de caracteres da bio (padrão 150, o atual do Instagram). |
| `BIO_RATE_LIMIT` | não | Pedidos por IP a cada 10 min (padrão 25). |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | não | Modelos usados (padrão `gemini-flash-latest` / `gemini-flash-lite-latest`). |

## Como funciona
1. Etapas: Sobre você (nome opcional, profissão, área, objetivo) → Público e atendimento (On-line, Presencial ou Ambos; cidade quando houver presencial) → Sua bio atual (texto colado ou "criar do zero") + estilo.
2. As respostas vão para `/api/bio`, que faz duas chamadas ao Gemini em paralelo: análise (pontos de melhoria, campo Nome, próximos passos) e criação (5 primeiras linhas e 3 bios).
3. O servidor confere o limite de caracteres e pede reescrita automática quando uma versão passa do limite.
4. Se um modelo do Gemini falhar, outro é tentado. Em caso de erro, a página mostra um código curto (CHAVE, LIMITE, MODELO, TEMPO…) e o motivo fica no log do Vercel.
5. No resultado dá para copiar, gerar outra versão de cada bio, gerar novas frases e pedir variações de uma frase selecionada.

## Privacidade
- Nada é salvo: as respostas ficam em memória só durante a requisição e são enviadas ao Gemini para gerar o resultado.
- Não há banco de dados, cadastro, e-mail ou telefone. As respostas ficam apenas no `sessionStorage` do próprio navegador (somem ao fechar a aba).
- O contato comercial só acontece se a pessoa tocar no botão do WhatsApp.
- **Importante:** use a API do Gemini em um **plano pago** (faturamento ativo). No nível gratuito, o Google pode usar o conteúdo enviado para melhorar seus produtos, o que contradiz o aviso de privacidade da página.
