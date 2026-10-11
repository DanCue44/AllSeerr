import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookAudio1791513958750 implements MigrationInterface {
  name = 'AddMetadataBookAudio1791513958750';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_book_audio" ("id" SERIAL NOT NULL, "olId" character varying NOT NULL, "region" character varying NOT NULL DEFAULT 'us', "hasAudiobook" boolean NOT NULL, "asin" character varying, "checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b49f137c89f7d839d1d52fdf92d" UNIQUE ("olId"), CONSTRAINT "PK_89300e09903ef82f562dd5e1f0a" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "metadata_book_audio"`);
  }
}
