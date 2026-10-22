import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountGrantedBy1792628668300 implements MigrationInterface {
  name = 'AddUserAppAccountGrantedBy1792628668300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD COLUMN "grantedBy" varchar`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "grantedBy"`
    );
  }
}
