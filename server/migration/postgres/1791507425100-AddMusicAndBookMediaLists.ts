import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicAndBookMediaLists1791507425100 implements MigrationInterface {
  name = 'AddMusicAndBookMediaLists1791507425100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD "mbId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD "olId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD "mbId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD "olId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_DB"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_OLID" UNIQUE ("olId", "mediaType", "requestedById")`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_MBID" UNIQUE ("mbId", "mediaType", "requestedById")`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_0f1778025fffbda2d35fcd7fd9c" UNIQUE ("olId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_395d2c341b202bd23e5d75959d2" UNIQUE ("mbId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_395d2c341b202bd23e5d75959d2"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_0f1778025fffbda2d35fcd7fd9c"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_DB"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_MBID"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_OLID"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById")`
    );
    await queryRunner.query(`ALTER TABLE "blocklist" DROP COLUMN "olId"`);
    await queryRunner.query(`ALTER TABLE "blocklist" DROP COLUMN "mbId"`);
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "olId"`);
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "mbId"`);
  }
}
