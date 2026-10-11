import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicSupport1791462840786 implements MigrationInterface {
  name = 'AddMusicSupport1791462840786';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_album" ("id" SERIAL NOT NULL, "mbAlbumId" character varying NOT NULL, "caaUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fb8eda254e560f96039f7a0d812" UNIQUE ("mbAlbumId"), CONSTRAINT "PK_02aaaa276bcc3de3ead4bd2b8f3" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "metadata_artist" ("id" SERIAL NOT NULL, "mbArtistId" character varying NOT NULL, "tmdbPersonId" character varying, "tmdbThumb" character varying, "tmdbUpdatedAt" TIMESTAMP WITH TIME ZONE, "tadbThumb" character varying, "tadbCover" character varying, "tadbUpdatedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_bff8b9448b4a8a3af0f8957d4b7" UNIQUE ("mbArtistId"), CONSTRAINT "PK_06d683fc350297c5aef7f0fe5c4" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "override_rule" ADD "lidarrServiceId" integer`
    );
    await queryRunner.query(`ALTER TABLE "media" ADD "mbId" character varying`);
    await queryRunner.query(
      `ALTER TABLE "media" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6c866e76dd595ad15b8c5bf9c1" ON "media" ("mbId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6c866e76dd595ad15b8c5bf9c1"`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "mbId"`);
    await queryRunner.query(
      `ALTER TABLE "override_rule" DROP COLUMN "lidarrServiceId"`
    );
    await queryRunner.query(`DROP TABLE "metadata_artist"`);
    await queryRunner.query(`DROP TABLE "metadata_album"`);
  }
}
