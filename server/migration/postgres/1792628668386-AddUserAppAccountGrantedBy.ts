import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppAccountGrantedBy1792628668386 implements MigrationInterface {
  name = 'AddUserAppAccountGrantedBy1792628668386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD "grantedBy" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP COLUMN "grantedBy"`
    );
  }
}
