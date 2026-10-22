import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountCanDownload1792780000086 implements MigrationInterface {
  name = 'AddUserAppAccountCanDownload1792780000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "canDownload" boolean`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "canDownload"`
    );
  }
}
