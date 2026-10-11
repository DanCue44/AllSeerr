import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicAndBookQuotas1791507165960 implements MigrationInterface {
  name = 'AddMusicAndBookQuotas1791507165960';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "musicQuotaLimit" integer`);
    await queryRunner.query(`ALTER TABLE "user" ADD "musicQuotaDays" integer`);
    await queryRunner.query(`ALTER TABLE "user" ADD "bookQuotaLimit" integer`);
    await queryRunner.query(`ALTER TABLE "user" ADD "bookQuotaDays" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "bookQuotaDays"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "bookQuotaLimit"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "musicQuotaDays"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "musicQuotaLimit"`);
  }
}
