import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordingToMediaRequest1792159385627 implements MigrationInterface {
  name = 'AddRecordingToMediaRequest1792159385627';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "recording" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "recordingNarrator" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "recordingEditionId" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "recordingBookId" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "recordingBookId"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "recordingEditionId"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "recordingNarrator"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "recording"`
    );
  }
}
