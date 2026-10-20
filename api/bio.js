// Gerador Inteligente de Bios — Tenas Digital
// Endpoint público: POST /api/bio
//
// Privacidade: as respostas ficam em memória só durante a requisição e são enviadas à IA
// (Vercel AI Gateway) apenas para gerar o resultado. Nada é gravado em disco, banco de
// dados ou log (não registramos respostas nem textos).

const BIO_LIMIT = Number(process.env.BIO_CHAR_LIMIT) || 150;
const NAME_LIMIT = 64;

const PROFESSIONS = [
  "Psicologia", "Medicina", "Nutrição", "Odontologia", "Fisioterapia", "Fonoaudiologia",
  "Enfermagem", "Terapia ocupacional", "Educação física", "Biomedicina", "Farmácia",
  "Estética e cosmetologia", "Veterinária", "Outra profissão da área da saúde"
];
const GOALS = [
  "Atrair mais pacientes.", "Atrair pacientes particulares.", "Ser mais conhecido(a) na minha cidade.",
  "Fortalecer minha autoridade profissional.", "Transmitir mais confiança.", "Divulgar meus atendimentos.",
  "Conseguir mais agendamentos.", "Construir uma marca pessoal forte.", "Estou começando e quero organizar meu perfil."
];
const AUDIENCES = [
  "Mulheres.", "Homens.", "Crianças e adolescentes e suas famílias.", "Casais.", "Adultos em geral.",
  "Idosos.", "Atletas e praticantes de atividade física.", "Empresas e instituições.", "Público geral.", "Outro público."
];
const MODALITIES = ["On-line.", "Presencial."];
const MODALITY_OPTIONS = {
  "On-line.": ["On-line."],
  "Presencial.": ["Presencial."],
  "Ambos: presencial e on-line.": ["Presencial.", "On-line."]
};
const STYLES = [
  "Profissional e acolhedor.", "Elegante e sofisticado.", "Moderno e descontraído.", "Especialista e objetivo.",
  "Próximo e humanizado.", "Criativo e marcante.", "Prefiro que a inteligência artificial escolha."
];
const NO_BIO = "Ainda não tenho bio. Quero criar do zero.";
const DIFFICULTIES = [
  "Não sei o que escrever.",
  "Não explica bem o que eu faço.",
  "Não fica claro para quem eu atendo.",
  "Parece genérica, igual à de todo mundo.",
  "Não transmite confiança ou autoridade.",
  "Não convida a pessoa a agendar.",
  "Tenho muito a dizer e pouco espaço.",
  NO_BIO
];
const VERSION_DEFS = {
  direta: { label: "Direta e estratégica", brief: "Priorize clareza: profissão, área de atuação, público e chamada para ação. Quem lê entende em 3 segundos o que a pessoa faz e para quem." },
  autoral: { label: "Autoral e marcante", brief: "Priorize uma primeira linha diferenciada e uma apresentação com personalidade, sem comprometer a clareza profissional (a profissão ou área precisa continuar compreensível)." },
  acolhedora: { label: "Acolhedora e próxima", brief: "Priorize identificação, linguagem humana e proximidade com o público. Fale com a pessoa que chega ao perfil, sem soar íntimo demais ou pouco profissional." }
};

// ---------- Rate limit simples (por instância, best effort) ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const max = Number(process.env.BIO_RATE_LIMIT) || 25;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

// ---------- Utilidades ----------
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Contagem conservadora: emojis contam como 2, como no contador do Instagram.
const charCount = (s) => (s || "").length;

// "são paulo, sp" / "São Paulo/SP" / "São Paulo - sp" -> "São Paulo - SP"
function formatCity(c) {
  const m = /^(.*?)[\s,\/–-]+([A-Za-z]{2})\.?$/.exec(c);
  return m && m[1].trim() ? `${m[1].trim()} - ${m[2].toUpperCase()}` : c;
}

function validateAnswers(a) {
  const errors = [];
  const out = {
    profession: str(a.profession, 80),
    professionOther: str(a.professionOther, 80),
    specialty: str(a.specialty, 200),
    goal: str(a.goal, 80),
    audience: str(a.audience, 80),
    audienceOther: str(a.audienceOther, 120),
    name: str(a.name, 80),
    // Seleção única no formulário ("Ambos" = presencial e on-line); aceita o formato antigo em lista.
    modalities: MODALITY_OPTIONS[a.modality] ||
      (Array.isArray(a.modalities) ? a.modalities.filter((m) => MODALITIES.includes(m)) : []),
    city: formatCity(str(a.city, 80)),
    style: str(a.style, 80),
    difficulties: Array.isArray(a.difficulties) ? a.difficulties.filter((d) => DIFFICULTIES.includes(d)) : [],
    difficultyText: str(a.difficultyText, 300),
    noBio: false,
    bioText: str(a.bioText, 600)
  };
  if (!PROFESSIONS.includes(out.profession)) errors.push("Selecione sua profissão.");
  if (out.profession === "Outra profissão da área da saúde" && !out.professionOther) errors.push("Informe sua profissão.");
  if (!GOALS.includes(out.goal)) errors.push("Selecione seu principal objetivo.");
  if (!AUDIENCES.includes(out.audience)) errors.push("Selecione o público que deseja atrair.");
  if (out.audience === "Outro público." && !out.audienceOther) errors.push("Informe o público que deseja alcançar.");
  if (!out.modalities.length) errors.push("Selecione como funciona seu atendimento.");
  if (out.modalities.includes("Presencial.") && !out.city) errors.push("Informe a cidade do atendimento presencial.");
  if (!out.modalities.includes("Presencial.")) out.city = "";
  if (!STYLES.includes(out.style)) errors.push("Selecione um estilo.");
  out.noBio = !!a.noBio || out.difficulties.includes(NO_BIO);
  if (!out.difficulties.length && !out.difficultyText && !out.bioText && !out.noBio) {
    errors.push("Conte qual é a sua dificuldade com a bio.");
  }
  return { answers: out, errors };
}

function profileText(a) {
  const profession = a.profession === "Outra profissão da área da saúde" ? a.professionOther : a.profession;
  const audience = a.audience === "Outro público." ? a.audienceOther : a.audience.replace(/\.$/, "");
  const lines = [
    `Nome da pessoa: ${a.name || "não informado"}`,
    `Profissão (área): ${profession}`,
    `Especialidade/área de atuação informada: ${a.specialty || "não informada"}`,
    `Principal objetivo no Instagram: ${a.goal.replace(/\.$/, "")}`,
    `Público que deseja atrair: ${audience}`,
    `Modalidade de atendimento: ${a.modalities.map((m) => m.replace(/\.$/, "")).join(" e ")}`,
    `Cidade do atendimento presencial: ${a.city || "não se aplica (somente on-line)"}`,
    `Estilo desejado: ${a.style.replace(/\.$/, "")}`
  ];
  if (a.noBio) lines.push("Situação: a pessoa ainda não tem bio e quer criar uma do zero.");
  const diffs = a.difficulties.filter((d) => d !== NO_BIO);
  if (diffs.length) lines.push(`Dificuldades que a pessoa sente com a bio atual: ${diffs.map((d) => d.replace(/\.$/, "")).join("; ")}`);
  if (a.difficultyText) lines.push(`Nas palavras da pessoa: """${a.difficultyText}"""`);
  if (a.bioText) lines.push(`Texto da bio atual colado pela pessoa:\n"""${a.bioText}"""`);
  return lines.join("\n");
}

const RULES = `
Você é estrategista sênior de comunicação digital da Tenas Digital, agência especializada em profissionais da saúde.
Escreve em português do Brasil, com linguagem acessível, profissional e acolhedora.

REGRAS INEGOCIÁVEIS
1. Use somente informações confirmadas pela pessoa no formulário ou presentes na bio que ela colou. Na dúvida, não use.
2. Não invente títulos, credenciais, especializações, número de pacientes, anos de experiência, certificações, depoimentos, resultados, cidades, regiões de cobertura ou modalidades.
3. Uma área de interesse ou atuação NÃO equivale a título de especialista. Só use "especialista" se a pessoa escreveu explicitamente que é especialista/possui título. Prefira "atuação em", "atendimento a", "foco em".
4. Respeite a ética publicitária dos conselhos (CFM, CFP, CFN, CFO, COFFITO, CFFa, COFEN, CFF, CFBM, CONFEF, CFMV etc.): nada de promessa ou garantia de resultado, "antes e depois", sensacionalismo, superlativos ("o melhor", "referência número 1"), preços, promoções ou autopromoção enganosa.
5. Evite clichês genéricos, como: "transformando vidas", "cuidando de você com amor", "sua saúde em primeiro lugar", "apaixonada pelo que faço", "realizando sonhos", "seu sorriso é minha missão", "especialista em você", "cuidar é minha missão", "gratidão".
6. Gênero: só flexione a profissão (ex.: Psicóloga/Psicólogo) se o gênero estiver claro pelo nome informado. Caso contrário, use substantivos comuns de dois gêneros (Nutricionista, Dentista, Fisioterapeuta) ou o nome da área ("Psicologia para...", "Nutrição para...").
7. Cidade: use exatamente a cidade informada para atendimento presencial, sempre no formato "Cidade - UF" (ex.: "São Paulo - SP"); nunca acrescente outras. Se o atendimento for somente on-line, não cite cidade.
8. Emojis: no máximo 2 por bio, apenas se combinarem com o estilo. Estilos "Elegante e sofisticado" e "Especialista e objetivo" pedem pouco ou nenhum emoji.
9. Limite do Instagram: cada bio completa deve ter no máximo ${BIO_LIMIT} caracteres contando espaços, quebras de linha e emojis (emoji conta como 2). Mire entre 90 e ${BIO_LIMIT - 10}.
10. LINHA DE CONEXÃO (obrigatória em todas as bios): a profissão vem ligada ao público por uma frase que conecta, nunca por separadores. PROIBIDO o formato "Psicóloga | Mulheres", "Nutricionista • Adultos", "Dentista - Crianças". Escreva como "Psicóloga para mulheres cansadas de dar conta de tudo", "Psicóloga para mães que esqueceram de si", "Psicóloga para a comunidade LGBTQIA+", "Nutricionista para quem quer comer bem sem dieta da moda".
   Descreva o público de forma humana e específica, a partir do público e da área de atuação informados (o momento, a dor ou o desejo dessas pessoas), sem estigmatizar e sem inventar um nicho que a pessoa não indicou. Se o público for amplo ("Público geral", "Adultos em geral"), conecte pela área de atuação ou pela necessidade que ela atende.
   Nunca use "|" para separar profissão e público.
11. Use quebras de linha (\\n) para organizar a bio. Não use hashtags. Não inclua @, telefone ou link (o link fica no campo próprio do Instagram); a chamada para ação pode apontar para ele (ex.: "↓ Agende sua consulta").
`;

const STRUCTURE = `
ESTRUTURA FLEXÍVEL SUGERIDA (não obrigatória): 1ª linha = frase marcante ou posicionamento; 2ª linha = linha de conexão (profissão + "para" + público descrito de forma humana); 3ª linha = "Cidade - UF" e/ou on-line (quando relevante) + chamada para ação. Reorganize quando outra composição comunicar melhor.
Exemplo ilustrativo (não copie): "Um espaço de cuidado para você se escutar. 🌿\nPsicóloga para mulheres cansadas de dar conta de tudo\nSão Paulo - SP e on-line\n↓ Agende sua conversa"
`;

// Chamada 1: bônus de nome do perfil + próximos passos.
function analysisPrompt(a) {
  return `${RULES}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

TAREFA
1. BÔNUS — nome do perfil para facilitar a busca ("nameFields"): o campo Nome do Instagram entra na busca, então deve conter as palavras que um paciente digitaria. Crie 3 opções, cada uma com no máximo ${NAME_LIMIT} caracteres, no formato "Nome | Profissão + área/público" e, se houver atendimento presencial, "em Cidade" (só o nome da cidade, sem UF). Exemplo do formato (outra profissão): "Geovanna | Social Media da Saúde em São Paulo". Use o nome informado; se não houver, use "[Seu nome]". Varie as palavras-chave entre as opções (profissão, área de atuação, público). Em "nameWhy", explique em 1 frase por que isso ajuda a ser encontrado(a).
2. Traga 3 próximos passos personalizados ("nextSteps") para o perfil, curtos e práticos, como: destaques, posts fixados, chamada para ação, estratégia de conteúdo coerente com o posicionamento. Úteis por si só, sem exigir contratação. Se a pessoa contou dificuldades com a bio, use-as para escolher os passos.

FORMATO: responda SOMENTE com JSON válido, sem markdown:
{
 "nameFields": ["", "", ""],
 "nameWhy": "",
 "nextSteps": [ { "title": "", "text": "" } ]
}`;
}

// Chamada 2: primeiras linhas + 3 versões da bio.
function createPrompt(a) {
  return `${RULES}${STRUCTURE}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

TAREFA
1. Crie 5 primeiras linhas marcantes, uma para cada abordagem, nesta ordem: "Identificação com o público", "Posicionamento profissional", "Proposta de valor", "Linguagem autoral", "Apresentação direta da especialidade". Cada uma com até 60 caracteres, personalizada (nada que sirva para qualquer profissional).
2. Crie 3 bios completas:
   - "direta": ${VERSION_DEFS.direta.brief}
   - "autoral": ${VERSION_DEFS.autoral.brief}
   - "acolhedora": ${VERSION_DEFS.acolhedora.brief}
   Cada uma com "text" (pronta para copiar) e "strategy" (1–2 frases explicando a escolha).

FORMATO: responda SOMENTE com JSON válido, sem markdown:
{
 "firstLines": [ { "approach": "", "text": "" } ],
 "versions": [ { "key": "direta", "text": "", "strategy": "" }, { "key": "autoral", "text": "", "strategy": "" }, { "key": "acolhedora", "text": "", "strategy": "" } ]
}`;
}

function linesPrompt(a, baseLine, exclude) {
  return `${RULES}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

TAREFA
${baseLine
    ? `A pessoa gostou desta primeira linha: "${baseLine}". Crie 5 VARIAÇÕES dela, mantendo a ideia central e explorando ritmo, palavras e ângulos diferentes.`
    : `Crie 5 novas primeiras linhas, uma por abordagem: "Identificação com o público", "Posicionamento profissional", "Proposta de valor", "Linguagem autoral", "Apresentação direta da especialidade".`}
Cada uma com até 60 caracteres, personalizada para este perfil. Não repita nenhuma destas: ${JSON.stringify(exclude)}.

FORMATO: SOMENTE JSON válido: { "firstLines": [ { "approach": "", "text": "" } ] }
${baseLine ? 'Use "approach": "Variação" em todas.' : ""}`;
}

function versionPrompt(a, key, exclude, firstLine) {
  const def = VERSION_DEFS[key];
  return `${RULES}${STRUCTURE}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

TAREFA
Crie UMA nova bio completa na abordagem "${def.label}": ${def.brief}
${firstLine ? `Use como primeira linha (pode ajustar levemente para caber): "${firstLine}".` : ""}
Ela deve ser claramente diferente destas versões já mostradas: ${JSON.stringify(exclude)}.

FORMATO: SOMENTE JSON válido: { "text": "", "strategy": "" }`;
}

function rewritePrompt(a, text, count) {
  return `${RULES}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

A bio abaixo tem ${count} caracteres e ultrapassa o limite de ${BIO_LIMIT} do Instagram.
Reescreva mantendo a mesma abordagem, a primeira linha (ou uma versão mais curta dela) e as informações essenciais, com no máximo ${BIO_LIMIT - 15} caracteres (emoji conta como 2).
"""${text}"""

FORMATO: SOMENTE JSON válido: { "text": "" }`;
}

// ---------- IA: vários provedores, o primeiro que responder gera o resultado ----------
// Usa o que estiver configurado no projeto do Vercel, nesta ordem:
//   1. Google Gemini      (GEMINI_API_KEY — a mesma chave do CRM)
//   2. OpenAI             (OPENAI_API_KEY)
//   3. Vercel AI Gateway  (AI_GATEWAY_API_KEY ou token OIDC automático do Vercel)
// Em cada provedor, os modelos são descobertos na hora (nomes mudam e modelos antigos são
// desativados), então o gerador não quebra quando um modelo sai do ar.

// Prazo total de cada requisição, com folga antes do corte do Vercel (maxDuration 60 s).
const REQUEST_BUDGET_MS = 50000;
const HOUR = 60 * 60 * 1000;
const cache = new Map(); // provedor -> { list, at }

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.list;
  let list = null;
  try { list = await loader(); } catch (_) {}
  if (list && list.length) cache.set(key, { list, at: Date.now() });
  return list && list.length ? list : null;
}

// Ordena do mais novo para o mais antigo comparando os números do nome (ex.: 3 > 2.5).
function newestFirst(x, y) {
  const a = (x.match(/\d+(?:\.\d+)?/g) || ["0"]).map(Number), b = (y.match(/\d+(?:\.\d+)?/g) || ["0"]).map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0);
  return 0;
}

const PROVIDERS = {
  gemini: {
    label: "gemini",
    key: () => process.env.GEMINI_API_KEY,
    async models(key) {
      const found = await cached("gemini", async () => {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
          headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) return null;
        const names = ((await r.json()).models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|embed|thinking|exp|preview/.test(n));
        const lite = names.filter((n) => /lite/.test(n)).sort(newestFirst);
        return [...names.filter((n) => !/lite/.test(n)).sort(newestFirst), ...lite];
      });
      const list = found || ["gemini-flash-latest", "gemini-flash-lite-latest"];
      const flash = list.find((n) => !/lite/.test(n)), lite = list.find((n) => /lite/.test(n));
      return [process.env.GEMINI_MODEL || flash, lite].filter(Boolean);
    },
    async request(model, key, prompt, temperature, signal) {
      const generationConfig = { responseMimeType: "application/json", temperature };
      // Raciocínio mínimo: no Gemini 3+ é "thinkingLevel"; nos anteriores, orçamento zero.
      if (!noThinking.has(model)) {
        generationConfig.thinkingConfig = geminiVersion(model) >= 3 ? { thinkingLevel: "minimal" } : { thinkingBudget: 0 };
      }
      let r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig })
      });
      if (r.status === 400 && generationConfig.thinkingConfig) {
        const raw = await r.clone().text();
        if (/think/i.test(raw)) { // modelo não aceita desligar o raciocínio: repete sem a opção
          noThinking.add(model);
          delete generationConfig.thinkingConfig;
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST", signal,
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig })
          });
        }
      }
      return r;
    },
    text: (data) => data?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") || "",
    error: (data) => data?.error?.message
  },

  openai: {
    label: "openai",
    key: () => process.env.OPENAI_API_KEY,
    async models(key) {
      const found = await cached("openai", async () => {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) return null;
        return ((await r.json()).data || []).map((m) => String(m.id || ""))
          .filter((id) => /^gpt-[\d.o]+-mini$/.test(id)).sort(newestFirst);
      });
      return [process.env.OPENAI_MODEL, ...(found || ["gpt-4o-mini"])].filter(Boolean).slice(0, 1);
    },
    request: (model, key, prompt, temperature, signal) => chatCompletions("https://api.openai.com/v1", model, key, prompt, temperature, signal),
    text: chatText,
    error: (data) => data?.error?.message
  },

  gateway: {
    label: "vercel",
    // Chave criada no painel, token OIDC do ambiente ou token OIDC enviado pelo Vercel na requisição.
    key: (ctx) => process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || ctx.oidc,
    async models() {
      const found = await cached("gateway", async () => {
        const r = await fetch("https://ai-gateway.vercel.sh/v1/models", { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return null;
        const ids = ((await r.json()).data || []).filter((m) => !m.type || m.type === "language").map((m) => String(m.id || ""));
        return [/^anthropic\/claude-haiku/, /^openai\/gpt-[\d.]+-mini$/]
          .map((re) => ids.filter((id) => re.test(id) && !/preview|thinking/.test(id)).sort(newestFirst)[0]).filter(Boolean);
      });
      return [process.env.AI_MODEL, ...(found || ["anthropic/claude-haiku-4.5"])].filter(Boolean).slice(0, 1);
    },
    request: (model, key, prompt, temperature, signal) => chatCompletions("https://ai-gateway.vercel.sh/v1", model, key, prompt, temperature, signal),
    text: chatText,
    error: (data) => data?.error?.message
  }
};
// Modelos que recusaram a opção de reduzir o raciocínio.
const noThinking = new Set();
const geminiVersion = (model) => Number((/gemini-(\d+(?:\.\d+)?)/.exec(model) || [])[1] || 0);

async function chatCompletions(base, model, key, prompt, temperature, signal) {
  const body = { model, messages: [
    { role: "system", content: "Você responde somente com um objeto JSON válido, sem markdown e sem texto fora do JSON." },
    { role: "user", content: prompt }
  ] };
  // Modelos de raciocínio da OpenAI (gpt-5, o-series) não aceitam temperatura; pedimos raciocínio
  // baixo para responderem rápido.
  const reasoning = /gpt-5|(^|\/)o\d/.test(model);
  if (!reasoning) body.temperature = temperature;
  else if (!noThinking.has(model)) body.reasoning_effort = "low";
  const send = () => fetch(`${base}/chat/completions`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  let r = await send();
  if (r.status === 400 && body.reasoning_effort && /reasoning/i.test(await r.clone().text())) {
    noThinking.add(model);
    delete body.reasoning_effort;
    r = await send();
  }
  return r;
}

function chatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((c) => c?.text || "").join("") : String(content || "");
}

// Códigos curtos exibidos na tela para diagnóstico (sem nenhum dado sensível).
function aiError(code, attempts = [], hint = "") {
  const err = new Error(`IA indisponível (${code}).`);
  err.status = 502;
  // Ex.: "ACESSO · gemini:gemini-3-flash=LIMITE vercel:claude-haiku-5.5=ACESSO · "motivo"".
  const detail = attempts.map((t) => `${t.provider}:${t.model.split("/").pop()}=${t.code}`).join(" ");
  err.code = [code, detail, hint && `"${hint}"`].filter(Boolean).join(" · ");
  return err;
}

function codeFor(status, msg) {
  if (status === 401 || status === 403 || /api key|invalid.*key|permission/i.test(msg)) return "ACESSO";
  if (status === 402 || /credit|billing|quota exceeded|insufficient/i.test(msg)) return "CREDITO";
  if (status === 429) return "LIMITE";
  if (status === 404) return "MODELO";
  return `G${status}`;
}

// Uma tentativa num provedor/modelo. Resolve com o JSON da IA ou rejeita com { code, hint }.
async function attempt({ provider, model, key }, prompt, temperature, ctx, signal) {
  let r, data = {};
  try {
    r = await provider.request(model, key, prompt, temperature, signal);
    const raw = await r.text();
    try { data = JSON.parse(raw); } catch (_) {}
  } catch (e) {
    throw { code: e?.name === "TimeoutError" || e?.name === "AbortError" ? "TEMPO" : "CONEXAO" };
  }
  if (r.ok) {
    const parsed = parseJson(provider.text(data));
    if (parsed) return parsed;
    throw { code: "FORMATO" };
  }
  const msg = String(provider.error(data) || "");
  // Mensagem do provedor, encurtada e sem nada parecido com chave, para o diagnóstico na tela.
  throw { code: codeFor(r.status, msg), hint: msg.replace(/[A-Za-z0-9_\-.]{24,}/g, "…").replace(/["\n]/g, " ").trim().slice(0, 120) };
}

// Ordem das tentativas: o melhor modelo de cada provedor e, por último, o Gemini Lite (mais rápido).
async function candidates(ctx) {
  const list = [];
  for (const id of Object.keys(PROVIDERS)) {
    const provider = PROVIDERS[id];
    const key = provider.key(ctx);
    if (!key) continue;
    const models = await provider.models(key);
    models.forEach((model, i) => list.push({ provider, model, key, rank: i }));
  }
  return [...list.filter((c) => c.rank === 0), ...list.filter((c) => c.rank > 0)].slice(0, 4);
}

// Corrida escalonada: a 1ª tentativa começa na hora e, se ainda não respondeu, outra começa a cada
// HEDGE_MS em paralelo. A primeira resposta válida vence e as demais são canceladas. Assim um
// provedor lento não consome o prazo inteiro sozinho.
const HEDGE_MS = 7000;

async function callAI(prompt, temperature, ctx) {
  const list = await candidates(ctx);
  if (!list.length) throw aiError("SEM-IA", [], "nenhuma chave de IA configurada");

  const controllers = list.map(() => new AbortController());
  const results = list.map(() => null);
  const timers = list.map(() => null); // tentativas agendadas que ainda não começaram
  const startAt = [];
  let hint = "";
  try {
    return await new Promise((resolve, reject) => {
      let pending = list.length, won = false;
      list.forEach((c, i) => {
        const start = () => {
          if (won) return;
          // Se uma tentativa anterior já falhou de vez, esta pode começar antes do horário.
          const remaining = ctx.deadline - Date.now();
          if (remaining < 4000) { results[i] = "TEMPO"; if (--pending === 0) reject(); return; }
          const signal = AbortSignal.any([controllers[i].signal, AbortSignal.timeout(remaining - 1000)]);
          attempt(c, prompt, temperature, ctx, signal).then((out) => {
            if (!won) { won = true; resolve(out); }
          }, (err) => {
            results[i] = err?.code || "ERRO";
            if (err?.hint) hint = err.hint;
            console.error(`bio: ${c.provider.label}/${c.model} -> ${results[i]}${err?.hint ? `: ${err.hint}` : ""}`);
            // Falhou rápido? Adianta a próxima tentativa que ainda está esperando.
            const next = timers.findIndex((t) => t);
            if (next !== -1) { clearTimeout(timers[next]); timers[next] = null; startAt[next](); }
            if (--pending === 0) reject();
          });
        };
        startAt[i] = start;
        timers[i] = i === 0 ? null : setTimeout(() => { timers[i] = null; start(); }, i * HEDGE_MS);
        if (i === 0) start();
      });
    });
  } catch (_) {
    const attempts = list.map((c, i) => ({ provider: c.provider.label, model: c.model, code: results[i] || "TEMPO" }));
    const order = ["LIMITE", "CREDITO", "ACESSO", "TEMPO", "MODELO", "FORMATO", "CONEXAO"];
    const main = order.find((code) => attempts.some((t) => t.code === code)) || attempts[0].code;
    throw aiError(main, attempts, hint);
  } finally {
    controllers.forEach((c) => c.abort());
    timers.forEach((t) => t && clearTimeout(t));
  }
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

// Garante o limite de caracteres: reescreve com a IA até 2 vezes; como último recurso,
// remove linhas finais menos importantes sem cortar palavras no meio.
async function enforceLimit(a, text, ctx) {
  let t = cleanBio(text);
  for (let i = 0; i < 2 && charCount(t) > BIO_LIMIT && ctx.deadline - Date.now() > 12000; i++) {
    try {
      const r = await callAI(rewritePrompt(a, t, charCount(t)), 0.5, { ...ctx, deadline: Math.min(ctx.deadline, Date.now() + 15000) });
      if (r && typeof r.text === "string" && r.text.trim()) t = cleanBio(r.text);
    } catch (_) { break; }
  }
  if (charCount(t) > BIO_LIMIT) {
    const lines = t.split("\n");
    while (lines.length > 1 && charCount(lines.join("\n")) > BIO_LIMIT) lines.splice(lines.length - 2, 1);
    t = lines.join("\n");
    if (charCount(t) > BIO_LIMIT) t = t.slice(0, BIO_LIMIT).replace(/\s+\S*$/, "");
  }
  return t;
}

function cleanBio(t) {
  return String(t || "").replace(/\r/g, "").replace(/#[\p{L}\d_]+/gu, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanLines(list, exclude = []) {
  const seen = new Set(exclude.map((x) => x.toLowerCase()));
  return (Array.isArray(list) ? list : [])
    .map((l) => ({ approach: str(l?.approach, 60), text: str(l?.text, 120).replace(/^["“]|["”]$/g, "") }))
    .filter((l) => l.text && !seen.has(l.text.toLowerCase()) && seen.add(l.text.toLowerCase()))
    .slice(0, 5);
}

async function buildVersion(a, key, v, ctx) {
  const text = await enforceLimit(a, v?.text || "", ctx);
  return { key, label: VERSION_DEFS[key].label, text, strategy: str(v?.strategy, 400), chars: charCount(text) };
}

// ---------- Handler ----------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente." });

  const ctx = { deadline: Date.now() + REQUEST_BUDGET_MS, oidc: req.headers["x-vercel-oidc-token"] };
  try {
    const body = req.body || {};
    const mode = body.mode || "generate";
    const { answers, errors } = validateAnswers(body.answers || {});
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    if (mode === "generate") {
      const [analysis, creation] = await Promise.allSettled([
        callAI(analysisPrompt(answers), 0.7, ctx),
        callAI(createPrompt(answers), 0.9, ctx)
      ]);
      if (analysis.status === "rejected") throw analysis.reason;
      const out = analysis.value || {};

      if (creation.status === "rejected") throw creation.reason;
      const created = creation.value || {};

      const versionsIn = Array.isArray(created.versions) ? created.versions : [];
      const versions = await Promise.all(
        Object.keys(VERSION_DEFS).map((key, i) => buildVersion(answers, key, versionsIn.find((v) => v?.key === key) || versionsIn[i], ctx))
      );
      if (versions.some((v) => !v.text)) throw Object.assign(new Error("A IA não gerou todas as versões."), { status: 502 });

      return res.status(200).json({
        status: "ok",
        limit: BIO_LIMIT,
        firstLines: cleanLines(created.firstLines),
        versions,
        nameFields: (Array.isArray(out.nameFields) ? out.nameFields : [])
          .map((n) => str(typeof n === "string" ? n : n?.suggestion, 120))
          .filter((n) => n && n.length <= NAME_LIMIT).slice(0, 3),
        nameWhy: str(out.nameWhy, 300),
        nextSteps: (Array.isArray(out.nextSteps) ? out.nextSteps : []).slice(0, 5).map((s) => ({
          title: str(s?.title, 120), text: str(s?.text, 500)
        })).filter((s) => s.title)
      });
    }

    if (mode === "lines") {
      const exclude = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 40).map((x) => str(x, 120));
      const baseLine = str(body.baseLine, 120);
      const out = await callAI(linesPrompt(answers, baseLine, exclude), 1, ctx);
      const firstLines = cleanLines(out.firstLines, exclude);
      if (!firstLines.length) throw Object.assign(new Error("Nenhuma frase nova gerada."), { status: 502 });
      return res.status(200).json({ firstLines });
    }

    if (mode === "version") {
      const key = body.versionKey;
      if (!VERSION_DEFS[key]) return res.status(400).json({ error: "Versão inválida." });
      const exclude = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 10).map((x) => str(x, 300));
      const out = await callAI(versionPrompt(answers, key, exclude, str(body.firstLine, 120)), 1, ctx);
      const version = await buildVersion(answers, key, out, ctx);
      if (!version.text) throw Object.assign(new Error("A IA não gerou a versão."), { status: 502 });
      return res.status(200).json({ version });
    }

    return res.status(400).json({ error: "Modo inválido." });
  } catch (e) {
    const status = e.status || 500;
    if (status !== 400) console.error("bio:", e.code || e.message);
    return res.status(status).json({
      error: status === 400 ? e.message
        : /^(ACESSO|CREDITO)/.test(e.code || "") ? "O serviço de IA da Tenas Digital está temporariamente indisponível. Tente mais tarde."
        : "Não foi possível concluir a geração agora. Suas respostas foram mantidas — tente novamente em alguns segundos.",
      code: status === 400 ? undefined : (e.code || "SERVIDOR")
    });
  }
}
