import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTourVersion1791622049602 implements MigrationInterface {
  name = 'AddUserTourVersion1791622049602';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "tourVersion" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "tourVersion"`
    );
  }
}
