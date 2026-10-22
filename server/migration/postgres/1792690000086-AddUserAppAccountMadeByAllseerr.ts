import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountMadeByAllseerr1792690000086 implements MigrationInterface {
  name = 'AddUserAppAccountMadeByAllseerr1792690000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "madeByAllseerr" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "madeByAllseerr"`
    );
  }
}
