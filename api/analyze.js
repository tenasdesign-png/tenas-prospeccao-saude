export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada no Vercel." });
  }

  try {
    const { mode, lead } = req.body || {};
    if (!lead) return res.status(400).json({ error: "Lead ausente." });

    const images = [
      ...(lead.adImages || []).map((x) => ({ label: "ANÚNCIO", data: x })),
      ...(lead.profileImages || []).map((x) => ({ label: "PERFIL", data: x })),
      ...(lead.chatImages || []).map((x) => ({ label: "CONVERSA", data: x }))
    ].slice(0, 8);

    const context = `
Você é o "Hormozi Mentor (Não oficial)", um coach de negócios direto, prático e orientado a dados.
Você NÃO é Alex Hormozi. Não diga que é Alex Hormozi.
Responda em português.
IMPORTANTE: sua resposta final deve ser SOMENTE um objeto JSON válido, sem markdown, sem cercas de código e sem texto antes/depois.

Contexto:
- Geovanna é jornalista e social media há quase 10 anos.
- Empresa: Tenas Digital.
- Foco: profissionais da saúde.
- Avatar principal: mulheres da saúde com pelo menos 3 anos de atuação, faturamento acima de R$20 mil e pouco tempo para cuidar do marketing.
- Objetivo imediato: gerar caixa e encontrar compradoras.
- Capacidade atual: até 5 clientes.
- Meta: R$5 mil/mês.

Regras comerciais:
A = anuncia + perfil ruim + fit => abordar imediatamente.
B = não anuncia + perfil ruim + fit => observar alguns dias e abordar.
C = perfil bom + já tem equipe/agência => não perder tempo.

Nunca invente dados. Se algo não estiver visível, deixe vazio ou "não identificado".
`;

    const leadText = `
DADOS ATUAIS DA FICHA:
Nome: ${lead.name || ""}
Instagram: ${lead.ig || ""}
Profissão: ${lead.type || ""}
Especialidade: ${lead.niche || ""}
Cidade: ${lead.city || ""}
Contato: ${lead.contact || ""}
Anúncio: ${lead.ad || ""}
Prioridade: ${lead.priority || ""}
Status: ${lead.status || ""}
Observação: ${lead.obs || ""}
Próxima ação: ${lead.nextAction || ""}
Mensagem: ${lead.message || ""}
Notas: ${lead.notes || ""}
`;

    const task = mode === "coach"
      ? `
ETAPA 2 — MENSAGEM.
A doutora já foi salva. Analise os dados salvos, os prints e, se houver, a conversa.
Escreva UMA mensagem comercial curta, humana e direta.
Se não existe conversa, faça uma primeira abordagem.
Se já existe conversa, escreva a próxima resposta.
Não ofereça auditoria, diagnóstico grátis, material grátis ou elogios vazios.
Use a experiência da Geovanna (jornalista, quase 10 anos com comunicação, foco em saúde) como contexto.
Não invente informações.

Retorne exatamente:
{"fields":{"message":"..."},"text":"..."}
`
      : `
ETAPA 1 — LEITURA DOS PRINTS.
Analise principalmente PERFIL e ANÚNCIO e preencha a ficha automaticamente.

Identifique somente com evidência visível:
- nome
- Instagram/@
- profissão
- especialidade
- cidade/UF
- contato
- se há anúncio
- sinais de social media/agência
- qualidade/clareza do posicionamento
- fit com o avatar
- prioridade A/B/C
- próxima ação comercial

Leia BIO, nome, texto do anúncio, legenda, botões, endereço, telefone e textos visíveis.
Cidade só pode ser preenchida se estiver explícita ou puder ser lida com segurança.
Não adivinhe.

Retorne exatamente neste formato:
{"fields":{"name":"","ig":"","type":"","niche":"","city":"","contact":"","ad":"","priority":"","obs":"","nextAction":""},"text":"resumo curto"}

Não inclua mensagem de prospecção nesta etapa.
`;

    const parts = [{ text: context + "\n" + leadText + "\n" + task }];

    for (const im of images) {
      if (!im.data) continue;
      const match = /^data:(.+?);base64,(.+)$/.exec(im.data);
      if (!match) continue;
      const [, mimeType, base64Data] = match;
      parts.push({ text: `A próxima imagem é da categoria ${im.label}. Leia somente informações realmente visíveis.` });
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const raw = await r.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {}

    if (!r.ok) {
      const msg = data?.error?.message || raw || `Gemini retornou HTTP ${r.status}.`;
      return res.status(502).json({ error: msg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) {
      return res.status(502).json({ error: "A IA não retornou texto. Tente novamente." });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text.trim());
    } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (_) {}
      }
    }

    if (!parsed) {
      return res.status(502).json({
        error: "A IA respondeu em um formato inesperado.",
        raw: text.slice(0, 1200)
      });
    }

    return res.status(200).json({
      fields: parsed.fields || {},
      text: parsed.text || ""
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Erro inesperado no servidor." });
  }
}
