-- CreateTable
CREATE TABLE "ChatAccessGrant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_name" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "action_slug" TEXT NOT NULL,
    "deleted_at" DATETIME
);
