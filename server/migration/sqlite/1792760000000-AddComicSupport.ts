import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComicSupport1792760000000 implements MigrationInterface {
  name = 'AddComicSupport1792760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_comic" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "comicId" varchar NOT NULL, "kind" varchar NOT NULL, "title" varchar NOT NULL, "alternateTitles" text, "year" integer, "status" varchar, "volumes" integer, "authors" varchar, "overview" text, "coverUrl" varchar, "ageRating" varchar, "isAdult" boolean NOT NULL DEFAULT (0), "aniListId" integer, "hardcoverSeriesId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_f14b66b28c350a65b9ed5a76d4d" UNIQUE ("comicId"))`
    );
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "comicId" varchar`);
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "comicKind" varchar`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_575b8d5ab29d853e9183869b74" ON "media" ("comicId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_575b8d5ab29d853e9183869b74"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "comicKind"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "comicId"`);
    await queryRunner.query(`DROP TABLE "metadata_comic"`);
  }
}
