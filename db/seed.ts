import { PrismaClient } from "@prisma/client";

(async () => {
  const prisma = new PrismaClient();

  await prisma.user.createMany({
    data: [
      { id: 1, email: "john.doe@test.local", name: "John Doe" },
      { id: 2, email: "zara.nightshade@test.local", name: "Zara Nightshade" },
      { id: 3, email: "ben.matlock@test.local", name: "Ben Matlock" },
    ],
  });

  await prisma.post.createMany({
    data: [
      { published: true, authorId: 1, title: "Quick bites", content: "Easy 5-minute snack recipes" },
      { published: false, authorId: 1, title: "Tech today", content: "Latest gadget news & reviews" },
      { published: true, authorId: 2, title: "Green living", content: "Eco-friendly home hacks" },
    ],
  });

  try {
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
