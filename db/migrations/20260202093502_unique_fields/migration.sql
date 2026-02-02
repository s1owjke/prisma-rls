/*
  Warnings:

  - A unique constraint covering the columns `[title,categoryId]` on the table `Post` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Post_title_categoryId_key" ON "Post"("title", "categoryId");
