// Configuração pública do Gerador de Bios (sem segredos).
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  // WhatsApp oficial da Tenas Digital (pode ser trocado pela variável TENAS_WHATSAPP no Vercel).
  const whatsapp = String(process.env.TENAS_WHATSAPP || "5583991192672").replace(/\D/g, "");
  return res.status(200).json({
    whatsapp: whatsapp || null,
    whatsappMessage: process.env.TENAS_WHATSAPP_MESSAGE ||
      "Olá! Conheci o gerador de bio da Tenas Digital e gostaria de saber como vocês podem me ajudar a profissionalizar meu Instagram.",
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 10,
    bioLimit: Number(process.env.BIO_CHAR_LIMIT) || 150
  });
}
