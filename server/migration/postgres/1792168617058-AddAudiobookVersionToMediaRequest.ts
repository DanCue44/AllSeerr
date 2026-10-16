import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAudiobookVersionToMediaRequest1792168617058 implements MigrationInterface {
  name = 'AddAudiobookVersionToMediaRequest1792168617058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "audiobookVersion" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "audiobookVersion"`
    );
  }
}
