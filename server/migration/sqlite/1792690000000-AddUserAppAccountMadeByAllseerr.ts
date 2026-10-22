import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountMadeByAllseerr1792690000000 implements MigrationInterface {
  name = 'AddUserAppAccountMadeByAllseerr1792690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD COLUMN "madeByAllseerr" boolean NOT NULL DEFAULT (0)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "madeByAllseerr"`
    );
  }
}
