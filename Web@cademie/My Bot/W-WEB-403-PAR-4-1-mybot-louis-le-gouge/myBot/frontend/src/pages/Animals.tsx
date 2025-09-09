import { useEffect, useState } from 'react';
import { listAnimals } from '../lib/api';
import api from '../lib/api';

type AnimalForm = {
  species: string; name: string; ageMonths: number; size: string; description: string;
  breed?: string; sex?: string; imageUrl?: string; goodWithKids?: boolean; goodWithPets?: boolean; hypoallergenic?: boolean; energyLevel: string;
};

export default function AnimalsPage() {
  const [animals, setAnimals] = useState<any[]>([]);
  const [form, setForm] = useState<AnimalForm>({ species: 'dog', name: '', ageMonths: 12, size: 'medium', description: '', energyLevel: 'medium' });
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const data = await listAnimals();
    setAnimals(data);
  }

  useEffect(() => { refresh(); }, []);

  async function create() {
    setLoading(true);
    await api.post('/animals', form);
    setForm({ species: 'dog', name: '', ageMonths: 12, size: 'medium', description: '', energyLevel: 'medium' });
    await refresh();
    setLoading(false);
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Fiches Animaux</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
        <label>Espèce
          <select value={form.species} onChange={e => setForm({ ...form, species: e.target.value })}>
            <option value="dog">dog</option>
            <option value="cat">cat</option>
            <option value="rabbit">rabbit</option>
          </select>
        </label>
        <label>Nom
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>Âge (mois)
          <input type="number" value={form.ageMonths} onChange={e => setForm({ ...form, ageMonths: Number(e.target.value) })} />
        </label>
        <label>Taille
          <select value={form.size} onChange={e => setForm({ ...form, size: e.target.value })}>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large">large</option>
          </select>
        </label>
        <label>Race
          <input value={form.breed || ''} onChange={e => setForm({ ...form, breed: e.target.value })} />
        </label>
        <label>Sexe
          <select value={form.sex || ''} onChange={e => setForm({ ...form, sex: e.target.value })}>
            <option value="">-</option>
            <option value="male">male</option>
            <option value="female">female</option>
          </select>
        </label>
        <label>Image URL
          <input value={form.imageUrl || ''} onChange={e => setForm({ ...form, imageUrl: e.target.value })} />
        </label>
        <label>Hypoallergénique
          <input type="checkbox" checked={!!form.hypoallergenic} onChange={e => setForm({ ...form, hypoallergenic: e.target.checked })} />
        </label>
        <label>Avec enfants
          <input type="checkbox" checked={!!form.goodWithKids} onChange={e => setForm({ ...form, goodWithKids: e.target.checked })} />
        </label>
        <label>Avec animaux
          <input type="checkbox" checked={!!form.goodWithPets} onChange={e => setForm({ ...form, goodWithPets: e.target.checked })} />
        </label>
        <label>Énergie
          <select value={form.energyLevel} onChange={e => setForm({ ...form, energyLevel: e.target.value })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label>Description
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>
      <button onClick={create} disabled={loading} style={{ marginTop: 8 }}>Créer</button>

      <h3 style={{ marginTop: 16 }}>Liste</h3>
      <div className="cards">
        {animals.map(a => (
          <div key={a.id} className="card">
            <img src={a.imageUrl || 'https://placehold.co/300x200'} />
            <div>
              <h4>{a.name} ({a.species})</h4>
              <p>{a.description}</p>
              <small>{a.size} • {a.energyLevel} • Hypo: {a.hypoallergenic ? 'oui' : 'non'}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 