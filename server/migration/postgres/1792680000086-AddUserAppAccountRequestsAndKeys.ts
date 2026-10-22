import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountRequestsAndKeys1792680000086 implements MigrationInterface {
  name = 'AddUserAppAccountRequestsAndKeys1792680000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "accessRequestedAt" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "nobookendsToken" text`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "nobookendsTokenId" character varying`
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
