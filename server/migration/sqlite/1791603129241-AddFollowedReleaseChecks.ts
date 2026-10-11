import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFollowedReleaseChecks1791603129241 implements MigrationInterface {
  name = 'AddFollowedReleaseChecks1791603129241';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, "releasesCheckedAt" datetime, "knownReleaseIds" text, CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_MBID" UNIQUE ("mbId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_OLID" UNIQUE ("olId", "mediaType", "requestedById"), CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "watchlist"`
    );
    await queryRunner.query(`DROP TABLE "watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_watchlist" RENAME TO "watchlist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Followed artists and authors are unknown before this migration
    await queryRunner.query(
      `DELETE FROM "watchlist" WHERE "mediaType" IN ('artist', 'author')`
    );
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" RENAME TO "temporary_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_MBID" UNIQUE ("mbId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_OLID" UNIQUE ("olId", "mediaType", "requestedById"), CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "temporary_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_watchlist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
  }
}
