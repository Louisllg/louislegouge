import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing animals
  await prisma.animalProfile.deleteMany();

  await prisma.animalProfile.createMany({ data: [
    {
      species: 'dog', name: 'Bella', breed: 'Labrador Retriever', ageMonths: 24,
      sex: 'female', size: 'large', goodWithKids: true, goodWithPets: true,
      hypoallergenic: false, energyLevel: 'high', description: 'Joueuse, aime les balades quotidiennes.', imageUrl: 'https://placehold.co/400x300?text=Bella'
    },
    {
      species: 'dog', name: 'Milo', breed: 'Poodle', ageMonths: 36,
      sex: 'male', size: 'medium', goodWithKids: true, goodWithPets: true,
      hypoallergenic: true, energyLevel: 'medium', description: 'Très affectueux, facile à éduquer.', imageUrl: 'https://placehold.co/400x300?text=Milo'
    },
    {
      species: 'cat', name: 'Luna', breed: 'Siberian', ageMonths: 18,
      sex: 'female', size: 'small', goodWithKids: true, goodWithPets: false,
      hypoallergenic: true, energyLevel: 'medium', description: 'Calme à la maison, aime jouer.', imageUrl: 'https://placehold.co/400x300?text=Luna'
    },
    {
      species: 'cat', name: 'Simba', breed: 'European Shorthair', ageMonths: 30,
      sex: 'male', size: 'small', goodWithKids: true, goodWithPets: true,
      hypoallergenic: false, energyLevel: 'low', description: 'Indépendant, idéal pour appartement.', imageUrl: 'https://placehold.co/400x300?text=Simba'
    },
    {
      species: 'rabbit', name: 'Coco', breed: 'Lop', ageMonths: 12,
      sex: 'female', size: 'small', goodWithKids: true, goodWithPets: true,
      hypoallergenic: true, energyLevel: 'low', description: 'Très doux, aime être brossé.', imageUrl: 'https://placehold.co/400x300?text=Coco'
    }
  ]});
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed done.');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
