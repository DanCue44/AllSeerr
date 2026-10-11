import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookEbook1791606067343 implements MigrationInterface {
  name = 'AddMetadataBookEbook1791606067343';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_book_ebook" ("id" SERIAL NOT NULL, "olId" character varying NOT NULL, "region" character varying NOT NULL DEFAULT 'US', "hasEbook" boolean, "volumeId" character varying, "checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0185923f36b987f9ff4d0077be6" UNIQUE ("olId"), CONSTRAINT "PK_f6231e7efda4861873816af15ca" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "metadata_book_ebook"`);
  }
}
