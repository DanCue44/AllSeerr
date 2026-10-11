import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicAndBookMediaLists1791507373605 implements MigrationInterface {
  name = 'AddMusicAndBookMediaLists1791507373605';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId" FROM "watchlist"`
    );
    await queryRunner.query(`DROP TABLE "watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_watchlist" RENAME TO "watchlist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer NOT NULL, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType"), CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId" FROM "blocklist"`
    );
    await queryRunner.query(`DROP TABLE "blocklist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_blocklist" RENAME TO "blocklist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "watchlist"`
    );
    await queryRunner.query(`DROP TABLE "watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_watchlist" RENAME TO "watchlist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "watchlist"`
    );
    await queryRunner.query(`DROP TABLE "watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_watchlist" RENAME TO "watchlist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer NOT NULL, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "blocklist"`
    );
    await queryRunner.query(`DROP TABLE "blocklist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_blocklist" RENAME TO "blocklist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "blocklist"`
    );
    await queryRunner.query(`DROP TABLE "blocklist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_blocklist" RENAME TO "blocklist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UNIQUE_USER_OLID" UNIQUE ("olId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_MBID" UNIQUE ("mbId", "mediaType", "requestedById"), CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "watchlist"`
    );
    await queryRunner.query(`DROP TABLE "watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_watchlist" RENAME TO "watchlist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "UQ_0f1778025fffbda2d35fcd7fd9c" UNIQUE ("olId", "mediaType"), CONSTRAINT "UQ_395d2c341b202bd23e5d75959d2" UNIQUE ("mbId", "mediaType"), CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "blocklist"`
    );
    await queryRunner.query(`DROP TABLE "blocklist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_blocklist" RENAME TO "blocklist"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(
      `ALTER TABLE "blocklist" RENAME TO "temporary_blocklist"`
    );
    await queryRunner.query(
      `CREATE TABLE "blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "temporary_blocklist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_blocklist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" RENAME TO "temporary_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "temporary_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_watchlist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(
      `ALTER TABLE "blocklist" RENAME TO "temporary_blocklist"`
    );
    await queryRunner.query(
      `CREATE TABLE "blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer NOT NULL, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "temporary_blocklist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_blocklist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(
      `ALTER TABLE "blocklist" RENAME TO "temporary_blocklist"`
    );
    await queryRunner.query(
      `CREATE TABLE "blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer NOT NULL, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType"), CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId", "mbId", "olId" FROM "temporary_blocklist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_blocklist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" RENAME TO "temporary_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "temporary_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_watchlist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" RENAME TO "temporary_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, "mbId" varchar, "olId" varchar, CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId", "mbId", "olId" FROM "temporary_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_watchlist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_939f205946256cc0d2a1ac51a8" ON "watchlist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae34e6b153a90672eb9dc4857d" ON "watchlist" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6641da8d831b93dfcb429f8b8b" ON "watchlist" ("mediaId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_356721a49f145aa439c16e6b99"`);
    await queryRunner.query(`DROP INDEX "IDX_09b94c932e84635c5461f3c0a9"`);
    await queryRunner.query(
      `ALTER TABLE "blocklist" RENAME TO "temporary_blocklist"`
    );
    await queryRunner.query(
      `CREATE TABLE "blocklist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "mediaType" varchar NOT NULL, "title" varchar, "tmdbId" integer NOT NULL, "blocklistedTags" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, "mediaId" integer, CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType"), CONSTRAINT "REL_62b7ade94540f9f8d8bede54b9" UNIQUE ("mediaId"), CONSTRAINT "FK_356721a49f145aa439c16e6b999" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_5c8af2d0e83b3be6d250eccc19d" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "blocklist"("id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId") SELECT "id", "mediaType", "title", "tmdbId", "blocklistedTags", "createdAt", "userId", "mediaId" FROM "temporary_blocklist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_blocklist"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_356721a49f145aa439c16e6b99" ON "blocklist" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_09b94c932e84635c5461f3c0a9" ON "blocklist" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_939f205946256cc0d2a1ac51a8"`);
    await queryRunner.query(`DROP INDEX "IDX_ae34e6b153a90672eb9dc4857d"`);
    await queryRunner.query(`DROP INDEX "IDX_6641da8d831b93dfcb429f8b8b"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" RENAME TO "temporary_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ratingKey" varchar NOT NULL, "mediaType" varchar NOT NULL, "title" varchar NOT NULL, "tmdbId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestedById" integer, "mediaId" integer, CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById"), CONSTRAINT "FK_ae34e6b153a90672eb9dc4857d7" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6641da8d831b93dfcb429f8b8bc" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "watchlist"("id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId") SELECT "id", "ratingKey", "mediaType", "title", "tmdbId", "createdAt", "updatedAt", "requestedById", "mediaId" FROM "temporary_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_watchlist"`);
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
}
