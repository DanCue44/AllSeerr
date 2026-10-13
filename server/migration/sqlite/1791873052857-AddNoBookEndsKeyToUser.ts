import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoBookEndsKeyToUser1791873052857 implements MigrationInterface {
  name = 'AddNoBookEndsKeyToUser1791873052857';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dd64a292356555291de5d6635b"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar, "plexId" integer, "plexToken" varchar, "permissions" integer NOT NULL DEFAULT (0), "avatar" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "password" varchar, "userType" integer NOT NULL DEFAULT (1), "plexUsername" varchar, "resetPasswordGuid" varchar, "recoveryLinkExpirationDate" datetime, "movieQuotaLimit" integer, "movieQuotaDays" integer, "tvQuotaLimit" integer, "tvQuotaDays" integer, "jellyfinUsername" varchar, "jellyfinAuthToken" varchar, "jellyfinUserId" varchar, "jellyfinDeviceId" varchar, "avatarETag" varchar, "avatarVersion" varchar, "apiKeyHash" varchar, "apiKeyCreatedAt" datetime, "movieRatingLimit" varchar, "tvRatingLimit" varchar, "musicQuotaLimit" integer, "musicQuotaDays" integer, "bookQuotaLimit" integer, "bookQuotaDays" integer, "nobookendsKeyHash" varchar, "nobookendsKeyCreatedAt" datetime, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user"("id", "email", "username", "plexId", "plexToken", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "plexUsername", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion", "apiKeyHash", "apiKeyCreatedAt", "movieRatingLimit", "tvRatingLimit", "musicQuotaLimit", "musicQuotaDays", "bookQuotaLimit", "bookQuotaDays") SELECT "id", "email", "username", "plexId", "plexToken", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "plexUsername", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion", "apiKeyHash", "apiKeyCreatedAt", "movieRatingLimit", "tvRatingLimit", "musicQuotaLimit", "musicQuotaDays", "bookQuotaLimit", "bookQuotaDays" FROM "user"`
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dd64a292356555291de5d6635b" ON "user" ("apiKeyHash") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a45163b28e7eaf2b3b447272d" ON "user" ("nobookendsKeyHash") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_0a45163b28e7eaf2b3b447272d"`);
    await queryRunner.query(`DROP INDEX "IDX_dd64a292356555291de5d6635b"`);
    await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "username" varchar, "plexId" integer, "plexToken" varchar, "permissions" integer NOT NULL DEFAULT (0), "avatar" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "password" varchar, "userType" integer NOT NULL DEFAULT (1), "plexUsername" varchar, "resetPasswordGuid" varchar, "recoveryLinkExpirationDate" datetime, "movieQuotaLimit" integer, "movieQuotaDays" integer, "tvQuotaLimit" integer, "tvQuotaDays" integer, "jellyfinUsername" varchar, "jellyfinAuthToken" varchar, "jellyfinUserId" varchar, "jellyfinDeviceId" varchar, "avatarETag" varchar, "avatarVersion" varchar, "apiKeyHash" varchar, "apiKeyCreatedAt" datetime, "movieRatingLimit" varchar, "tvRatingLimit" varchar, "musicQuotaLimit" integer, "musicQuotaDays" integer, "bookQuotaLimit" integer, "bookQuotaDays" integer, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`
    );
    await queryRunner.query(
      `INSERT INTO "user"("id", "email", "username", "plexId", "plexToken", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "plexUsername", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion", "apiKeyHash", "apiKeyCreatedAt", "movieRatingLimit", "tvRatingLimit", "musicQuotaLimit", "musicQuotaDays", "bookQuotaLimit", "bookQuotaDays") SELECT "id", "email", "username", "plexId", "plexToken", "permissions", "avatar", "createdAt", "updatedAt", "password", "userType", "plexUsername", "resetPasswordGuid", "recoveryLinkExpirationDate", "movieQuotaLimit", "movieQuotaDays", "tvQuotaLimit", "tvQuotaDays", "jellyfinUsername", "jellyfinAuthToken", "jellyfinUserId", "jellyfinDeviceId", "avatarETag", "avatarVersion", "apiKeyHash", "apiKeyCreatedAt", "movieRatingLimit", "tvRatingLimit", "musicQuotaLimit", "musicQuotaDays", "bookQuotaLimit", "bookQuotaDays" FROM "temporary_user"`
    );
    await queryRunner.query(`DROP TABLE "temporary_user"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dd64a292356555291de5d6635b" ON "user" ("apiKeyHash") `
    );
  }
}
