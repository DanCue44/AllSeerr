import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoApproveToOverrideRule1791438249144 implements MigrationInterface {
  name = 'AddAutoApproveToOverrideRule1791438249144';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "override_rule" ADD "autoApprove" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "override_rule" ADD "maxSeasons" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "override_rule" DROP COLUMN "maxSeasons"`
    );
    await queryRunner.query(
      `ALTER TABLE "override_rule" DROP COLUMN "autoApprove"`
    );
  }
}
