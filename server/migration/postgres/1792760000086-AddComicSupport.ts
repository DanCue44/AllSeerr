import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComicSupport1792760000086 implements MigrationInterface {
  name = 'AddComicSupport1792760000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_comic" ("id" SERIAL NOT NULL, "comicId" character varying NOT NULL, "kind" character varying NOT NULL, "title" character varying NOT NULL, "alternateTitles" text, "year" integer, "status" character varying, "volumes" integer, "authors" character varying, "overview" text, "coverUrl" character varying, "ageRating" character varying, "isAdult" boolean NOT NULL DEFAULT false, "aniListId" integer, "hardcoverSeriesId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f14b66b28c350a65b9ed5a76d4d" UNIQUE ("comicId"), CONSTRAINT "PK_001070566f5e6239df4d49ae3b6" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD "comicId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD "comicKind" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_575b8d5ab29d853e9183869b74" ON "media" ("comicId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_575b8d5ab29d853e9183869b74"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "comicKind"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "comicId"`);
    await queryRunner.query(`DROP TABLE "metadata_comic"`);
  }
}
