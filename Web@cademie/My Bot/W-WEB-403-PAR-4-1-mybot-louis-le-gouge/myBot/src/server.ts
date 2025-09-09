import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

// Static uploads dir
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const port = Number(process.env.PORT || 4000);

const useGemini = !!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY || 'lm-studio',
  timeout: 30000,
});
const genAI = useGemini ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string) : null;

function buildPlainPrompt(systemPrompt: string, prefText: string, history: { role: string; content: string }[], user: string): string {
  const header = `${systemPrompt}${prefText}\n\nTu dois répondre en une ou deux phrases claires, sans balises <think>, uniquement en texte.`;
  const convLines: string[] = [];
  for (const m of history.slice(-8)) {
    const role = m.role === 'assistant' ? 'Assistant' : 'Utilisateur';
    convLines.push(`${role}: ${m.content}`);
  }
  convLines.push(`Utilisateur: ${user}`);
  convLines.push('Assistant:');
  return `${header}\n\n${convLines.join('\n')}`;
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Create chat
app.post('/chats', async (req, res) => {
  const Body = z.object({ title: z.string().min(1), systemPrompt: z.string().optional() });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const defaultPrompt = `Tu es Generative Pets, expert francophone en adoption d'animaux (chiens, chats, petits mammifères).
- Objectif: conseiller des animaux adaptés au foyer et au mode de vie.
- Intègre toujours les préférences si disponibles (taille, logement, allergies, activité).
- Réponses concises et structurées: puces courtes, informations actionnables (entretien, énergie, compatibilité).
- Format de fiche standard si on te le demande: \nNom (espèce • race) — âge (mois), taille, énergie, hypo (oui/non), bons avec enfants/animaux; besoins; points d'attention.
- Si manque d'infos, pose 1 question utile avant de proposer.`;
  const chat = await prisma.chat.create({ data: { title: parsed.data.title, systemPrompt: parsed.data.systemPrompt ?? defaultPrompt } });
  res.json(chat);
});

// List chats
app.get('/chats', async (_req, res) => {
  const chats = await prisma.chat.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json(chats);
});

// Get one chat with messages and preferences
app.get('/chats/:id', async (req, res) => {
  const chat = await prisma.chat.findUnique({ where: { id: req.params.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, preferences: true } });
  if (!chat) return res.status(404).json({ error: 'Not found' });
  res.json(chat);
});

// Update chat title
app.patch('/chats/:id', async (req, res) => {
  const Body = z.object({ title: z.string().min(1).optional() });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const chat = await prisma.chat.update({ where: { id: req.params.id }, data: { ...parsed.data } });
  res.json(chat);
});

// Update pre-prompt
app.patch('/chats/:id/prompt', async (req, res) => {
  const Body = z.object({ systemPrompt: z.string() });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const chat = await prisma.chat.update({ where: { id: req.params.id }, data: { systemPrompt: parsed.data.systemPrompt } });
  res.json(chat);
});

// Delete chat (and cascade messages, preferences)
app.delete('/chats/:id', async (req, res) => {
  await prisma.chat.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Reset chat (delete messages only)
app.post('/chats/:id/reset', async (_req, res) => {
  await prisma.message.deleteMany({ where: { chatId: _req.params.id } });
  res.status(204).send();
});

// Upsert preferences
app.put('/chats/:id/preferences', async (req, res) => {
  const Body = z.object({ size: z.string(), housing: z.string(), allergies: z.string().default(''), activity: z.string() });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const pref = await prisma.preference.upsert({
    where: { chatId: req.params.id },
    update: parsed.data,
    create: { ...parsed.data, chatId: req.params.id },
  });
  res.json(pref);
});

// Send message and get assistant reply (supports optional image for Gemini)
app.post('/chats/:id/messages', async (req, res) => {
  const Body = z.object({
    content: z.string().default(''),
    imageBase64: z.string().optional(),
    imageMime: z.string().optional().default('image/jpeg'),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const chat = await prisma.chat.findUnique({ where: { id: req.params.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, preferences: true } });
  if (!chat) return res.status(404).json({ error: 'Not found' });

  // Save image locally if provided and store path as a user message
  let imagePathRel: string | null = null;
  if (parsed.data.imageBase64) {
    try {
      const ext = (parsed.data.imageMime || 'image/jpeg').includes('png') ? 'png' : 'jpg';
      const fileName = `${chat.id}-${Date.now()}.${ext}`;
      const filePath = path.join(uploadsDir, fileName);
      const buf = Buffer.from(parsed.data.imageBase64, 'base64');
      fs.writeFileSync(filePath, buf);
      imagePathRel = `/uploads/${fileName}`;
      await prisma.message.create({ data: { chatId: chat.id, role: 'user', content: imagePathRel } });
    } catch (e) {
      console.warn('Failed to save image', e);
    }
  }

  const userText = parsed.data.content && parsed.data.content.trim().length > 0 ? parsed.data.content : (parsed.data.imageBase64 ? 'Analyse cette image.' : '');
  if (userText.trim().length > 0) {
    await prisma.message.create({ data: { chatId: chat.id, role: 'user', content: userText } });
  }

  const systemPrompt = chat.systemPrompt || `Tu es Generative Pets, expert francophone en adoption d'animaux (chiens, chats, petits mammifères).`;
  const prefText = chat.preferences ? `\n\nPréférences utilisateur:\n- Taille: ${chat.preferences.size}\n- Logement: ${chat.preferences.housing}\n- Allergies: ${chat.preferences.allergies}\n- Activité: ${chat.preferences.activity}` : '';

  const history = chat.messages.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })) as ChatCompletionMessageParam[];

  try {
    let assistant = '';
    if (useGemini && genAI) {
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
      const parts: any[] = [];
      parts.push({ text: `${systemPrompt}${prefText}` });
      if (parsed.data.imageBase64) {
        parts.push({ inlineData: { mimeType: parsed.data.imageMime || 'image/jpeg', data: parsed.data.imageBase64 } });
      }
      if (userText.trim().length > 0) {
        parts.push({ text: userText });
      }
      const result = await model.generateContent({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, maxOutputTokens: 256 } });
      assistant = result.response.text();
    } else {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + prefText },
        ...history,
        { role: 'user', content: userText || 'Analyse.' },
      ];
      const response = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'qwen/qwen3-8b',
        messages,
        temperature: 0.4,
        stream: false,
        max_tokens: 256,
        top_p: 0.9,
      });
      assistant = response.choices?.[0]?.message?.content ?? '';
      if (!assistant || assistant.trim() === '') {
        const prompt = buildPlainPrompt(systemPrompt, prefText, chat.messages as any, userText || 'Analyse.');
        const comp = await (openai as any).completions.create({
          model: process.env.LLM_MODEL || 'qwen/qwen3-8b',
          prompt,
          temperature: 0.4,
          max_tokens: 256,
          top_p: 0.9,
          stream: false,
          stop: ['</think>']
        });
        assistant = (comp as any)?.choices?.[0]?.text || '';
      }
    }

    assistant = stripThinkTags(assistant);
    if (!assistant || assistant.trim() === '') {
      assistant = "Désolé, je n'ai pas pu générer de réponse cette fois. Peux-tu reformuler ?";
    }

    await prisma.message.create({ data: { chatId: chat.id, role: 'assistant', content: assistant } });
    await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });

    res.json({ content: assistant, imagePath: imagePathRel });
  } catch (err: any) {
    console.error('LLM error:', err?.status || err?.code, err?.message);
    res.status(500).json({ error: 'LLM error' });
  }
});

// Animal profiles CRUD (basic)
app.get('/animals', async (_req, res) => {
  const animals = await prisma.animalProfile.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(animals);
});

app.post('/animals', async (req, res) => {
  const Body = z.object({
    species: z.string(), name: z.string(), ageMonths: z.number().int().nonnegative(),
    size: z.string(), description: z.string(),
    breed: z.string().optional(), sex: z.string().optional(), imageUrl: z.string().url().optional(),
    goodWithKids: z.boolean().optional(), goodWithPets: z.boolean().optional(), hypoallergenic: z.boolean().optional(),
    energyLevel: z.string(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const created = await prisma.animalProfile.create({ data: parsed.data });
  res.json(created);
});

// Suggest animals based on preferences (refined)
app.get('/chats/:id/suggestions', async (req, res) => {
  const chat = await prisma.chat.findUnique({ where: { id: req.params.id }, include: { preferences: true } });
  if (!chat?.preferences) return res.json([]);
  const p = chat.preferences;

  // Build filters
  const where: any = {};
  if (p.housing === 'apartment') {
    where.size = { in: ['small', 'medium'] };
  } else if (p.size) {
    where.size = p.size;
  }
  if (p.allergies && p.allergies.trim().length > 0) {
    where.hypoallergenic = true;
  }
  if (p.activity === 'low') {
    where.energyLevel = { in: ['low', 'medium'] };
  } else if (p.activity === 'high') {
    where.energyLevel = { in: ['medium', 'high'] };
  } else if (p.activity) {
    where.energyLevel = p.activity;
  }

  const animals = await prisma.animalProfile.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(animals);
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
