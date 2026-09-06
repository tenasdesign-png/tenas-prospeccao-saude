export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada no Vercel." });
  }
  try {
    const { mode, lead } = req.body || {};
    if (!lead) return res.status(400).json({ error: "Lead ausente." });

    const images = [
      ...(lead.adImages || []).map((x) => ({ label: "ANÚNCIO", data: x })),
      ...(lead.profileImages || []).map((x) => ({ label: "PERFIL", data: x })),
      ...(lead.chatImages || []).map((x) => ({ label: "CONVERSA", data: x }))
    ].slice(0, 12);

    const context = `
Você é o "Hormozi Mentor (Não oficial)", um coach de negócios direto, prático e orientado a dados.
Você NÃO é Alex Hormozi. Não diga que é Alex Hormozi.
Contexto da Geovanna:
- jornalista e social media há quase 10 anos;
- empresa Tenas Digital;
- foco: profissionais da saúde;
- objetivo imediato: gerar caixa e encontrar compradoras;
- avatar principal: mulheres da saúde com pelo menos 3 anos de atuação, faturamento acima de R$20 mil, sem tempo para cuidar do marketing;
- capacidade atual: até 5 clientes;
- meta de sobrevivência: R$5 mil/mês.
Regra comercial:
A = anuncia + perfil ruim + encaixa no avatar => abordar imediatamente.
B = não anuncia + perfil ruim + avatar perfeito => observar alguns dias e abordar.
C = perfil bom + já tem equipe/agência => não perder tempo.
Tom de prospecção: curto, humano, direto. Sem diagnóstico grátis. A mensagem-base é:
"Oi, Dra. [Nome]! Sou a Geovanna, jornalista, e trabalho há quase 10 anos com comunicação — hoje focada em profissionais da saúde.
Você já tem alguém cuidando do seu Instagram ou essa parte ainda fica por sua conta?"
`;

    const leadText = `
DADOS CADASTRADOS:
Nome: ${lead.name || ""}
Instagram: ${lead.ig || ""}
Profissão: ${lead.type || ""}
Especialidade: ${lead.niche || ""}
Cidade: ${lead.city || ""}
Contato: ${lead.contact || ""}
Anúncio: ${lead.ad || ""}
Prioridade atual: ${lead.priority || ""}
Status: ${lead.status || ""}
Observação: ${lead.obs || ""}
Última ação: ${lead.last || ""}
Próxima ação: ${lead.nextAction || ""}
Mensagem usada/sugerida: ${lead.message || ""}
Notas: ${lead.notes || ""}
`;

    let content = [{ type: "input_text", text: context + "\n" + leadText }];
    for (const im of images) {
      content.push({ type: "input_text", text: `A imagem seguinte pertence à categoria ${im.label}. Analise apenas o que for visível e relevante.` });
      content.push({ type: "input_image", image_url: im.data });
    }

    const task = mode === "coach"
      ? `A doutora já foi salva. Agora atue como o "Hormozi Mentor (Não oficial)" e ajude a Geovanna SOMENTE com a mensagem comercial.
Responda em português e seja curto, humano e direto.
Analise os dados salvos, os prints e, se houver, os prints da conversa.
Se ainda não existe conversa, escreva UMA mensagem de primeira abordagem personalizada.
Se já existe conversa, escreva a próxima resposta mais adequada ao estágio.
Não ofereça auditoria, diagnóstico, dica grátis, material grátis ou elogios vazios.
Use a experiência da Geovanna (jornalista, quase 10 anos com comunicação, foco em saúde) como contexto, sem exagerar.
Não invente informações.
Retorne JSON válido com:
fields: {message}
text: string explicando em 1-3 linhas por que essa mensagem faz sentido.`
      : `FASE 1 — LEITURA E PREENCHIMENTO.
Analise os prints do PERFIL e do ANÚNCIO e preencha automaticamente os dados da ficha.
NÃO escreva mensagem de prospecção nesta etapa. A mensagem será solicitada separadamente depois que a doutora for salva.
Identifique, somente quando houver evidência suficiente:
- nome, @, profissão, especialidade, cidade e contato;
- se há anúncio;
- sinais de que existe social media/agência;
- qualidade/clareza do posicionamento;
- fit com o avatar;
- prioridade A/B/C.
Depois dê um direcionamento comercial curto.
Não invente informações. Se algo não estiver visível, deixe vazio ou diga "não identificado".
Retorne JSON válido com:
fields: {name,ig,type,niche,city,contact,ad,priority,obs,nextAction}
text: string com resumo do que foi identificado e a próxima ação.

REGRAS IMPORTANTES:
- Leia BIO, nome do perfil, texto do anúncio, legenda, botões, endereço, telefone e qualquer texto visível.
- Cidade: preencha SOMENTE se estiver explicitamente visível ou puder ser lida com segurança. Nunca adivinhe.
- Nome e @: extraia somente quando estiverem visíveis.
- Profissão/especialidade: preencha somente quando houver evidência.
- Anúncio: "sim" se houver evidência de anúncio; "nao" se o print mostrar claramente que não é anúncio; caso contrário, preserve o dado existente.
- priority: A = anuncia + perfil ruim + fit; B = sem anúncio + perfil ruim + fit; C = perfil bom + equipe/agência.
- nextAction: ação comercial concreta e curta, como "Abordar agora por DM", "Observar alguns dias e abordar" ou "Não abordar; já tem equipe".
- NÃO inclua "message" no retorno desta fase.
`;
    const body = {
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } }
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Erro da API." });

    const text = data.output_text || "";
    if (mode === "analyze") {
      try {
        const parsed = JSON.parse(text);
        return res.status(200).json({ fields: parsed.fields || {}, text: parsed.text || "" });
      } catch {
        return res.status(200).json({ fields: {}, text });
      }
    }
    return res.status(200).json({ fields: (()=>{ try { return JSON.parse(text)?.fields || {}; } catch { return {}; } })(), text: (()=>{ try { return JSON.parse(text)?.text || text; } catch { return text; } })() });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro inesperado." });
  }
}
