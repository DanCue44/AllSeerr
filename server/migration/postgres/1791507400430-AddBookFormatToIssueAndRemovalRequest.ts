import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookFormatToIssueAndRemovalRequest1791507400430 implements MigrationInterface {
  name = 'AddBookFormatToIssueAndRemovalRequest1791507400430';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issue" ADD "bookFormat" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" ADD "bookFormat" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "removal_request" DROP COLUMN "bookFormat"`
    );
    await queryRunner.query(`ALTER TABLE "issue" DROP COLUMN "bookFormat"`);
  }
}
