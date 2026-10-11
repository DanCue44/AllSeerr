import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookEbook1791606067257 implements MigrationInterface {
  name = 'AddMetadataBookEbook1791606067257';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_book_ebook" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "olId" varchar NOT NULL, "region" varchar NOT NULL DEFAULT ('US'), "hasEbook" boolean, "volumeId" varchar, "checkedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_0185923f36b987f9ff4d0077be6" UNIQUE ("olId"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "metadata_book_ebook"`);
  }
}
