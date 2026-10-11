import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingLimitsToUser1791437548590 implements MigrationInterface {
  name = 'AddRatingLimitsToUser1791437548590';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "movieRatingLimit" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "tvRatingLimit" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "tvRatingLimit"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "movieRatingLimit"`
    );
  }
}
