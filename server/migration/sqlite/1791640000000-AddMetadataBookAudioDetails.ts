import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookAudioDetails1791640000000 implements MigrationInterface {
  name = 'AddMetadataBookAudioDetails1791640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_metadata_book_audio" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "olId" varchar NOT NULL, "region" varchar NOT NULL DEFAULT ('us'), "hasAudiobook" boolean NOT NULL, "asin" varchar, "checkedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "narrators" text, "runtimeMinutes" integer, "coverUrl" varchar, CONSTRAINT "UQ_b49f137c89f7d839d1d52fdf92d" UNIQUE ("olId"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_metadata_book_audio"("id", "olId", "region", "hasAudiobook", "asin", "checkedAt", "createdAt") SELECT "id", "olId", "region", "hasAudiobook", "asin", "checkedAt", "createdAt" FROM "metadata_book_audio"`
    );
    await queryRunner.query(`DROP TABLE "metadata_book_audio"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_metadata_book_audio" RENAME TO "metadata_book_audio"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" RENAME TO "temporary_metadata_book_audio"`
    );
    await queryRunner.query(
      `CREATE TABLE "metadata_book_audio" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "olId" varchar NOT NULL, "region" varchar NOT NULL DEFAULT ('us'), "hasAudiobook" boolean NOT NULL, "asin" varchar, "checkedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b49f137c89f7d839d1d52fdf92d" UNIQUE ("olId"))`
    );
    await queryRunner.query(
      `INSERT INTO "metadata_book_audio"("id", "olId", "region", "hasAudiobook", "asin", "checkedAt", "createdAt") SELECT "id", "olId", "region", "hasAudiobook", "asin", "checkedAt", "createdAt" FROM "temporary_metadata_book_audio"`
    );
    await queryRunner.query(`DROP TABLE "temporary_metadata_book_audio"`);
  }
}
