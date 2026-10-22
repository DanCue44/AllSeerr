import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountRequestsAndKeys1792680000000 implements MigrationInterface {
  name = 'AddUserAppAccountRequestsAndKeys1792680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD COLUMN "accessRequestedAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD COLUMN "nobookendsToken" text`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD COLUMN "nobookendsTokenId" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "nobookendsTokenId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "nobookendsToken"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "accessRequestedAt"`
    );
  }
}
