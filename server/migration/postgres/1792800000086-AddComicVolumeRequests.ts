import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComicVolumeRequests1792800000086 implements MigrationInterface {
  name = 'AddComicVolumeRequests1792800000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "comicVolumes" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "comicVolumes"`
    );
  }
}
