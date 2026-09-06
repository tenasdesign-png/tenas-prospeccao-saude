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
      ? `Dê direcionamento comercial direto para esta lead. Responda em português, curto e acionável.
Inclua:
1) Diagnóstico em 2-4 linhas.
2) Por que vale ou não vale abordar.
3) Próxima ação exata.
4) Mensagem exata a enviar agora, se aplicável.
5) O que NÃO fazer.
Não ofereça conteúdo grátis nem auditoria gratuita.
Se a lead já respondeu, analise a conversa e escreva a próxima resposta.
Se ainda não respondeu, respeite o estágio e sugira follow-up quando apropriado.`
      : `Analise os prints e os dados. Identifique, somente quando houver evidência suficiente:
- @, nome, profissão, especialidade, cidade e contato;
- se há anúncio;
- sinais de que existe social media/agência;
- qualidade/clareza do posicionamento;
- fit com o avatar;
- prioridade A/B/C.
Depois dê direcionamento comercial curto.
Não invente informações. Se algo não estiver visível, deixe vazio ou diga "não identificado".
Retorne JSON válido com as chaves:
fields: {name,ig,type,niche,city,contact,ad,priority,obs,message,nextAction}
text: string com análise e próxima ação.

REGRAS IMPORTANTES PARA PREENCHIMENTO:
- Leia com atenção BIO, nome do perfil, texto do anúncio, legenda, botões, endereço, telefone e qualquer texto visível nas imagens.
- Cidade: preencha SOMENTE se a cidade/UF estiver explicitamente visível ou puder ser lida com segurança. Se não estiver, deixe vazio.
- Nome e @: extraia do perfil/anúncio somente quando estiverem visíveis.
- Mensagem: SEMPRE gere uma mensagem curta e direta para a primeira abordagem, sem oferecer auditoria, diagnóstico, análise grátis, material grátis ou qualquer "posso te dar uma dica". Use a experiência da Geovanna como contexto. Exemplo de estrutura: "Oi, Dra. [Nome]! Sou a Geovanna, jornalista, e trabalho há quase 10 anos com comunicação — hoje focada em profissionais da saúde. Você já tem alguém cuidando do seu Instagram ou essa parte ainda fica por sua conta?"
- Se o nome estiver identificado, personalize a saudação. Se não estiver, use "Oi, Dra.!".
- Não invente cidade, profissão, especialidade ou qualquer outro dado.
- nextAction deve ser uma ação comercial concreta e curta, por exemplo "Abordar agora por DM" ou "Não abordar; já tem agência".
- priority deve seguir A/B/C usando as regras comerciais dadas no contexto.`;

    const body = {
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [{ role: "user", content }],
      ...(mode === "analyze" ? { text: { format: { type: "json_object" } } } : {})
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
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro inesperado." });
  }
}
