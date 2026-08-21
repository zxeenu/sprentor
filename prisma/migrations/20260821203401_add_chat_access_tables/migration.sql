/*
  Warnings:

  - You are about to drop the column `chat_id` on the `ChatAccessGrant` table. All the data in the column will be lost.
  - You are about to drop the column `user_name` on the `ChatAccessGrant` table. All the data in the column will be lost.
  - Added the required column `action_at` to the `ChatAccessGrant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `action_by_user_id` to the `ChatAccessGrant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `granted_chat_id` to the `ChatAccessGrant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `ChatAccessGrant` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatAccessGrant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "granted_user_name" TEXT,
    "granted_user_id" TEXT,
    "granted_chat_id" TEXT NOT NULL,
    "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action_slug" TEXT NOT NULL,
    "action_by_user_id" TEXT NOT NULL,
    "action_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "deleted_by_user_id" DATETIME,
    "updated_at" DATETIME NOT NULL,
    "remarks" TEXT
);
INSERT INTO "new_ChatAccessGrant" ("action_slug", "deleted_at", "id") SELECT "action_slug", "deleted_at", "id" FROM "ChatAccessGrant";
DROP TABLE "ChatAccessGrant";
ALTER TABLE "new_ChatAccessGrant" RENAME TO "ChatAccessGrant";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
