import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookAudioDetails1791640000086 implements MigrationInterface {
  name = 'AddMetadataBookAudioDetails1791640000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" ADD "narrators" text`
    );
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" ADD "runtimeMinutes" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" ADD "coverUrl" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" DROP COLUMN "coverUrl"`
    );
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" DROP COLUMN "runtimeMinutes"`
    );
    await queryRunner.query(
      `ALTER TABLE "metadata_book_audio" DROP COLUMN "narrators"`
    );
  }
}
