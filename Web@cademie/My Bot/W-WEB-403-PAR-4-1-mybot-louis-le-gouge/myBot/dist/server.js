import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import OpenAI from 'openai';
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const port = Number(process.env.PORT || 4000);
const openai = new OpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: 'lm-studio' });
// Health
app.get('/health', (_req, res) => res.json({ ok: true }));
// Create chat
app.post('/chats', async (req, res) => {
    const Body = z.object({ title: z.string().min(1), systemPrompt: z.string().optional() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const chat = await prisma.chat.create({ data: { title: parsed.data.title, systemPrompt: parsed.data.systemPrompt ?? '' } });
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
    if (!chat)
        return res.status(404).json({ error: 'Not found' });
    res.json(chat);
});
// Update pre-prompt
app.patch('/chats/:id/prompt', async (req, res) => {
    const Body = z.object({ systemPrompt: z.string() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const chat = await prisma.chat.update({ where: { id: req.params.id }, data: { systemPrompt: parsed.data.systemPrompt } });
    res.json(chat);
});
// Delete chat (and cascade messages, preferences)
app.delete('/chats/:id', async (req, res) => {
    await prisma.chat.delete({ where: { id: req.params.id } });
    res.status(204).send();
});
// Reset chat (delete messages only)
app.post('/chats/:id/reset', async (req, res) => {
    await prisma.message.deleteMany({ where: { chatId: req.params.id } });
    res.status(204).send();
});
// Upsert preferences
app.put('/chats/:id/preferences', async (req, res) => {
    const Body = z.object({ size: z.string(), housing: z.string(), allergies: z.string().default(''), activity: z.string() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const pref = await prisma.preference.upsert({
        where: { chatId: req.params.id },
        update: parsed.data,
        create: { ...parsed.data, chatId: req.params.id },
    });
    res.json(pref);
});
// Send message and get assistant reply
app.post('/chats/:id/messages', async (req, res) => {
    const Body = z.object({ content: z.string().min(1) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const chat = await prisma.chat.findUnique({ where: { id: req.params.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, preferences: true } });
    if (!chat)
        return res.status(404).json({ error: 'Not found' });
    await prisma.message.create({ data: { chatId: chat.id, role: 'user', content: parsed.data.content } });
    const systemPrompt = chat.systemPrompt || `Tu es Generative Pets, un assistant qui conseille sur l’adoption d’animaux. Utilise les préférences utilisateur si disponibles pour adapter tes conseils. Réponds en français et en format clair.`;
    const prefText = chat.preferences ? `\n\nPréférences utilisateur:\n- Taille: ${chat.preferences.size}\n- Logement: ${chat.preferences.housing}\n- Allergies: ${chat.preferences.allergies}\n- Activité: ${chat.preferences.activity}` : '';
    const history = chat.messages.map((m) => ({ role: m.role, content: m.content }));
    const messages = [
        { role: 'system', content: systemPrompt + prefText },
        ...history,
        { role: 'user', content: parsed.data.content },
    ];
    try {
        const response = await openai.chat.completions.create({
            model: process.env.LLM_MODEL || 'qwen/qwen3-8b',
            messages,
            temperature: 0.4,
        });
        const assistant = response.choices?.[0]?.message?.content ?? '';
        await prisma.message.create({ data: { chatId: chat.id, role: 'assistant', content: assistant } });
        await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
        res.json({ content: assistant });
    }
    catch (err) {
        console.error(err);
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
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const created = await prisma.animalProfile.create({ data: parsed.data });
    res.json(created);
});
// Suggest animals based on preferences
app.get('/chats/:id/suggestions', async (req, res) => {
    const chat = await prisma.chat.findUnique({ where: { id: req.params.id }, include: { preferences: true } });
    if (!chat?.preferences)
        return res.json([]);
    const p = chat.preferences;
    const animals = await prisma.animalProfile.findMany({
        where: {
            size: p.size,
            hypoallergenic: p.allergies.trim().length > 0 ? true : undefined,
            energyLevel: p.activity,
        },
    });
    res.json(animals);
});
app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map