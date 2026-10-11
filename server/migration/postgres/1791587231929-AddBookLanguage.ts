import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookLanguage1791587231929 implements MigrationInterface {
  name = 'AddBookLanguage1791587231929';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "bookLanguage" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "language" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "language"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "bookLanguage"`
    );
  }
}
