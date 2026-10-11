import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicAndBookFavorites1791564832250 implements MigrationInterface {
  name = 'AddMusicAndBookFavorites1791564832250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD "mbId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD "olId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "UNIQUE_USER_FAVORITE"`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "UNIQUE_USER_FAVORITE_OLID" UNIQUE ("userId", "olId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "UNIQUE_USER_FAVORITE_MBID" UNIQUE ("userId", "mbId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "UNIQUE_USER_FAVORITE"`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "UNIQUE_USER_FAVORITE_MBID"`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "UNIQUE_USER_FAVORITE_OLID"`
    );
    await queryRunner.query(`DELETE FROM "favorite" WHERE "tmdbId" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "favorite" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType")`
    );
    await queryRunner.query(`ALTER TABLE "favorite" DROP COLUMN "olId"`);
    await queryRunner.query(`ALTER TABLE "favorite" DROP COLUMN "mbId"`);
  }
}
