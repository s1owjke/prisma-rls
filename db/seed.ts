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

  await prisma.category.createMany({
    data: [
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ],
  });

  await prisma.post.createMany({
    data: [
      { id: 1, published: true, categoryId: 1, authorId: 1, title: "Quick bites", content: "Easy 5-minute snack recipes" },
      { id: 2, published: false, categoryId: 1, authorId: 1, title: "Tech today", content: "Latest gadget news & reviews" },
      { id: 3, published: true, categoryId: 2, authorId: 2, title: "Green living", content: "Eco-friendly home hacks" },
    ],
  });

  await prisma.comment.createMany({
    data: [
      { postId: 1, content: "Easy 5-minute snack recipes" },
      { postId: 2, content: "Latest gadget news & reviews" },
      { postId: 3, content: "Eco-friendly home hacks" },
    ],
  });

  try {
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
