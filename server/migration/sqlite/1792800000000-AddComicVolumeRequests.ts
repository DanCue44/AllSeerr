import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComicVolumeRequests1792800000000 implements MigrationInterface {
  name = 'AddComicVolumeRequests1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "comicVolumes" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "comicVolumes"`
    );
  }
}
