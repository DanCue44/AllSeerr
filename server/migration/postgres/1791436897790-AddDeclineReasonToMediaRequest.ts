import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeclineReasonToMediaRequest1791436897790 implements MigrationInterface {
  name = 'AddDeclineReasonToMediaRequest1791436897790';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "declineReason" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "declineReason"`
    );
  }
}
