import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTourVersion1791622049516 implements MigrationInterface {
  name = 'AddUserTourVersion1791622049516';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_user_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "locale" varchar NOT NULL DEFAULT (''), "discoverRegion" varchar, "streamingRegion" varchar, "originalLanguage" varchar, "pgpKey" varchar, "discordIds" text, "pushbulletAccessToken" varchar, "pushoverApplicationToken" varchar, "pushoverUserKey" varchar, "pushoverSound" varchar, "telegramChatId" varchar, "telegramSendSilently" boolean, "watchlistSyncMovies" boolean, "watchlistSyncTv" boolean, "notificationTypes" text, "userId" integer, "telegramMessageThreadId" varchar, "accentColor" varchar, "bookLanguage" varchar, "tourVersion" integer, CONSTRAINT "REL_986a2b6d3c05eb4091bb8066f7" UNIQUE ("userId"), CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user_settings"("id", "locale", "discoverRegion", "streamingRegion", "originalLanguage", "pgpKey", "discordIds", "pushbulletAccessToken", "pushoverApplicationToken", "pushoverUserKey", "pushoverSound", "telegramChatId", "telegramSendSilently", "watchlistSyncMovies", "watchlistSyncTv", "notificationTypes", "userId", "telegramMessageThreadId", "accentColor", "bookLanguage") SELECT "id", "locale", "discoverRegion", "streamingRegion", "originalLanguage", "pgpKey", "discordIds", "pushbulletAccessToken", "pushoverApplicationToken", "pushoverUserKey", "pushoverSound", "telegramChatId", "telegramSendSilently", "watchlistSyncMovies", "watchlistSyncTv", "notificationTypes", "userId", "telegramMessageThreadId", "accentColor", "bookLanguage" FROM "user_settings"`
    );
    await queryRunner.query(`DROP TABLE "user_settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_user_settings" RENAME TO "user_settings"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" RENAME TO "temporary_user_settings"`
    );
    await queryRunner.query(
      `CREATE TABLE "user_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "locale" varchar NOT NULL DEFAULT (''), "discoverRegion" varchar, "streamingRegion" varchar, "originalLanguage" varchar, "pgpKey" varchar, "discordIds" text, "pushbulletAccessToken" varchar, "pushoverApplicationToken" varchar, "pushoverUserKey" varchar, "pushoverSound" varchar, "telegramChatId" varchar, "telegramSendSilently" boolean, "watchlistSyncMovies" boolean, "watchlistSyncTv" boolean, "notificationTypes" text, "userId" integer, "telegramMessageThreadId" varchar, "accentColor" varchar, "bookLanguage" varchar, CONSTRAINT "REL_986a2b6d3c05eb4091bb8066f7" UNIQUE ("userId"), CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "user_settings"("id", "locale", "discoverRegion", "streamingRegion", "originalLanguage", "pgpKey", "discordIds", "pushbulletAccessToken", "pushoverApplicationToken", "pushoverUserKey", "pushoverSound", "telegramChatId", "telegramSendSilently", "watchlistSyncMovies", "watchlistSyncTv", "notificationTypes", "userId", "telegramMessageThreadId", "accentColor", "bookLanguage") SELECT "id", "locale", "discoverRegion", "streamingRegion", "originalLanguage", "pgpKey", "discordIds", "pushbulletAccessToken", "pushoverApplicationToken", "pushoverUserKey", "pushoverSound", "telegramChatId", "telegramSendSilently", "watchlistSyncMovies", "watchlistSyncTv", "notificationTypes", "userId", "telegramMessageThreadId", "accentColor", "bookLanguage" FROM "temporary_user_settings"`
    );
    await queryRunner.query(`DROP TABLE "temporary_user_settings"`);
  }
}
