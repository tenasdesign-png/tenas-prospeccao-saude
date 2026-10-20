// Gerador Inteligente de Bios — Tenas Digital
// Endpoint público: POST /api/bio
//
// Privacidade: o print é recebido em memória, enviado à API do Gemini apenas para
// leitura/análise e descartado ao fim da requisição. Nada é gravado em disco,
// banco de dados ou log (não registramos respostas, textos ou imagens).

const BIO_LIMIT = Number(process.env.BIO_CHAR_LIMIT) || 150;
const NAME_LIMIT = 64;
const MAX_IMAGE_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;

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
const STYLES = [
  "Profissional e acolhedor.", "Elegante e sofisticado.", "Moderno e descontraído.", "Especialista e objetivo.",
  "Próximo e humanizado.", "Criativo e marcante.", "Prefiro que a inteligência artificial escolha."
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

function validateAnswers(a) {
  const errors = [];
  const out = {
    profession: str(a.profession, 80),
    professionOther: str(a.professionOther, 80),
    specialty: str(a.specialty, 200),
    goal: str(a.goal, 80),
    audience: str(a.audience, 80),
    audienceOther: str(a.audienceOther, 120),
    modalities: Array.isArray(a.modalities) ? a.modalities.filter((m) => MODALITIES.includes(m)) : [],
    city: str(a.city, 80),
    style: str(a.style, 80),
    noBio: !!a.noBio,
    bioText: str(a.bioText, 600)
  };
  if (!PROFESSIONS.includes(out.profession)) errors.push("Selecione sua profissão.");
  if (out.profession === "Outra profissão da área da saúde" && !out.professionOther) errors.push("Informe sua profissão.");
  if (!GOALS.includes(out.goal)) errors.push("Selecione seu principal objetivo.");
  if (!AUDIENCES.includes(out.audience)) errors.push("Selecione o público que deseja atrair.");
  if (out.audience === "Outro público." && !out.audienceOther) errors.push("Informe o público que deseja alcançar.");
  if (!out.modalities.length) errors.push("Selecione pelo menos uma modalidade de atendimento.");
  if (out.modalities.includes("Presencial.") && !out.city) errors.push("Informe a cidade do atendimento presencial.");
  if (!out.modalities.includes("Presencial.")) out.city = "";
  if (!STYLES.includes(out.style)) errors.push("Selecione um estilo.");
  return { answers: out, errors };
}

function parseImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Formato de imagem inválido. Envie PNG, JPG ou JPEG.");
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("A imagem é grande demais. Envie um arquivo menor.");
  return { mimeType: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] };
}

function profileText(a, extracted) {
  const profession = a.profession === "Outra profissão da área da saúde" ? a.professionOther : a.profession;
  const audience = a.audience === "Outro público." ? a.audienceOther : a.audience.replace(/\.$/, "");
  const lines = [
    `Profissão (área): ${profession}`,
    `Especialidade/área de atuação informada: ${a.specialty || "não informada"}`,
    `Principal objetivo no Instagram: ${a.goal.replace(/\.$/, "")}`,
    `Público que deseja atrair: ${audience}`,
    `Modalidade de atendimento: ${a.modalities.map((m) => m.replace(/\.$/, "")).join(" e ")}`,
    `Cidade do atendimento presencial: ${a.city || "não se aplica (somente on-line)"}`,
    `Estilo desejado: ${a.style.replace(/\.$/, "")}`
  ];
  if (a.noBio) lines.push("Situação: a pessoa ainda não tem bio e quer criar uma do zero.");
  if (a.bioText) lines.push(`Texto da bio atual colado pela pessoa:\n"""${a.bioText}"""`);
  if (extracted && (extracted.bio || extracted.name)) {
    lines.push(`Leitura anterior do perfil (já confirmada): nome="${str(extracted.name, 100)}", bio="""${str(extracted.bio, 400)}""", destaques=${JSON.stringify((extracted.highlights || []).slice(0, 12).map((h) => str(h, 40)))}`);
  }
  return lines.join("\n");
}

const RULES = `
Você é estrategista sênior de comunicação digital da Tenas Digital, agência especializada em profissionais da saúde.
Escreve em português do Brasil, com linguagem acessível, profissional e acolhedora.

REGRAS INEGOCIÁVEIS
1. Use somente informações confirmadas pela pessoa no formulário ou lidas com segurança no print. Na dúvida, não use.
2. Não invente títulos, credenciais, especializações, número de pacientes, anos de experiência, certificações, depoimentos, resultados, cidades, regiões de cobertura ou modalidades.
3. Uma área de interesse ou atuação NÃO equivale a título de especialista. Só use "especialista" se a pessoa escreveu explicitamente que é especialista/possui título. Prefira "atuação em", "atendimento a", "foco em".
4. Respeite a ética publicitária dos conselhos (CFM, CFP, CFN, CFO, COFFITO, CFFa, COFEN, CFF, CFBM, CONFEF, CFMV etc.): nada de promessa ou garantia de resultado, "antes e depois", sensacionalismo, superlativos ("o melhor", "referência número 1"), preços, promoções ou autopromoção enganosa.
5. Evite clichês genéricos, como: "transformando vidas", "cuidando de você com amor", "sua saúde em primeiro lugar", "apaixonada pelo que faço", "realizando sonhos", "seu sorriso é minha missão", "especialista em você", "cuidar é minha missão", "gratidão".
6. Gênero: só flexione a profissão (ex.: Psicóloga/Psicólogo, Nutricionista, Dentista) se o gênero estiver claro pelo nome no print. Caso contrário, prefira formas neutras como o nome da área ("Psicologia | ...", "Nutrição clínica") ou substantivos comuns de dois gêneros.
7. Cidade: use exatamente a cidade informada para atendimento presencial; nunca acrescente outras. Se o atendimento for somente on-line, não cite cidade.
8. Emojis: no máximo 2 por bio, apenas se combinarem com o estilo. Estilos "Elegante e sofisticado" e "Especialista e objetivo" pedem pouco ou nenhum emoji.
9. Limite do Instagram: cada bio completa deve ter no máximo ${BIO_LIMIT} caracteres contando espaços, quebras de linha e emojis (emoji conta como 2). Mire entre 90 e ${BIO_LIMIT - 10}.
10. Use quebras de linha (\\n) para organizar a bio. Não use hashtags. Não inclua @, telefone ou link (o link fica no campo próprio do Instagram); a chamada para ação pode apontar para ele (ex.: "↓ Agende sua consulta").
`;

const STRUCTURE = `
ESTRUTURA FLEXÍVEL SUGERIDA (não obrigatória): 1ª linha = frase marcante ou posicionamento; 2ª linha = profissão, área e público; 3ª linha = cidade/modalidade (quando relevante) + chamada para ação. Reorganize quando outra composição comunicar melhor.
`;

function generatePrompt(a, hasImage) {
  const scratch = a.noBio && !a.bioText;
  return `${RULES}${STRUCTURE}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a)}

TAREFA
${hasImage ? `1. Leia o print do perfil do Instagram. Extraia somente o que estiver legível: campo Nome (texto em negrito acima da bio), @ (se visível), texto da bio, nomes dos destaques e texto do link. Se a bio não estiver legível com segurança E não houver texto colado, responda com "status":"unreadable" e explique brevemente em "unreadableReason" (ex.: "a imagem está desfocada", "a bio está cortada").` : "1. Não há print. Use o texto colado (se houver) como bio atual."}
2. ${scratch
    ? `A pessoa não tem bio. Em "improvements", traga de 2 a 4 FUNDAMENTOS que a bio dela precisa comunicar, considerando profissão, público, objetivo e modalidade (use "type":"fundamento").`
    : `Analise a bio atual considerando: clareza da profissão e área; qualidade da primeira linha; facilidade para entender quem é atendido; proposta de valor; uso do campo Nome; informações relevantes de atendimento; cidade quando presencial e pertinente; chamada para ação; frases genéricas ou irrelevantes; coerência com público e objetivo; organização e legibilidade; oportunidades de diferenciação.
   Traga de 2 a 4 pontos prioritários, apenas os que você realmente observa. Não invente problemas para preencher a lista.
   Classifique cada um como "erro" (problema real) ou "oportunidade" (melhoria opcional). Uma frase autoral não é erro só por não citar a profissão.
   Não aponte como ausente algo que não aparece no print mas foi confirmado no formulário — nesse caso, oriente a incluir na bio de forma objetiva, sem tratar como falha da pessoa.
   Se a bio já for boa em algum aspecto, você pode reconhecer isso brevemente no texto de outro ponto, sem elogios vazios.`}
   Cada ponto: "title" (frase curta e específica, ex.: "Sua bio não deixa claro quem você atende."), "why" (por que isso importa, 1–2 frases), "how" (como corrigir, prático e adaptado ao perfil).
3. Crie 5 primeiras linhas marcantes, uma para cada abordagem, nesta ordem: "Identificação com o público", "Posicionamento profissional", "Proposta de valor", "Linguagem autoral", "Apresentação direta da especialidade". Cada uma com até 60 caracteres, personalizada (nada que sirva para qualquer profissional).
4. Crie 3 bios completas:
   - "direta": ${VERSION_DEFS.direta.brief}
   - "autoral": ${VERSION_DEFS.autoral.brief}
   - "acolhedora": ${VERSION_DEFS.acolhedora.brief}
   Cada uma com "text" (pronta para copiar) e "strategy" (1–2 frases explicando a escolha).
5. Sugira o campo Nome do Instagram ("nameField"): até ${NAME_LIMIT} caracteres, combinando o nome da pessoa (somente se legível no print; senão use "[Seu nome]") com a área/palavra-chave que ajude na busca. Explique em "why".
6. Traga de 3 a 5 próximos passos personalizados ("nextSteps") para o perfil, como: campo Nome, destaques (cite os existentes se legíveis), posts fixados, chamada para ação, estratégia de conteúdo coerente com o posicionamento. Úteis por si só, sem exigir contratação.

FORMATO: responda SOMENTE com JSON válido, sem markdown:
{
 "status": "ok" | "unreadable",
 "unreadableReason": "",
 "extracted": { "name": "", "username": "", "bio": "", "highlights": [], "link": "" },
 "improvements": [ { "type": "erro" | "oportunidade" | "fundamento", "title": "", "why": "", "how": "" } ],
 "firstLines": [ { "approach": "", "text": "" } ],
 "versions": [ { "key": "direta", "text": "", "strategy": "" }, { "key": "autoral", "text": "", "strategy": "" }, { "key": "acolhedora", "text": "", "strategy": "" } ],
 "nameField": { "suggestion": "", "why": "" },
 "nextSteps": [ { "title": "", "text": "" } ]
}`;
}

function linesPrompt(a, extracted, baseLine, exclude) {
  return `${RULES}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a, extracted)}

TAREFA
${baseLine
    ? `A pessoa gostou desta primeira linha: "${baseLine}". Crie 5 VARIAÇÕES dela, mantendo a ideia central e explorando ritmo, palavras e ângulos diferentes.`
    : `Crie 5 novas primeiras linhas, uma por abordagem: "Identificação com o público", "Posicionamento profissional", "Proposta de valor", "Linguagem autoral", "Apresentação direta da especialidade".`}
Cada uma com até 60 caracteres, personalizada para este perfil. Não repita nenhuma destas: ${JSON.stringify(exclude)}.

FORMATO: SOMENTE JSON válido: { "firstLines": [ { "approach": "", "text": "" } ] }
${baseLine ? 'Use "approach": "Variação" em todas.' : ""}`;
}

function versionPrompt(a, extracted, key, exclude, firstLine) {
  const def = VERSION_DEFS[key];
  return `${RULES}${STRUCTURE}
DADOS CONFIRMADOS PELA PESSOA
${profileText(a, extracted)}

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

// ---------- Gemini ----------
async function callGemini(prompt, image, temperature = 0.9) {
  const parts = [{ text: prompt }];
  if (image) {
    parts.push({ text: "Print do perfil do Instagram enviado pela pessoa. Leia somente o que estiver realmente visível." });
    parts.push({ inlineData: image });
  }
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature }
  };
  const primary = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
  const models = [primary, primary, fallback];

  let lastError = "";
  for (let i = 0; i < models.length; i++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${models[i]}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    });
    const raw = await r.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {}
    if (r.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      const parsed = parseJson(text);
      if (parsed) return parsed;
      lastError = "formato inesperado";
    } else {
      lastError = `HTTP ${r.status}`;
      const msg = (data?.error?.message || "").toLowerCase();
      const transient = r.status === 429 || r.status >= 500 || msg.includes("overloaded") || msg.includes("high demand");
      if (!transient) break;
    }
    await new Promise((res) => setTimeout(res, 700 * (i + 1)));
  }
  const err = new Error(`IA indisponível (${lastError}).`);
  err.status = 502;
  throw err;
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
async function enforceLimit(a, text) {
  let t = cleanBio(text);
  for (let i = 0; i < 2 && charCount(t) > BIO_LIMIT; i++) {
    try {
      const r = await callGemini(rewritePrompt(a, t, charCount(t)), null, 0.5);
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

async function buildVersion(a, key, v) {
  const text = await enforceLimit(a, v?.text || "");
  return { key, label: VERSION_DEFS[key].label, text, strategy: str(v?.strategy, 400), chars: charCount(text) };
}

// ---------- Handler ----------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "O serviço de IA ainda não foi configurado." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente." });

  try {
    const body = req.body || {};
    const mode = body.mode || "generate";
    const { answers, errors } = validateAnswers(body.answers || {});
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const extracted = body.extracted && typeof body.extracted === "object" ? body.extracted : null;

    if (mode === "generate") {
      const image = answers.noBio ? null : parseImage(body.image);
      if (!image && !answers.noBio && !answers.bioText) {
        return res.status(400).json({ error: "Envie um print do perfil, cole o texto da bio ou marque que ainda não tem bio." });
      }
      const out = await callGemini(generatePrompt(answers, !!image), image);

      if (out.status === "unreadable" && !answers.bioText) {
        return res.status(200).json({
          status: "unreadable",
          reason: str(out.unreadableReason, 200) || "Não conseguimos ler a bio no print com segurança."
        });
      }

      const versionsIn = Array.isArray(out.versions) ? out.versions : [];
      const versions = await Promise.all(
        Object.keys(VERSION_DEFS).map((key, i) => buildVersion(answers, key, versionsIn.find((v) => v?.key === key) || versionsIn[i]))
      );
      if (versions.some((v) => !v.text)) throw Object.assign(new Error("A IA não gerou todas as versões."), { status: 502 });

      const ex = out.extracted || {};
      return res.status(200).json({
        status: "ok",
        limit: BIO_LIMIT,
        extracted: {
          name: str(ex.name, 100), username: str(ex.username, 60), bio: str(ex.bio, 400),
          highlights: Array.isArray(ex.highlights) ? ex.highlights.slice(0, 12).map((h) => str(h, 40)).filter(Boolean) : [],
          link: str(ex.link, 120)
        },
        improvements: (Array.isArray(out.improvements) ? out.improvements : []).slice(0, 4).map((p) => ({
          type: ["erro", "oportunidade", "fundamento"].includes(p?.type) ? p.type : "oportunidade",
          title: str(p?.title, 160), why: str(p?.why, 500), how: str(p?.how, 500)
        })).filter((p) => p.title),
        firstLines: cleanLines(out.firstLines),
        versions,
        nameField: {
          suggestion: str(out.nameField?.suggestion, NAME_LIMIT),
          why: str(out.nameField?.why, 400)
        },
        nextSteps: (Array.isArray(out.nextSteps) ? out.nextSteps : []).slice(0, 5).map((s) => ({
          title: str(s?.title, 120), text: str(s?.text, 500)
        })).filter((s) => s.title)
      });
    }

    if (mode === "lines") {
      const exclude = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 40).map((x) => str(x, 120));
      const baseLine = str(body.baseLine, 120);
      const out = await callGemini(linesPrompt(answers, extracted, baseLine, exclude), null, 1);
      const firstLines = cleanLines(out.firstLines, exclude);
      if (!firstLines.length) throw Object.assign(new Error("Nenhuma frase nova gerada."), { status: 502 });
      return res.status(200).json({ firstLines });
    }

    if (mode === "version") {
      const key = body.versionKey;
      if (!VERSION_DEFS[key]) return res.status(400).json({ error: "Versão inválida." });
      const exclude = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 10).map((x) => str(x, 300));
      const out = await callGemini(versionPrompt(answers, extracted, key, exclude, str(body.firstLine, 120)), null, 1);
      const version = await buildVersion(answers, key, out);
      if (!version.text) throw Object.assign(new Error("A IA não gerou a versão."), { status: 502 });
      return res.status(200).json({ version });
    }

    return res.status(400).json({ error: "Modo inválido." });
  } catch (e) {
    const status = e.status || (/imagem|Formato/.test(e.message) ? 400 : 500);
    return res.status(status).json({
      error: status === 400 ? e.message : "Não foi possível concluir a geração agora. Suas respostas foram mantidas — tente novamente em alguns segundos."
    });
  }
}
