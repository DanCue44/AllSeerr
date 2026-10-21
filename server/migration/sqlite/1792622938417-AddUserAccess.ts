import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccess1792622938417 implements MigrationInterface {
  name = 'AddUserAccess1792622938417';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "access_invite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tokenHash" varchar NOT NULL, "label" varchar, "apps" text NOT NULL, "ageLimit" varchar, "includeUnrated" boolean NOT NULL DEFAULT (0), "expiresAt" datetime NOT NULL, "redeemedAt" datetime, "revokedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdById" integer, "redeemedById" integer, CONSTRAINT "FK_c0f39133b8d710c8ec8918b6cf3" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_064e630a8ca54e235a29e8ea4b5" FOREIGN KEY ("redeemedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7d45b41a79411cd18e1c8b0a8a" ON "access_invite" ("tokenHash") `
    );
    await queryRunner.query(
      `CREATE TABLE "oidc_payload" ("id" varchar NOT NULL, "model" varchar NOT NULL, "payload" text NOT NULL, "grantId" varchar, "uid" varchar, "userCode" varchar, "expiresAt" datetime, "consumedAt" datetime, PRIMARY KEY ("id", "model"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9cad997175eb354e1578fce0c" ON "oidc_payload" ("grantId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_057f263a02526a21a3714216df" ON "oidc_payload" ("uid") `
    );
    await queryRunner.query(
      `CREATE TABLE "user_access_profile" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ageLimit" varchar, "includeUnrated" boolean NOT NULL DEFAULT (0), "userId" integer NOT NULL, CONSTRAINT "REL_6fb36a351ba9182cf60065a917" UNIQUE ("userId"), CONSTRAINT "FK_6fb36a351ba9182cf60065a917c" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE TABLE "user_app_account" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "app" varchar NOT NULL, "enabled" boolean NOT NULL DEFAULT (0), "libraryIds" text, "remoteUserId" varchar, "remoteUsername" varchar, "status" varchar NOT NULL DEFAULT ('none'), "lastError" text, "syncedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer NOT NULL, CONSTRAINT "UQ_user_app_account_user_app" UNIQUE ("userId", "app"), CONSTRAINT "FK_992400114abae376819f55102a7" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_992400114abae376819f55102a" ON "user_app_account" ("userId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_992400114abae376819f55102a"`);
    await queryRunner.query(`DROP TABLE "user_app_account"`);
    await queryRunner.query(`DROP TABLE "user_access_profile"`);
    await queryRunner.query(`DROP INDEX "IDX_057f263a02526a21a3714216df"`);
    await queryRunner.query(`DROP INDEX "IDX_b9cad997175eb354e1578fce0c"`);
    await queryRunner.query(`DROP TABLE "oidc_payload"`);
    await queryRunner.query(`DROP INDEX "IDX_7d45b41a79411cd18e1c8b0a8a"`);
    await queryRunner.query(`DROP TABLE "access_invite"`);
  }
}
