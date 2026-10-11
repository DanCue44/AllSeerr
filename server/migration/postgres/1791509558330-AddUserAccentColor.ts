import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccentColor1791509558330 implements MigrationInterface {
  name = 'AddUserAccentColor1791509558330';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "accentColor" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "accentColor"`
    );
  }
}
