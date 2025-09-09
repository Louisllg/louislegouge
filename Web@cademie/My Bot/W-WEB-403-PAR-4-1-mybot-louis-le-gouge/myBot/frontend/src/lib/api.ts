import axios from 'axios';

const envUrl = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
const w = typeof window !== 'undefined' ? window : undefined;
const proto = (w?.location?.protocol ?? 'http:');
const host = (w?.location?.hostname ?? 'localhost');
const defaultBase = `${proto}//${host}:4000`;
const baseURL = envUrl || defaultBase;
const api = axios.create({ baseURL, timeout: 30000 });

export default api;

export type Chat = {
  id: string; title: string; systemPrompt: string; createdAt: string; updatedAt: string;
};

export type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string };
export type Preference = { id: string; chatId: string; size: string; housing: string; allergies: string; activity: string; updatedAt: string };
export type Animal = { id: string; species: string; breed?: string | null; name: string; ageMonths: number; sex?: string | null; size: string; goodWithKids: boolean; goodWithPets: boolean; hypoallergenic: boolean; energyLevel: string; description: string; imageUrl?: string | null; createdAt: string };

export async function listChats() { return (await api.get<Chat[]>('/chats')).data; }
export async function createChat(title: string, systemPrompt?: string) { return (await api.post<Chat>('/chats', { title, systemPrompt })).data; }
export async function getChat(id: string) { return (await api.get<{ id: string; title: string; systemPrompt: string; messages: Message[]; preferences?: Preference }>(`/chats/${id}`)).data; }
export async function updatePrompt(id: string, systemPrompt: string) { return (await api.patch<Chat>(`/chats/${id}/prompt`, { systemPrompt })).data; }
export async function updateTitle(id: string, title: string) { return (await api.patch<Chat>(`/chats/${id}`, { title })).data; }
export async function resetChat(id: string) { await api.post(`/chats/${id}/reset`); }
export async function deleteChat(id: string) { await api.delete(`/chats/${id}`); }

export async function putPreferences(id: string, pref: Omit<Preference,'id'|'chatId'|'updatedAt'>) { return (await api.put<Preference>(`/chats/${id}/preferences`, pref)).data; }
export async function sendMessage(id: string, content: string, imageBase64?: string, imageMime?: string) {
  return (await api.post<{ content: string; imagePath?: string | null }>(`/chats/${id}/messages`, { content, imageBase64, imageMime })).data;
}
export async function getSuggestions(id: string) { return (await api.get<Animal[]>(`/chats/${id}/suggestions`)).data; }
export async function listAnimals() { return (await api.get<Animal[]>('/animals')).data; }
